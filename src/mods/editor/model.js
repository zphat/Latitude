// Shared, dependency-free timeline model. Times are seconds on the project frame grid.
export const LIMITS = Object.freeze({ tracks: 16, assets: 256, clips: 2000, seconds: 43200 });
export const FORMATS = Object.freeze({ landscape: [1920,1080], portrait: [1080,1920], square: [1080,1080], compact: [1280,720], uhd: [3840,2160] });
export const uid = () => globalThis.crypto.randomUUID();
export const clamp = (n,a,b) => Math.min(b,Math.max(a,Number.isFinite(Number(n)) ? Number(n) : a));
const label = (s, fallback, max=100) => typeof s === 'string' ? s.slice(0,max) : fallback;
const color = (s,fallback) => /^#[\da-f]{6}$/i.test(s || '') ? s : fallback;
export const frame = (t,fps=30) => Math.round(t*fps)/fps;
export function newProject() {
  return { version:1, name:'Untitled edit', format:'landscape', fps:30, background:'#090d0a', normalize:true, target:-16,
    assets:[], tracks:[newTrack('video','Main video'),newTrack('audio','Voice / audio')], clips:[], markers:[], range:null };
}
export function newTrack(kind='video',name) { return { id:uid(),kind,name:name || (kind==='audio'?'Audio layer':'Video layer'),gain:0,pan:0,mute:false,solo:false,hidden:false,locked:false,voice:false }; }
export function duration(p) { return Math.max(0,...p.clips.map(c=>c.start+c.duration)); }
export function sanitize(input) {
  if (!input || input.version!==1 || !Array.isArray(input.tracks) || !Array.isArray(input.clips) || !Array.isArray(input.assets)) throw Error('This is not a supported Latitude edit project.');
  if (input.tracks.length>LIMITS.tracks || input.clips.length>LIMITS.clips || input.assets.length>LIMITS.assets) throw Error('This project exceeds the editor’s layer or media limit.');
  const p=newProject();
  p.name=label(input.name,p.name); p.format=Object.hasOwn(FORMATS,input.format)?input.format:'landscape';p.fps=[24,30,60].includes(input.fps)?input.fps:30;
  p.background=color(input.background,p.background);p.normalize=input.normalize!==false;p.target=clamp(input.target??-16,-24,-14);
  const validId=s=>typeof s==='string' && /^[\w-]{1,80}$/.test(s);
  const ids=new Set();const unique=(id)=>{if(!validId(id)||ids.has(id))throw Error('Invalid or duplicate project identifier.');ids.add(id);return id;};
  p.assets=input.assets.map(a=>({id:unique(a.id),name:label(a.name,'Media'),kind:['video','audio','image'].includes(a.kind)?a.kind:'video',duration:clamp(a.duration,0,LIMITS.seconds),width:clamp(a.width,0,16384),height:clamp(a.height,0,16384),audio:Math.round(clamp(a.audio,0,32)),missing:!!a.missing}));
  p.tracks=input.tracks.map(t=>({id:unique(t.id),kind:t.kind==='audio'?'audio':'video',name:label(t.name,'Layer'),gain:clamp(t.gain??0,-60,18),pan:clamp(t.pan??0,-1,1),mute:!!t.mute,solo:!!t.solo,hidden:!!t.hidden,locked:!!t.locked,voice:!!t.voice}));
  if(!p.tracks.length)p.tracks=[newTrack()];
  p.clips=input.clips.map(c=>{
    const a=p.assets.find(a=>a.id===c.asset), t=p.tracks.find(t=>t.id===c.track);
    if(!t||(!a&&c.kind!=='title'))throw Error('A clip references a missing layer or media item.');
    if(t.kind==='audio' && (c.kind==='title'||a?.kind==='image'))throw Error('Images and titles need a video layer.');
    const start=frame(clamp(c.start,0,LIMITS.seconds-1/p.fps),p.fps), trim=frame(clamp(c.in??0,0,LIMITS.seconds),p.fps);
    let length=frame(clamp(c.duration,1/p.fps,LIMITS.seconds-start),p.fps);
    if(a && a.kind!=='image' && !a.missing){if(trim>=a.duration)throw Error('A clip starts beyond the end of its source.');length=Math.min(length,Math.floor((a.duration-trim)*p.fps+1e-6)/p.fps);if(length<1/p.fps)throw Error('A source clip is shorter than one frame.');}
    return {id:unique(c.id),track:t.id,asset:a?.id||null,kind:c.kind==='title'?'title':a.kind,name:label(c.name,a?.name||'Title'),group:validId(c.group)?c.group:'',start,in:trim,duration:length,
      gain:clamp(c.gain??0,-60,18),mute:!!c.mute,audio:Math.round(clamp(c.audio??0,0,Math.max(0,(a?.audio||1)-1))),
      fadeIn:clamp(c.fadeIn??0,0,length/2),fadeOut:clamp(c.fadeOut??0,0,length/2),audioIn:clamp(c.audioIn??0,0,length/2),audioOut:clamp(c.audioOut??0,0,length/2),
      transition:['fade','slide-left','slide-right','wipe'].includes(c.transition)?c.transition:'fade',
      x:clamp(c.x??0,-1,1),y:clamp(c.y??0,-1,1),w:clamp(c.w??1,.02,2),h:clamp(c.h??1,.02,2),opacity:clamp(c.opacity??1,0,1),fit:c.fit==='cover'?'cover':'contain',flip:!!c.flip,crop:{x:clamp(c.crop?.x??0,0,.98),y:clamp(c.crop?.y??0,0,.98),w:clamp(c.crop?.w??1,.02,1-clamp(c.crop?.x??0,0,.98)),h:clamp(c.crop?.h??1,.02,1-clamp(c.crop?.y??0,0,.98))},
      brightness:clamp(c.brightness??1,.2,2),contrast:clamp(c.contrast??1,.2,2),saturation:clamp(c.saturation??1,0,2),
      text:label(c.text,'Your title',500),font:['Manrope','DM Serif Display','monospace'].includes(c.font)?c.font:'Manrope',fontSize:clamp(c.fontSize??64,16,240),color:color(c.color,'#ffffff'),color2:color(c.color2,'#d1ff4a'),gradient:!!c.gradient,box:!!c.box,align:['left','center','right'].includes(c.align)?c.align:'center'};
  });
  p.markers=(Array.isArray(input.markers)?input.markers:[]).slice(0,300).map(m=>({time:frame(clamp(m.time,0,LIMITS.seconds),p.fps),name:label(m.name,'Marker',60)}));
  if(input.range && input.range.out>input.range.in)p.range={in:frame(clamp(input.range.in,0,duration(p)),p.fps),out:frame(clamp(input.range.out,0,duration(p)),p.fps)};
  return p;
}
export function addClip(p,asset,track,start=duration(p)) {
  if(p.clips.length>=LIMITS.clips)throw Error('This project has reached its clip limit.');
  const c={id:uid(),asset:asset?.id||null,track,kind:asset?.kind||'title',name:asset?.name||'Title',start:frame(start,p.fps),in:0,duration:asset&&asset.kind!=='image'?asset.duration:5};
  if(!asset)Object.assign(c,{x:.1,y:.72,w:.8,h:.22,text:'Your title'});
  p.clips.push(c);return sanitize(p);
}
export const audible = (p,t) => !t.mute && (!p.tracks.some(t=>t.solo) || t.solo);
export function selectedGroup(p,id,linked=true){const c=p.clips.find(c=>c.id===id);return c?p.clips.filter(x=>x.id===id||(linked&&c.group&&x.group===c.group)):[];}
export function split(p,ids,time) {
  time=frame(time,p.fps);const selected=new Set(ids);const next=[];
  const groups=new Map();
  for(const c of p.clips){if(!selected.has(c.id)||time<=c.start+1e-6||time>=c.start+c.duration-1e-6){next.push(c);continue;}
    const left=time-c.start,right=c.duration-left;
    if(c.group&&!groups.has(c.group))groups.set(c.group,uid());
    next.push({...c,duration:left,fadeOut:0,audioOut:0});
    next.push({...c,id:uid(),group:groups.get(c.group)||'',start:time,in:c.in+left,duration:right,fadeIn:0,audioIn:0});
  }return sanitize({...p,clips:next});
}
// A range cut is global so camera, microphone and music timing stays aligned.
export function ripple(p,start,end) {
  start=frame(start,p.fps);end=frame(end,p.fps);if(end<=start)throw Error('Set an out point after the in point.');
  if(p.tracks.some(t=>t.locked&&p.clips.some(c=>c.track===t.id&&c.start+c.duration>start)))throw Error('Unlock affected layers before making a ripple cut.');
  let q=split(p,p.clips.map(c=>c.id),start);q=split(q,q.clips.map(c=>c.id),end);
  q.clips=q.clips.filter(c=>c.start<start-1e-6||c.start>=end-1e-6).map(c=>c.start>=end-1e-6?{...c,start:c.start-(end-start)}:c);
  q.markers=q.markers.filter(m=>m.time<start||m.time>=end).map(m=>({...m,time:m.time>=end?m.time-(end-start):m.time}));q.range=null;return sanitize(q);
}
export function snap(p,time,exclude=[],tolerance=.12) {
  const points=[0,...p.markers.map(m=>m.time),...p.clips.filter(c=>!exclude.includes(c.id)).flatMap(c=>[c.start,c.start+c.duration])];
  const nearest=points.sort((a,b)=>Math.abs(a-time)-Math.abs(b-time))[0];return frame(Math.abs(nearest-time)<tolerance?nearest:Math.max(0,time),p.fps);
}
export function envelope(c,t,audio=false){const local=t-c.start;const a=audio?c.audioIn:c.fadeIn,b=audio?c.audioOut:c.fadeOut;const v=Math.min(1,a?local/a:1,b?(c.duration-local)/b:1);return audio?Math.sin(clamp(v,0,1)*Math.PI/2):clamp(v,0,1);}
export function visualRect(c,t){let x=c.x,reveal=1;const phase=c.fadeIn?clamp((t-c.start)/c.fadeIn,0,1):1;if(c.transition==='slide-left')x-=(1-phase)*(c.x+c.w);if(c.transition==='slide-right')x+=(1-phase)*(1-c.x);if(c.transition==='wipe')reveal=phase;return{x,y:c.y,w:c.w,h:c.h,reveal,alpha:c.opacity*(c.transition==='fade'?envelope(c,t):c.fadeOut?clamp((c.start+c.duration-t)/c.fadeOut,0,1):1)};}
export function segments(p,start=0,end=duration(p)){
  const edges=new Set([start,end]);for(const c of p.clips)for(const n of [c.start,c.start+c.duration])if(n>start&&n<end)edges.add(frame(n,p.fps));
  // Bound individual export jobs and decode only media visible in this interval.
  for(let n=start+30;n<end;n+=30)edges.add(frame(n,p.fps));
  const sorted=[...edges].sort((a,b)=>a-b);return sorted.slice(0,-1).map((t,i)=>({start:t,duration:sorted[i+1]-t})).filter(s=>s.duration>.5/p.fps);
}
export class History {
  constructor(p){this.current=sanitize(p);this.undoStack=[];this.redoStack=[];}
  commit(p){const next=sanitize(p);if(JSON.stringify(next)===JSON.stringify(this.current))return;this.undoStack.push(this.current);if(this.undoStack.length>60)this.undoStack.shift();this.current=next;this.redoStack=[];}
  undo(){if(this.undoStack.length){this.redoStack.push(this.current);this.current=this.undoStack.pop();}return this.current;}
  redo(){if(this.redoStack.length){this.undoStack.push(this.current);this.current=this.redoStack.pop();}return this.current;}
}
