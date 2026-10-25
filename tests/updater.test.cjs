const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {Updater,selectRelease,compare,checksum,allowedURL,artifact,RELEASES} = require('../electron/updater.cjs');
const bytes = Buffer.from('A harmless update fixture.');
const hash = createHash('sha256').update(bytes).digest('hex');
function release(ver='0.9.2',mode='windows',extra={}) {
  const name=artifact(ver,mode),base=`${RELEASES}/download/v${ver}/`;
  return {tag_name:`v${ver}`,draft:false,prerelease:true,assets:[name,'SHA256SUMS.txt'].map(n=>({name:n,state:'uploaded',size:n===name?bytes.length:150,browser_download_url:base+n})),...extra};
}
async function fixture(t,options={}) {
  const cache=await fs.mkdtemp(path.join(os.tmpdir(),'latitude-updater-'));t.after(()=>fs.rm(cache,{recursive:true,force:true}));
  const calls=[],handed=[],events=[];const mode=options.mode||'windows';
  const fetcher=async (url)=>{
    calls.push(url);
    if(url.includes('api.github.com'))return new Response(JSON.stringify([release('0.9.2',mode)]));
    if(url.endsWith('SHA256SUMS.txt'))return new Response(`${hash}  ${artifact('0.9.2',mode)}\n`);
    return new Response(bytes);
  };
  const u=new Updater({current:'0.9.1',mode,cache,fetcher,handoff:async(...args)=>handed.push(args),onState:s=>events.push(s),...options});
  t.after(()=>u.dispose());return {u,calls,handed,events,cache,fetcher};
}
test('version order handles double digits, beta identifiers, invalid input and no downgrades',()=>{
  assert.equal(compare('0.10.0','0.9.9'),1);assert.equal(compare('1.0.0-beta.10','1.0.0-beta.2'),1);
  assert.equal(compare('1.0.0','1.0.0-rc.1'),1);assert.equal(compare('1.0.0-alpha','1.0.0-beta'),-1);
  assert.throws(()=>compare('01.0.0','1.0.0'));
  assert.equal(selectRelease([release('0.9.1')],'0.9.1','windows'),null);
  assert.equal(selectRelease([release('1.1.0')],'1.0.0','windows'),null);
  assert.equal(selectRelease([release('1.1.0','windows',{prerelease:false})],'1.0.0','windows').version,'1.1.0');
});
test('release selection requires complete matching-platform published assets from this repository',()=>{
  const list=[null,{tag_name:'v0.9.8',assets:{}},release('0.9.4','windows',{draft:true}),release('0.9.3','flatpak'),release()];
  assert.equal(selectRelease(list,'0.9.1','windows').version,'0.9.2');
  const r=release();r.assets[0].browser_download_url='https://example.com/evil.exe';assert.equal(selectRelease([r],'0.9.1','windows'),null);
  r.assets[0].browser_download_url=`${RELEASES}/download/v0.9.2/${r.assets[0].name}`;r.assets[0].state='new';assert.equal(selectRelease([r],'0.9.1','windows'),null);
  assert.throws(()=>selectRelease({},'0.9.1','windows'));
  assert.equal(artifact('0.9.2','flatpak'),'Latitude-0.9.2-Linux-x86_64.flatpak');
});
test('checksums require one exact filename and redirects stay on HTTPS GitHub hosts',()=>{
  const name=artifact('0.9.2','windows');assert.equal(checksum(`${hash} *${name}`,name),hash);
  assert.throws(()=>checksum(`${hash}  other.exe`,name));assert.throws(()=>checksum(`${hash}  ${name}\n${hash}  ${name}`,name));
  for(const url of ['http://github.com/zphat/Latitude/releases/download/x','https://github.com/other/repo/releases/download/x','https://release-assets.githubusercontent.com.evil.test/x','https://user:pass@github.com/zphat/Latitude/releases/download/x','file:///tmp/update','https://127.0.0.1/update'])assert.throws(()=>allowedURL(url));
  assert.ok(allowedURL('https://release-assets.githubusercontent.com/github-production-release-asset/x?token=signed'));
});
test('launch checks once, never downloads without consent, and skip resets only next launch or manual check',async t=>{
  const {u,calls}=await fixture(t);await u.check();assert.equal(calls.length,2);assert.equal(u.state.prompt,true);
  u.skip();await u.check();assert.equal(calls.length,2);assert.equal(u.state.prompt,false);
  const other=await fixture(t);await other.u.check();assert.equal(other.u.state.prompt,true);
  await u.check({manual:true});assert.equal(calls.length,4);assert.equal(u.state.prompt,true);
});
test('disabled startup and development builds make no network requests',async t=>{
  const {u,calls}=await fixture(t,{enabled:false});await u.check();assert.equal(calls.length,0);
  await u.check({manual:true});assert.equal(calls.length,2);
  const dev=await fixture(t,{mode:'development'});await dev.u.check({manual:true});assert.equal(dev.calls.length,0);
});
test('busy work prevents checks, downloads and installation; drafts flush before handoff',async t=>{
  let busy=true,prepared=false;
  const {u,handed}=await fixture(t,{isBusy:()=>busy,prepare:async()=>{prepared=true;}});
  await assert.rejects(u.check(),/Finish recording/);assert.equal(u.checkedLaunch,false);
  busy=false;await u.check();busy=true;await assert.rejects(u.download(),/Finish recording/);
  busy=false;await u.download();busy=true;await assert.rejects(u.install(),/Finish recording/);assert.equal(handed.length,0);
  busy=false;await u.install();assert.equal(prepared,true);assert.equal(handed.length,1);assert.equal(u.state.phase,'opened');
});
test('verified download is incremental, leaves no partials and opens the matching platform artifact',async t=>{
  for(const mode of ['windows','portable','flatpak']) {
    const {u,cache,handed}=await fixture(t,{mode});await u.check();await u.download();
    assert.equal(u.state.phase,'ready');assert.equal(u.state.percent,100);assert.equal(u.busy,false);
    assert.deepEqual(await fs.readFile(u.file.path),bytes);assert.deepEqual(await fs.readdir(cache),['latitude-update-'+artifact('0.9.2',mode)]);
    assert.equal(handed.length,0);await u.install();assert.equal(handed[0][1],mode);
  }
});
test('bad bytes, oversized and truncated downloads cannot be installed and partials are removed',async t=>{
  for(const body of [Buffer.alloc(bytes.length,1),Buffer.alloc(bytes.length+1),Buffer.alloc(2)]) {
    const f=await fixture(t);await f.u.check();f.u.fetcher=async()=>new Response(body);await f.u.download();
    assert.equal(f.u.state.phase,'error');assert.equal(f.u.file,null);assert.deepEqual(await fs.readdir(f.cache),[]);
    await assert.rejects(f.u.install(),/Download and verify/);assert.equal(f.handed.length,0);
  }
});
test('rechecks integrity immediately before execution and refuses files changed after download',async t=>{
  const {u,handed}=await fixture(t);await u.check();await u.download();await fs.writeFile(u.file.path,'tampered');
  await u.install();assert.equal(u.state.phase,'error');assert.match(u.state.message,/file changed/);assert.equal(handed.length,0);
});
test('failed draft save or newly busy output prevents installer handoff',async t=>{
  const {u,handed}=await fixture(t,{prepare:async()=>{throw Error('Draft could not be saved.');}});await u.check();await u.download();await u.install();
  assert.equal(handed.length,0);assert.equal(u.state.phase,'ready');assert.match(u.state.message,/Draft/);
  let busy=false;u.isBusy=()=>busy;u.prepare=async()=>{busy=true;};await u.install();assert.equal(handed.length,0);assert.match(u.state.message,/recording or export started/);
});
test('offline, rate-limited, malformed and hostile responses fail quietly at launch',async t=>{
  for(const fetcher of [async()=>{throw Error('Offline');},async()=>new Response('',{status:429}),async()=>new Response('not json'),async()=>new Response(null,{status:302,headers:{location:'https://evil.example/install'}})]) {
    const {u}=await fixture(t,{fetcher});await u.check();assert.equal(u.state.phase,'error');assert.equal(u.state.prompt,false);assert.equal(u.busy,false);
  }
});
test('bounded metadata and missing checksum never produce an offer',async t=>{
  const huge=await fixture(t,{fetcher:async()=>new Response(' '.repeat(2*1024*1024+1))});await huge.u.check();assert.match(huge.u.state.message,/unexpectedly large/);assert.equal(huge.u.state.prompt,false);
  const f=await fixture(t);f.u.fetcher=async(url)=>url.endsWith('SHA256SUMS.txt')?new Response('missing'):f.fetcher(url);await f.u.check();assert.equal(f.u.state.prompt,false);assert.match(f.u.state.message,/checksum/);
});
test('canceling an in-flight download removes partials and never prompts again this session',async t=>{
  const {u,cache,handed}=await fixture(t);await u.check();let began;const started=new Promise(resolve=>{began=resolve;});
  u.fetcher=async(_,options)=>{began();return new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(Error('Aborted')),{once:true});}}));};
  const downloading=u.download();await started;assert.equal(u.busy,true);u.skip();await downloading;
  assert.equal(u.state.phase,'available');assert.equal(u.state.prompt,false);assert.equal(u.busy,false);assert.deepEqual(await fs.readdir(cache),[]);
  await u.check();assert.equal(u.state.prompt,false);assert.equal(handed.length,0);
});
test('launch requests time out without locking the UI and can be retried manually',async t=>{
  const {u}=await fixture(t,{checkTimeout:20,fetcher:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
  // Keep the isolated test alive; production timers intentionally do not keep the app open.
  const keep=setTimeout(()=>{},200);await u.check();clearTimeout(keep);
  assert.equal(u.state.phase,'error');assert.equal(u.state.prompt,false);assert.equal(u.task,null);assert.match(u.state.message,/timed out/);
});

test('valid GitHub CDN redirects preserve checksum and streaming download validation',async t=>{
  const f=await fixture(t),cdn='https://release-assets.githubusercontent.com/latitude/';
  f.u.fetcher=async(url,options)=>{
    assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
    if(url.includes('api.github.com'))return f.fetcher(url);
    if(url.startsWith(cdn))return url.endsWith('sums')?new Response(`${hash}  ${artifact('0.9.2','windows')}\n`):new Response(bytes);
    return new Response(null,{status:302,headers:{location:cdn+(url.endsWith('SHA256SUMS.txt')?'sums':'package')}});
  };
  await f.u.check();assert.equal(f.u.state.phase,'available');await f.u.download();assert.equal(f.u.state.phase,'ready');await f.u.install();assert.equal(f.handed.length,1);
});
