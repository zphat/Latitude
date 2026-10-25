// Small release updater shared by Windows, portable ZIPs and Flatpak.
// Only published Latitude assets are accepted; nothing installs on quit.
const fs = require('node:fs/promises');
const {createWriteStream,createReadStream} = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const {Readable,Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const API = 'https://api.github.com/repos/zphat/Latitude/releases?per_page=30';
const RELEASES = 'https://github.com/zphat/Latitude/releases';
const MAX_FILE = 1024 ** 3;
function version(value) {
  if (typeof value !== 'string') return null;
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!m || m.slice(1,4).some(x=>!Number.isSafeInteger(Number(x)))) return null;
  const pre = m[4]?.split('.') || [];
  if (pre.some(x=>/^\d+$/.test(x) && (x.length > 1 && x[0] === '0' || !Number.isSafeInteger(Number(x))))) return null;
  return {core:m.slice(1,4).map(Number),pre};
}
function compare(a,b) {
  a=version(a);b=version(b);if(!a||!b)throw Error('Invalid release version.');
  for(let i=0;i<3;i++)if(a.core[i]!==b.core[i])return Math.sign(a.core[i]-b.core[i]);
  if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
  for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){
    const x=a.pre[i],y=b.pre[i];if(x===y)continue;if(x===undefined)return -1;if(y===undefined)return 1;
    const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn)return Math.sign(Number(x)-Number(y));if(xn!==yn)return xn?-1:1;return x<y?-1:1;
  }return 0;
}
function artifact(ver,mode) {
  return mode==='windows'?`Latitude-${ver}-Windows-x64-Setup.exe`:mode==='portable'?`Latitude-${ver}-Windows-x64.zip`:mode==='flatpak'?`Latitude-${ver}-Linux-x86_64.flatpak`:null;
}
function selectRelease(releases,current,mode) {
  if(!Array.isArray(releases)||!version(current))throw Error('The update service returned invalid release information.');
  const beta=current.startsWith('0.')||current.includes('-');
  return releases.filter(r=>r&&typeof r==='object'&&!r.draft&&(!r.prerelease||beta)&&/^v/.test(r.tag_name||'')&&version(r.tag_name.slice(1))&&compare(r.tag_name.slice(1),current)>0)
    .sort((a,b)=>compare(b.tag_name.slice(1),a.tag_name.slice(1)))
    .map(r=>{
      const ver=r.tag_name.slice(1), name=artifact(ver,mode),base=`${RELEASES}/download/${r.tag_name}/`;
      const pick=n=>(Array.isArray(r.assets)?r.assets:[]).find(a=>a&&a.name===n&&a.state==='uploaded'&&a.browser_download_url===base+n&&Number.isSafeInteger(a.size)&&a.size>0);
      const file=pick(name),sums=pick('SHA256SUMS.txt');
      if(!file||!sums||file.size>MAX_FILE||sums.size>256*1024)return null;
      return {version:ver,name,size:file.size,url:file.browser_download_url,sums:sums.browser_download_url,notes:`${RELEASES}/tag/${r.tag_name}`};
    }).find(Boolean)||null;
}
function checksum(text,name) {
  const matches=String(text).split(/\r?\n/).map(line=>/^([a-f\d]{64}) [ *](.+)$/i.exec(line)).filter(m=>m?.[2]===name);
  if(matches.length!==1)throw Error('The update checksum is missing or ambiguous. Please try again later.');
  return matches[0][1].toLowerCase();
}
function allowedURL(raw) {
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))throw Error('Blocked an unexpected update address.');
  if(u.hostname==='api.github.com'&&u.pathname==='/repos/zphat/Latitude/releases')return u.href;
  if(u.hostname==='github.com'&&u.pathname.startsWith('/zphat/Latitude/releases/download/'))return u.href;
  if(['release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(u.hostname))return u.href;
  throw Error('Blocked an unexpected update host.');
}
async function response(fetcher,url,signal) {
  for(let i=0;i<6;i++) {
    const r=await fetcher(allowedURL(url),{signal,redirect:'manual',credentials:'omit',cache:'no-store',headers:{Accept:'application/vnd.github+json, application/octet-stream;q=0.9','User-Agent':'Latitude desktop updater'}});
    if([301,302,303,307,308].includes(r.status)){
      const location=r.headers.get('location');await r.body?.cancel();if(!location)throw Error('The update download address is unavailable.');url=new URL(location,url).href;continue;
    }
    if(!r.ok){await r.body?.cancel();throw Error(r.status===403||r.status===429?'The update service is busy. Try again later.':'Could not reach the update service. Try again when you are online.');}
    return r;
  }throw Error('Too many redirects while checking for updates.');
}
async function smallText(fetcher,url,signal,limit) {
  const r=await response(fetcher,url,signal);let size=0;const chunks=[];
  if(!r.body)throw Error('The update service returned an empty response.');
  const reader=r.body.getReader();try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Update information is unexpectedly large.');chunks.push(Buffer.from(value));}
    return Buffer.concat(chunks).toString('utf8');
  }finally{await reader.cancel().catch(()=>{});}
}
async function digest(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
class Updater {
  constructor({current,mode,cache,fetcher,isBusy=()=>false,prepare=async()=>{},handoff=async()=>{},onState=()=>{},enabled=true,checkTimeout=12000,stallTimeout=20000}) {
    Object.assign(this,{current,mode,cache,fetcher,isBusy,prepare,handoff,onState,checkTimeout,stallTimeout});
    this.state={phase:'idle',current,mode,enabled,prompt:false,version:null,percent:0,message:mode==='development'?'Update checks are available in installed desktop builds.':'Checks once at launch. Updates download only when you choose.'};
    this.checkedLaunch=false;this.skipped=false;this.selected=null;this.file=null;this.task=null;this.installing=false;this.disposed=false;
  }
  get busy(){return !!this.installing||this.state.phase==='downloading';}
  snapshot(){return {...this.state};}
  emit(patch){Object.assign(this.state,patch);if(!this.disposed)this.onState(this.snapshot());return this.snapshot();}
  setEnabled(enabled){this.state.enabled=!!enabled;if(!enabled&&this.state.phase==='checking'){this.skipped=true;this.controller?.abort();}return this.emit({prompt:false});}
  skip(){this.skipped=true;if(this.state.phase==='downloading')return this.cancel();return this.emit({prompt:false});}
  async check({manual=false}={}) {
    if(this.disposed)return this.snapshot();
    if(this.task||this.installing)return this.snapshot();
    if(this.mode==='development')return this.snapshot();
    if(!manual&&(this.checkedLaunch||!this.state.enabled))return this.snapshot();
    if(this.isBusy())throw Error('Finish recording, streaming or exporting before checking for updates.');
    this.checkedLaunch=true;
    if(manual)this.skipped=false;
    this.controller=new AbortController();const signal=this.controller.signal;
    const timer=setTimeout(()=>this.controller?.abort(),this.checkTimeout);timer.unref?.();
    this.emit({phase:'checking',prompt:false,message:'Checking for a newer Latitude release…'});
    this.task=(async()=>{
      try {
        const releases=JSON.parse(await smallText(this.fetcher,API,signal,2*1024*1024));
        const found=selectRelease(releases,this.current,this.mode);
        if(!found){this.selected=null;this.file=null;return this.emit({phase:'current',version:null,message:'You’re using the latest available release.',prompt:false});}
        found.hash=checksum(await smallText(this.fetcher,found.sums,signal,256*1024),found.name);
        this.selected=found;
        if(this.file?.version!==found.version||this.file?.hash!==found.hash)this.file=null;
        return this.emit({phase:this.file?'ready':'available',version:found.version,size:found.size,percent:this.file?100:0,message:`Latitude ${found.version} is available.`,prompt:!this.skipped});
      }catch(error){return this.emit({phase:'error',prompt:false,message:signal.aborted?'The update check was canceled or timed out. Try again later.':error.message});}
      finally{clearTimeout(timer);this.controller=null;this.task=null;}
    })();return this.task;
  }
  async download() {
    if(this.task||this.installing)return this.snapshot();
    if(!this.selected)throw Error('Check for an update first.');
    if(this.isBusy())throw Error('Finish recording, streaming or exporting before updating.');
    if(this.file)return this.emit({phase:'ready',prompt:true});
    const release={...this.selected};this.skipped=false;this.controller=new AbortController();const signal=this.controller.signal;
    this.emit({phase:'downloading',percent:0,prompt:true,message:'Downloading the update…'});
    this.task=(async()=>{
      let partial,timer;
      const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>this.controller?.abort(),this.stallTimeout);timer.unref?.();};
      try {
        await fs.mkdir(this.cache,{recursive:true});
        // Only this updater's cache is managed; never recordings or user downloads.
        for(const name of await fs.readdir(this.cache))if(/^latitude-update-[\w.-]+$/.test(name))await fs.rm(path.join(this.cache,name),{force:true});
        const stat=await fs.statfs(this.cache);if(Number(stat.bavail)*Number(stat.bsize)<release.size*2+64*1024*1024)throw Error('There is not enough free disk space to download this update.');
        partial=path.join(this.cache,`latitude-update-${randomUUID()}.part`);touch();
        const r=await response(this.fetcher,release.url,signal);
        const hash=createHash('sha256');let bytes=0,last=0;
        const meter=new Transform({transform:(chunk,_,done)=>{
          touch();bytes+=chunk.length;if(bytes>release.size||bytes>MAX_FILE)return done(Error('The downloaded update is larger than expected.'));
          hash.update(chunk);if(Date.now()-last>250){last=Date.now();this.emit({percent:Math.min(99,Math.floor(bytes/release.size*100))});}done(null,chunk);
        }});
        if(!r.body)throw Error('The update download is empty.');
        await pipeline(Readable.fromWeb(r.body),meter,createWriteStream(partial,{flags:'wx',mode:0o600}),{signal});
        clearTimeout(timer);
        if(bytes!==release.size||hash.digest('hex')!==release.hash)throw Error('The update failed its integrity check. Nothing was installed; try downloading again.');
        const file=path.join(this.cache,'latitude-update-'+release.name);
        await fs.rename(partial,file);partial=null;
        this.file={path:file,version:release.version,hash:release.hash};
        return this.emit({phase:'ready',percent:100,message:'Download verified. Ready to update.',prompt:!this.skipped});
      }catch(error){return this.emit({phase:signal.aborted?'available':'error',prompt:!this.skipped,message:signal.aborted?'Download canceled or connection timed out.':error.message,percent:0});}
      finally{clearTimeout(timer);if(partial)await fs.rm(partial,{force:true}).catch(()=>{});this.controller=null;this.task=null;}
    })();return this.task;
  }
  cancel(){this.skipped=true;this.controller?.abort();return this.emit({prompt:false});}
  async install() {
    if(this.task||this.installing)throw Error('Wait for the current update operation.');
    if(!this.file)throw Error('Download and verify the update first.');
    if(this.isBusy())throw Error('Finish recording, streaming or exporting before installing.');
    this.installing=true;this.emit({phase:'installing',message:'Opening the verified update…',prompt:true});
    try {
      if(await digest(this.file.path)!==this.file.hash) {this.file=null;throw Error('The downloaded file changed. Download it again before installing.');}
      await this.prepare();
      if(this.isBusy())throw Error('A recording or export started. Finish it before installing.');
      await this.handoff(this.file.path,this.mode);
      this.skipped=true;
      return this.emit({phase:'opened',prompt:true,message:this.mode==='flatpak'?'Finish the update in your software center, then restart Latitude.':this.mode==='portable'?'Extract the new ZIP, close Latitude, then replace your portable app folder.':'The installer has opened. Latitude will close for the update.'});
    }catch(error){return this.emit({phase:this.file?'ready':'error',prompt:true,message:error.message});}
    finally{this.installing=false;}
  }
  dispose(){this.disposed=true;this.controller?.abort();}
}
module.exports={Updater,selectRelease,compare,checksum,allowedURL,artifact,RELEASES};
