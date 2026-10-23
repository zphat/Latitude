import { FORMATS, audible } from './model.js';
const n = value => Number(value.toFixed(7));
const even = value => Math.max(2,Math.round(value/2)*2);
export const CEILING = 'alimiter=limit=0.841395:attack=5:release=80:level=false:latency=true';
export const VOICE_FILTER = 'highpass=f=80,equalizer=f=220:t=q:w=0.8:g=-2,equalizer=f=3500:t=q:w=0.8:g=1.5,acompressor=threshold=0.125:ratio=2.5:attack=12:release=160:makeup=1.3';
export function audioTracks(project){return project.tracks.filter(t=>project.clips.some(c=>c.track===t.id&&project.assets.find(a=>a.id===c.asset)?.audio));}
// One bounded interval, only its active inputs. All segments retain identical stream layouts.
export function segmentPlan(project,media,titles,segment,{separate=false,audioOnly=false,quality='balanced'}={}) {
  const [W,H]=FORMATS[project.format],fps=project.fps,d=n(segment.duration),start=segment.start;
  const args=['-filter_complex_threads','2','-threads','2'];const filters=[],visuals=[],audio=new Map();let input=0;
  if(!audioOnly){args.push('-f','lavfi','-i',`color=c=${project.background.replace('#','0x')}:s=${W}x${H}:r=${fps}:d=${d}`);filters.push('[0:v]format=yuv420p[base0]');input++;}
  const tracks=audioTracks(project);for(const t of tracks)audio.set(t.id,[]);
  const active=project.clips.filter(c=>c.start<start+d-1e-6 && c.start+c.duration>start+1e-6).sort((a,b)=>project.tracks.findIndex(t=>t.id===a.track)-project.tracks.findIndex(t=>t.id===b.track)||a.start-b.start);
  for(const c of active){const track=project.tracks.find(t=>t.id===c.track),a=media.get(c.asset);const isVisual=c.kind!=='audio'&&!track.hidden&&!audioOnly;
    const isAudio=a?.audio&&!c.mute&&audible(project,track);if(!isVisual&&!isAudio)continue;
    const offset=Math.max(0,start-c.start),file=c.kind==='title'?titles.get(c.id):a?.path;
    if(!file)throw Error(`Relink the missing media for ${c.name} before exporting.`);
    const image=c.kind==='title'||c.kind==='image';
    args.push('-threads','2','-protocol_whitelist','file,pipe');
    if(image)args.push('-loop','1','-framerate',String(fps));else args.push('-ss',String(n(c.in+offset)));
    args.push('-t',String(d),'-i',file);const index=input++;
    if(isVisual){const w=even(c.w*W),h=even(c.h*H),tag=`v${index}`;
      let chain=`[${index}:v:0]setpts=PTS-STARTPTS,fps=${fps},`;
      if(c.kind!=='title' && c.crop)chain+=`crop=w=iw*${c.crop.w}:h=ih*${c.crop.h}:x=iw*${c.crop.x}:y=ih*${c.crop.y},`;
      if(c.brightness!==1||c.contrast!==1||c.saturation!==1)chain+=`eq=brightness=${n((c.brightness-1)*.5)}:contrast=${c.contrast}:saturation=${c.saturation},`;
      chain+='setsar=1,';
      chain+=c.fit==='cover'?`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},`:`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0,`;
      // RGBA before padding preserves transparent contain bars and title pixels.
      chain=chain.replace('setsar=1,','setsar=1,format=rgba,');
      if(c.flip)chain+='hflip,';
      chain+='format=rgba';
      const phase=c.fadeIn?`min(1,(T+${n(offset)})/${n(c.fadeIn)})`:'1';
      const tail=c.fadeOut?`min(1,(${n(c.duration-offset)}-T)/${n(c.fadeOut)})`:'1';
      const alpha=`${c.opacity}*${c.transition==='fade'?`min(${phase},${tail})`:tail}`;
      if(c.opacity<1||c.fadeIn||c.fadeOut){const wipe=c.transition==='wipe'?`*lte(X,W*${phase})`:'';chain+=`,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${alpha}${wipe}'`;}
      chain+=`[${tag}]`;filters.push(chain);
      let x=String(n(c.x*W));if(c.fadeIn&&c.transition.startsWith('slide')){const f=`(1-min(1,(t+${n(offset)})/${n(c.fadeIn)}))`;x+=c.transition==='slide-left'?`-${n((c.x+c.w)*W)}*${f}`:`+${n((1-c.x)*W)}*${f}`;}
      visuals.push({tag,x,y:n(c.y*H)});
    }
    if(isAudio){let chain=`[${index}:a:${c.audio}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,atrim=duration=${d},apad=whole_dur=${d}`;
      const head=c.audioIn?`min(1,(t+${n(offset)})/${n(c.audioIn)})`:'1',tail=c.audioOut?`min(1,(${n(c.duration-offset)}-t)/${n(c.audioOut)})`:'1';
      const gain=`${n(10**(c.gain/20))}*sin(PI/2*max(0,min(${head},${tail})))`;
      chain+=`,aeval=exprs='val(0)*${gain}|val(1)*${gain}'[a${index}]`;filters.push(chain);audio.get(track.id).push(`a${index}`);
    }
  }
  let prev='base0';for(let i=0;i<visuals.length;i++){const v=visuals[i],next=`base${i+1}`;filters.push(`[${prev}][${v.tag}]overlay=x='${v.x}':y=${v.y}:eof_action=pass:shortest=0:format=auto[${next}]`);prev=next;}
  const out=[];
  for(let i=0;i<tracks.length;i++){const t=tracks[i],sources=audio.get(t.id),tag=`track${i}`;
    let chain=sources.length?sources.map(s=>`[${s}]`).join('')+`amix=inputs=${sources.length}:normalize=0:duration=longest`:`anullsrc=r=48000:cl=stereo:d=${d}`;
    if(t.voice)chain+=`,${VOICE_FILTER}`;
    chain+=`,volume=${n(10**(t.gain/20))},pan=stereo|c0=${n(Math.min(1,1-t.pan))}*c0|c1=${n(Math.min(1,1+t.pan))}*c1,atrim=duration=${d}`;
    if(separate){chain+=`,asplit=2[${tag}][stem${i}]`;}else chain+=`[${tag}]`;
    filters.push(chain);out.push(tag);
  }
  filters.push(out.length?out.map(s=>`[${s}]`).join('')+`amix=inputs=${out.length}:normalize=0:duration=longest[mix]`:`anullsrc=r=48000:cl=stereo:d=${d}[mix]`);
  if(!audioOnly){args.push('-map',`[${prev}]`,'-c:v','libx264','-preset',quality==='sharp'?'fast':'veryfast','-crf',quality==='sharp'?'18':'20','-pix_fmt','yuv420p','-r',String(fps));}
  args.push('-map','[mix]');if(separate)for(let i=0;i<tracks.length;i++)args.push('-map',`[stem${i}]`);
  args.push('-c:a','pcm_f32le','-ar','48000','-ac','2','-t',String(d),'-threads','2');
  return{args,filter:filters.join(';\n'),tracks};
}
