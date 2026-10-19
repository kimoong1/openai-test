import { MotionRenderer } from './renderer.js';
import { DEFAULTS, SCENES, PALETTES, DURATION, normalizePreset, serializePreset, encodePreset, decodePreset, outputSize } from './state.js';

const $ = (id) => document.getElementById(id);
const icons = [
  '<ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(-35 16 16)"/><ellipse cx="16" cy="16" rx="14" ry="10" transform="rotate(-35 16 16)"/><circle cx="16" cy="16" r="4"/>',
  '<path d="M3 5h26M16 5v23M8 28h16M4 9V3h24v6"/><path d="M6 14h20" stroke-dasharray="1 3"/>',
  '<circle cx="16" cy="16" r="5"/><ellipse cx="16" cy="16" rx="15" ry="7" transform="rotate(-40 16 16)"/><ellipse cx="16" cy="16" rx="15" ry="7" transform="rotate(40 16 16)"/>',
  '<path d="m2 24 7-6 7 3 7-8 7 5M2 19l7-6 7 3 7-8 7 5M2 14l7-6 7 3 7-8 7 5M2 29l7-6 7 3 7-8 7 5"/>',
  '<path d="M2 2h28v28H2zM7 7h18v18H7zM12 12h8v8h-8zM2 2l10 10M30 2 20 12M30 30 20 20M2 30l10-10"/>',
  '<path d="M16 2c12 0 12 28 0 28S4 2 16 2z"/><path d="M2 16c0-12 28-12 28 0S2 28 2 16z"/><path d="M6 6c8-8 28 12 20 20S-2 14 6 6z"/><path d="M26 6c8 8-12 28-20 20S18-2 26 6z"/>'
];
const scenes = [
  {name:'Vortex study',short:'Vortex study',label:'PARTICLE SCULPTURE',canvas:'VORTEX\nSTUDY.',description:'질서와 혼돈 사이, 수천 개 입자가 그리는 조형.',tags:['PARTICLES','3D PROJECTION']},
  {name:'Type in motion',short:'Type in motion',label:'KINETIC TYPOGRAPHY',canvas:'TYPE IN\nMOTION.',description:'읽히는 문장에서 느껴지는 움직임으로.',tags:['KINETIC TYPE','YOUR MESSAGE']},
  {name:'Orbital mechanics',short:'Orbital mechanics',label:'CELESTIAL CHOREOGRAPHY',canvas:'ORBITAL\nMECHANICS.',description:'보이지 않는 궤도를 따라 빛이 흐릅니다.',tags:['LIGHT TRAILS','ORBITAL']},
  {name:'Wave terrain',short:'Wave terrain',label:'GENERATIVE LANDSCAPE',canvas:'WAVE\nTERRAIN.',description:'파형이 지형이 되고, 지형이 다시 파형이 되는 순간.',tags:['TOPOGRAPHY','SINE FIELD']},
  {name:'Infinite tunnel',short:'Infinite tunnel',label:'PERSPECTIVE EXPERIMENT',canvas:'INFINITE\nTUNNEL.',description:'끝없이 이어지는 공간을 통과하는 감각.',tags:['PERSPECTIVE','DEPTH FIELD']},
  {name:'Radial bloom',short:'Radial bloom',label:'ORGANIC GEOMETRY',canvas:'RADIAL\nBLOOM.',description:'하나의 규칙에서 피어나는 유기적인 형태.',tags:['GENERATIVE','RADIAL FORM']}
];
const paletteLabels = {acid:['ACID / ELECTRIC LIME','#D3FB52'],ember:['EMBER / SOLAR CORAL','#FF8855'],ice:['ICE / GLACIER BLUE','#8DC9FD'],mono:['MONO / SILVER LIGHT','#DDE4D8']};
let config={...DEFAULTS};
try { config=decodePreset(location.hash) ?? config; } catch { setTimeout(()=>toast('프리셋 링크를 읽지 못해 기본 장면으로 시작합니다.'),500); }
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
let playing=!prefersReduced.matches, time=0, lastFrame=0, rafId=0, exporting=false;
let pointer={x:0,y:0}, toastTimer, videoSession=null;
const canvas=$('stage');
let renderer;
try { renderer=new MotionRenderer(canvas); }
catch (error) { $('canvas-wrap').innerHTML='<p class="canvas-error" role="alert">Canvas를 시작하지 못했습니다. 최신 브라우저에서 다시 열어주세요.</p>'; throw error; }

$('scene-list').innerHTML=scenes.map((s,i)=>`<button class="scene-button" data-scene="${SCENES[i]}" aria-pressed="false" title="${s.name} (${i+1})"><span class="scene-icon"><svg viewBox="0 0 32 32" aria-hidden="true">${icons[i]}</svg></span><span><strong>${s.short}</strong><small>${String(i+1).padStart(2,'0')} / ${s.label}</small></span><span class="scene-arrow">↗</span></button>`).join('');

function toast(message) {
  $('toast').textContent=message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3800);
}
function updateSlider(id,value) { $(id).value=value; $(id).style.setProperty('--fill',`${value}%`); $(id+'-value').textContent=`${Math.round(value)}%`; }
function updatePlay() { $('pause-icon').toggleAttribute('hidden',!playing); $('play-icon').toggleAttribute('hidden',playing); $('play').setAttribute('aria-label',playing?'일시정지':'재생'); }
function updateTime() { $('timeline').value=time; $('timeline').style.setProperty('--fill',`${time/DURATION*100}%`); $('time-display').textContent=`00:${Math.floor(time).toString().padStart(2,'0')}`; }
function updateUI() {
  const index=SCENES.indexOf(config.scene), scene=scenes[index];
  document.querySelectorAll('[data-scene]').forEach(b=>{const active=b.dataset.scene===config.scene;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('[data-palette]').forEach(b=>{const active=b.dataset.palette===config.palette;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('scene-code').textContent=`EXP. ${String(index+1).padStart(3,'0')}`;
  $('stage-index').textContent=String(index+1).padStart(2,'0');
  $('detail-number').textContent=String(index+1).padStart(2,'0')+' /';
  $('stage-name').textContent=scene.canvas;
  $('stage-name').style.whiteSpace='pre-line';
  $('scene-title').textContent=scene.name;
  $('scene-subtitle').textContent=scene.description;
  $('scene-tags').replaceChildren(...scene.tags.map(t=>{const span=document.createElement('span');span.textContent=t;return span;}));
  $('motion-text').value=config.text;
  $('palette-name').textContent=paletteLabels[config.palette][0];
  $('palette-hex').textContent=paletteLabels[config.palette][1];
  updateSlider('intensity',config.intensity*100);updateSlider('detail',config.detail*100);
  $('speed').value=config.speed;$('aspect').value=config.aspect;
  $('canvas-wrap').style.aspectRatio=config.aspect.replace(':','/');
  const [w,h]=outputSize(config.aspect);$('dimensions').textContent=`${w} × ${h}`;
  updatePlay();updateTime();resize();
}
function render() { renderer.render(time,{...config,pointer,reducedMotion:false}); }
function resize() {
  const rect=$('canvas-wrap').getBoundingClientRect(),[w,h]=outputSize(config.aspect);
  // Match the preview to export framing, including square and portrait.
  const scale=Math.min(rect.width/w,rect.height/h);
  renderer.resize(Math.max(2,Math.round(w*scale)),Math.max(2,Math.round(h*scale)),Math.min(devicePixelRatio||1,2));
  render();
}
function frame(now) {
  if(lastFrame && playing && !document.hidden && !exporting) { time=(time+Math.min((now-lastFrame)/1000,0.1)*config.speed)%DURATION; }
  lastFrame=now;
  if(!exporting && !document.hidden && playing) {render();updateTime();}
  rafId=requestAnimationFrame(frame);
}
function selectScene(scene) {config.scene=scene;time=0;pointer={x:0,y:0};updateUI();}
function shuffle() {
  const different=PALETTES.filter(p=>p!==config.palette);config.palette=different[Math.floor(Math.random()*different.length)];
  config.intensity=0.3+Math.random()*0.65;config.detail=0.35+Math.random()*0.6;updateUI();toast('새로운 조합을 만들었습니다.');
}
function download(blob,filename) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function filename(ext) {return `flux-${config.scene}-${config.palette}.${ext}`;}
function renderOutput(t) {
  const output=document.createElement('canvas'),[w,h]=outputSize(config.aspect);
  const engine=new MotionRenderer(output);engine.resize(w,h,1);engine.render(t,{...config,pointer:{x:0,y:0},reducedMotion:false});
  return {output,engine};
}
async function exportPNG() {
  try {
    const {output,engine}=renderOutput(time);
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));engine.destroy();
    if(!blob)throw new Error('PNG를 생성하지 못했습니다.');download(blob,filename('png'));toast('스틸 이미지를 저장했습니다.');
  }catch(error){toast(error.message||'이미지 저장에 실패했습니다.');}
}
const webmType=typeof MediaRecorder==='undefined' ? null : ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
if(!webmType || !canvas.captureStream) { $('export-video').disabled=true;$('export-video').title='WebM 녹화를 지원하는 최신 Chrome 또는 Edge에서 사용해 주세요.'; }
function stopVideo(cancelled=false) {
  if(!videoSession)return;
  videoSession.cancelled ||= cancelled;
  if(videoSession.recorder.state!=='inactive')videoSession.recorder.stop();
}
async function exportVideo() {
  if(exporting || !webmType)return;
  const capturedConfig={...config};
  let output,engine,stream,recorder;
  try {
    ({output,engine}=renderOutput(0));stream=output.captureStream(30);
    recorder=new MediaRecorder(stream,{mimeType:webmType,videoBitsPerSecond:12_000_000});
  }catch(error){stream?.getTracks().forEach(t=>t.stop());engine?.destroy();toast('이 브라우저에서는 영상 녹화를 시작할 수 없습니다.');return;}
  exporting=true;
  const session={recorder,stream,engine,output,cancelled:false,raf:0,started:0,chunks:[],error:false};videoSession=session;
  $('export-progress').value=0;$('export-status').textContent='8초 분량의 WebM 영상을 실시간으로 저장합니다.';$('export-dialog').showModal();
  recorder.ondataavailable=e=>{if(e.data.size)session.chunks.push(e.data);};
  recorder.onerror=()=>{session.error=true;stopVideo(true);};
  recorder.onstop=()=>{
    cancelAnimationFrame(session.raf);session.stream.getTracks().forEach(t=>t.stop());session.engine.destroy();
    $('export-dialog').close();videoSession=null;exporting=false;lastFrame=0;
    if(!session.cancelled && session.chunks.length){download(new Blob(session.chunks,{type:webmType}),`flux-${capturedConfig.scene}-${capturedConfig.palette}.webm`);toast('8초 영상을 저장했습니다.');}
    else toast(session.error?'녹화 중 오류가 발생했습니다. 다시 시도해 주세요.':'내보내기를 취소했습니다.');
  };
  recorder.start(250);
  const tick=(now)=>{
    if(videoSession!==session || recorder.state==='inactive')return;
    if(!session.started)session.started=now;
    const elapsed=(now-session.started)/1000;
    engine.render((Math.min(elapsed,DURATION)*capturedConfig.speed)%DURATION,{...capturedConfig,pointer:{x:0,y:0},reducedMotion:false});
    $('export-progress').value=Math.min(elapsed/DURATION,1);
    $('export-status').textContent=`${Math.min(elapsed,DURATION).toFixed(1)} / 8.0초 · 이 탭을 열어 두세요.`;
    if(elapsed>=DURATION)stopVideo();else session.raf=requestAnimationFrame(tick);
  };
  session.raf=requestAnimationFrame(tick);
}
async function share() {
  const url=new URL(location.href);url.hash=encodePreset(config);
  history.replaceState(null,'',url);
  try { await navigator.clipboard.writeText(url.href);toast('현재 설정의 링크를 복사했습니다.'); }
  catch { toast('현재 설정을 주소창에 저장했습니다. 주소를 복사해 공유하세요.'); }
}
async function importPreset(file) {
  if(!file)return;
  try {
    if(file.size>65536)throw new Error('프리셋은 64KB 이하의 JSON 파일이어야 합니다.');
    const value=JSON.parse(await file.text());
    if(value.app!=='FLUX' || value.version!==1 || !value.config)throw new Error('FLUX에서 저장한 프리셋을 선택해 주세요.');
    config=normalizePreset(value);time=0;updateUI();toast('프리셋을 불러왔습니다.');
  }catch(error){toast(error instanceof SyntaxError?'JSON 파일을 읽지 못했습니다.':error.message);}
  finally{$('preset-file').value='';}
}

$('scene-list').addEventListener('click',e=>{const button=e.target.closest('[data-scene]');if(button)selectScene(button.dataset.scene);});
$('palettes').addEventListener('click',e=>{const button=e.target.closest('[data-palette]');if(button){config.palette=button.dataset.palette;updateUI();}});
$('play').addEventListener('click',()=>{playing=!playing;lastFrame=0;updatePlay();render();});
$('restart').addEventListener('click',()=>{time=0;updateTime();render();});
$('timeline').addEventListener('input',e=>{time=Number(e.target.value);updateTime();render();});
for(const key of ['intensity','detail'])$(key).addEventListener('input',e=>{config[key]=Number(e.target.value)/100;updateSlider(key,e.target.value);render();});
$('motion-text').addEventListener('input',e=>{config.text=Array.from(e.target.value).slice(0,24).join('');render();});
$('speed').addEventListener('change',e=>{config.speed=Number(e.target.value);});
$('aspect').addEventListener('change',e=>{config.aspect=e.target.value;updateUI();requestAnimationFrame(resize);});
$('canvas-wrap').addEventListener('pointermove',e=>{if(prefersReduced.matches)return;const r=canvas.getBoundingClientRect();pointer={x:Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)),y:Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1))};if(!playing)render();});
$('canvas-wrap').addEventListener('pointerleave',()=>{pointer={x:0,y:0};if(!playing)render();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('canvas-wrap').requestFullscreen();}catch{toast('브라우저가 전체 화면을 지원하지 않습니다.');}});
$('shuffle').addEventListener('click',shuffle);
$('export-png').addEventListener('click',exportPNG);$('export-video').addEventListener('click',exportVideo);
$('cancel-export').addEventListener('click',()=>stopVideo(true));$('export-dialog').addEventListener('cancel',e=>{e.preventDefault();stopVideo(true);});
$('share').addEventListener('click',share);
$('save-preset').addEventListener('click',()=>{download(new Blob([JSON.stringify(serializePreset(config),null,2)],{type:'application/json'}),filename('json'));document.querySelector('.preset-menu').open=false;toast('프리셋을 저장했습니다.');});
$('load-preset').addEventListener('click',()=>{document.querySelector('.preset-menu').open=false;$('preset-file').click();});
$('preset-file').addEventListener('change',e=>importPreset(e.target.files[0]));
$('show-help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,button,a,summary,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
  if(e.code==='Space'){e.preventDefault();$('play').click();}
  else if(/^[1-6]$/.test(e.key))selectScene(SCENES[Number(e.key)-1]);
  else if(e.key.toLowerCase()==='s')shuffle();else if(e.key.toLowerCase()==='r')$('restart').click();
  else if(e.key==='?')$('help-dialog').showModal();
});
document.addEventListener('visibilitychange',()=>{lastFrame=0;if(document.hidden && exporting){stopVideo(true);}});
prefersReduced.addEventListener('change',e=>{if(e.matches){playing=false;pointer={x:0,y:0};updatePlay();render();}});
window.addEventListener('hashchange',()=>{try{const next=decodePreset(location.hash);if(next){config=next;time=0;updateUI();}}catch{toast('올바르지 않은 프리셋 링크입니다.');}});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(rafId);if(exporting)stopVideo(true);});
new ResizeObserver(()=>resize()).observe($('canvas-wrap'));
updateUI();rafId=requestAnimationFrame(frame);
