/**
 * Native-scroll cinematic background. One selected local video, no wheel/touch
 * interception, looping player or forced playback timer. Loading reports bytes,
 * not invented progress. Reduced motion and direct links skip the film.
 */
import {initProjectScreens,useCoverFrame} from './project-screens.js?v=20261005-3';
import {MOTION_POINTS,SHOWCASE_RANGE,GUIDED_DURATION,STORY_SCROLL_SCREENS} from './motion-curve.js?v=20261005-3';
const browser = typeof window !== 'undefined';
const systemMotion = browser ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
const LAST_FRAME = 479/24;
export function insideFrameTime(frameTime) {
  return Math.min(LAST_FRAME,Math.max(0,frameTime))+1/96;
}
// Seek inside the final frame: browser time precision can round its exact
// starting timestamp into the preceding frame (or the ended state).
const LAST_FRAME_SEEK = insideFrameTime(LAST_FRAME);
// Equalized from the actual source motion, rather than arbitrary slow/fast
// chapters. Native scroll and the guided CTA use the same continuous curve.
export const SCROLL_BEATS = MOTION_POINTS;
const BEAT_SLOPES=SCROLL_BEATS.slice(0,-1).map((v,k)=>(SCROLL_BEATS[k+1][1]-v[1])/(SCROLL_BEATS[k+1][0]-v[0]));
const BEAT_TANGENTS=SCROLL_BEATS.map((_,k)=>{
  if(k===0)return BEAT_SLOPES[0];
  if(k===SCROLL_BEATS.length-1)return BEAT_SLOPES.at(-1);
  return BEAT_SLOPES[k-1]&&BEAT_SLOPES[k]?2/(1/BEAT_SLOPES[k-1]+1/BEAT_SLOPES[k]):0;
});
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};

export function flowRamp(value,edge=.16) {
  // Integrate a smooth velocity ramp, then cruise at a constant rate.
  // Acceleration also reaches zero at the joins (no abrupt camera kick).
  const t=clamp(value);
  if(t>1-edge)return 1-flowRamp(1-t,edge);
  if(t>=edge)return (t-edge/2)/(1-edge);
  const u=t/edge;
  return edge*(u**3-.5*u**4)/(1-edge);
}

export function showcaseFocus(progress) {
  // One continuous approach to Attendance ERP and a matching retreat.
  const {start,peak,leave,end}=SHOWCASE_RANGE;
  return flowRamp((progress-start)/(peak-start))*(1-flowRamp((progress-leave)/(end-leave)));
}

export function showcaseCamera(progress,width,height,family='wide',headerHeight=88,bounds=null) {
  if(!bounds)return {scale:1,lift:0,shift:0,focus:0};
  const focus=showcaseFocus(progress);
  const ratios={wide:16/9,tablet:4/3,'tablet-portrait':3/4,phone:9/16};
  const topEdge={wide:.055,tablet:.112,'tablet-portrait':.026,phone:.033};
  const ratio=ratios[family]||16/9;
  const fittedHeight=(useCoverFrame(width,height,family)?Math.max:Math.min)(height,width/ratio);
  const fittedWidth=fittedHeight*ratio,ox=(width-fittedWidth)/2,oy=(height-fittedHeight)/2;
  const cx=ox+(bounds.left+bounds.right)*fittedWidth/2,cy=oy+(bounds.top+bounds.bottom)*fittedHeight/2;
  const cardWidth=(bounds.right-bounds.left)*fittedWidth,cardHeight=(bounds.bottom-bounds.top)*fittedHeight;
  const widthFraction=family==='phone'?.92:family==='tablet-portrait'?.82:.74;
  const maxScale=Math.max(1,Math.min(2.65,width*widthFraction/cardWidth,(height-headerHeight-40)/cardHeight));
  const scale=Math.min(maxScale,Math.exp(Math.log(maxScale)*focus));
  const top=oy+(topEdge[family]||.055)*fittedHeight;
  const baseLift=Math.max(0,headerHeight+16-top);
  const {liftStart,landed,end,liftEnd}=SHOWCASE_RANGE;
  const liftFocus=ease((progress-liftStart)/(landed-liftStart))*(1-ease((progress-end)/(liftEnd-end)));
  if(!focus&&!liftFocus)return {scale:1,lift:0,shift:0,focus:0};
  const targetY=clamp(headerHeight+(height-headerHeight)*.43,
    headerHeight+16+cardHeight*maxScale/2,height-24-cardHeight*maxScale/2);
  const wantedX=cx+(width/2-cx)*focus;
  const wantedY=(cy+baseLift*liftFocus)*(1-focus)+targetY*focus;
  const marginX=(scale-1)*width/2,marginY=(scale-1)*height/2;
  const shift=clamp(wantedX-(width/2+(cx-width/2)*scale),-marginX,marginX);
  // A small top inset remains behind the fixed header, never below it.
  const lift=clamp(wantedY-(height/2+(cy-height/2)*scale),-marginY,marginY+Math.max(0,headerHeight-8));
  return {scale,lift,shift,focus};
}

export function shouldReframe(previous,next,coarse=false) {
  // Mobile browser chrome changes the visible height, not the composition.
  // An actual rotation/width change still needs an authored-layout refresh.
  return !previous||Math.abs(next.width-previous.width)>2||(!coarse&&Math.abs(next.height-previous.height)>2);
}

export function loadingBudget(sizeBytes,connection={}) {
  const mbps=Number(connection.downlink)||(['slow-2g','2g'].includes(connection.effectiveType)? .5 : connection.effectiveType==='3g'?1.5:8);
  return clamp(((Number(sizeBytes)||12e6)*8/(mbps*1e6)*1.7+12)*1000,30000,180000);
}

export function chooseMotionFamily(width, height) {
  if (height>width) return width<=600 || width/height<2/3 ? 'phone' : 'tablet-portrait';
  return width>=1200 || width/height>=1.6 ? 'wide' : 'tablet';
}

export function chooseMotionVariant(variants,width,height,dpr=1,connection={},quality='auto',device={}) {
  const mp4=variants.filter(v=>v.type==='video/mp4').slice().sort((a,b)=>a.width*a.height-b.width*b.height);
  if (!mp4.length) return null;
  if (quality!=='auto') { const manual=mp4.find(v=>v.quality===quality); if(manual)return manual; }
  const scrubs=mp4.filter(v=>v.scrub);
  const list=scrubs.length?scrubs:mp4;
  const allowed=list.filter(v=>Math.min(v.width,v.height)<=1080);
  const choices=allowed.length?allowed:[list[0]];
  const desktop=height<=width&&(device.portable===false||(width>=1000&&device.portable!==true));
  const limited=(device.memory>0&&device.memory<=2)||(device.cores>0&&device.cores<=2)
    ||(device.memory>0&&device.memory<=4&&device.cores>0&&device.cores<=4);
  const constrained=connection.saveData||['2g','slow-2g','3g'].includes(connection.effectiveType)
    ||(Number(connection.downlink)>0&&connection.downlink<=(desktop?1:3));
  // The efficient option remains a high-quality 720p encode, not the previous
  // 270p fallback. No user-agent guessing or external fingerprinting.
  if(limited||constrained)return choices[0];
  // A short laptop viewport must not choose the 720p tier merely because the
  // browser toolbar consumes height. Keep constrained-device fallbacks above.
  const need=Math.max(desktop?1080:0,Math.min(width,height)*Math.min(2,Math.max(1,dpr)));
  return choices.find(v=>Math.min(v.width,v.height)>=need)||choices.at(-1);
}

export async function chooseCapableVariant(variants,width,height,dpr,connection,device,capabilities) {
  const preferred=chooseMotionVariant(variants,width,height,dpr,connection,'auto',device);
  if(!preferred||typeof capabilities?.decodingInfo!=='function')return preferred;
  const options=[preferred,...variants.filter(v=>v!==preferred&&v.type==='video/mp4'&&v.width*v.height<preferred.width*preferred.height).sort((a,b)=>b.width*b.height-a.width*a.height)];
  for(const variant of options) {
    let timeout;
    let info;
    try {
      info=await Promise.race([
        Promise.resolve(capabilities.decodingInfo({type:'file',video:{contentType:`video/mp4; codecs="${variant.codec||'avc1.640028'}"`,
          width:variant.width,height:variant.height,bitrate:Math.ceil((variant.sizeBytes||4e6)*8/20),framerate:24}})).catch(()=>null),
        new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),700);}),
      ]);
    } catch {info=null;} finally {clearTimeout(timeout);}
    if(!info)return preferred;
    if(info.supported&&info.smooth
      &&(info.powerEfficient!==false||!device?.portable||variant===options.at(-1)))return variant;
  }
  return null;
}

export function scrollProgress(scrollY,top,height,viewportHeight) {
  return Math.min(1,Math.max(0,(scrollY-top)/Math.max(1,height-viewportHeight)));
}
export function guidedStoryEnd(top,height,viewportHeight) {
  // Stop at the last fully pinned viewport, not the next section's heading.
  // Round inward so fractional layout pixels cannot reveal following content.
  return Math.floor(top+Math.max(0,height-viewportHeight));
}
export function guidedScrollDuration(distance,viewportHeight,storyDistance=viewportHeight*STORY_SCROLL_SCREENS) {
  // The same authored journey has the same timing on desktop, tablet and phone.
  return clamp(Math.abs(distance)/Math.max(1,storyDistance)*GUIDED_DURATION,1200,28500);
}
export function guidedScrollPosition(start,end,progress) {
  // Responsive from the first frame; equalization belongs to the media curve.
  return start+(end-start)*clamp(progress);
}
export function guidedMediaRate(progress,progressPerSecond) {
  const left=clamp(progress-.0005),right=clamp(progress+.0005);
  return clamp((progressTime(right)-progressTime(left))/Math.max(.000001,right-left)*progressPerSecond,.125,4);
}
export function progressTime(progress) {
  const p=Math.min(1,Math.max(0,progress)),a=SCROLL_BEATS;
  if(p===1)return LAST_FRAME;
  let i=0;while(i<a.length-2&&p>a[i+1][0])i++;
  const h=a[i+1][0]-a[i][0],u=(p-a[i][0])/h;
  return (2*u**3-3*u**2+1)*a[i][1]+(u**3-2*u**2+u)*h*BEAT_TANGENTS[i]
    +(-2*u**3+3*u**2)*a[i+1][1]+(u**3-u**2)*h*BEAT_TANGENTS[i+1];
}
export function smoothTime(current,target,dt,tolerance=1/240) {
  const blend=1-Math.exp(-Math.max(0,dt)/85);
  return Math.abs(target-current)<tolerance?target:current+(target-current)*blend;
}

export function initMotion() {
  if(!browser||typeof document==='undefined')return;
  const story=document.getElementById('top'),stage=document.getElementById('story-stage');
  const video=document.getElementById('intro-video'),loader=document.getElementById('experience-loader');
  const skip=document.getElementById('skip-loading'),load=document.getElementById('load-experience');
  const progress=document.getElementById('intro-progress'),replay=document.getElementById('replay-intro');
  const status=document.getElementById('story-status'),site=document.getElementById('site-content');
  if(!story||!stage||!video||!loader||!skip||!load)return;
  const connection=navigator.connection||{};
  const meter=document.getElementById('load-progress'),percent=document.getElementById('load-percent');
  const loadStatus=document.getElementById('load-status'),opening=document.getElementById('story-opening');
  const explore=opening.querySelector('.button-primary');
  const chapters=[...document.querySelectorAll('[data-chapter]')];
  const camera=document.createElement('div');camera.className='story-camera';
  video.before(camera);camera.append(video);
  const screens=initProjectScreens(stage);
  const oldInert=site?.inert||false;
  let manifest=null,controller=null,blobURL=null,loading=false,ready=false,disabled=false;
  let family=null,currentAsset=null,frameHandle=0,seekPending=false,seekFrameTime=null,lastTick=0,displayTime=0,targetTime=0;
  let requestEpoch=0,timeout=null,loadBegan=0,oldFocus=null,layoutTop=0,layoutHeight=0,displayProgress=0;
  let presentedTime=0,stageWidth=0,stageHeight=0,headerHeight=88;
  let currentView={scale:1,lift:0,shift:0,focus:0};
  const stats={seeks:0,maxLag:0,completed:false};
  const coarse=window.matchMedia('(pointer:coarse)');
  let framedViewport=null;
  let fullscreenAnchor=null;
  let guideHandle=0,guideRequest=0,guideNative=false,guideProgressPerSecond=0,videoFrameHandle=0,showcasePrecision=false;

  function cancelGuide() {
    guideRequest++;
    story.classList.remove('is-guided');
    document.documentElement.classList.remove('is-guiding-story');
    if(guideHandle)cancelAnimationFrame(guideHandle);
    guideHandle=0;
    guideNative=false;guideProgressPerSecond=0;showcasePrecision=false;
    video.pause();video.playbackRate=1;
    if(videoFrameHandle&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrameHandle);
    videoFrameHandle=0;
  }
  function trackPresentedFrame(now,metadata) {
    videoFrameHandle=0;if(!guideNative||!ready)return;
    presentedTime=metadata.mediaTime;updateCopy(presentedTime);
    videoFrameHandle=video.requestVideoFrameCallback(trackPresentedFrame);
  }
  function guideToPortrait() {
    cancelGuide();
    if(!ready||reduced())return;
    dimensions();
    const startY=scrollY,endY=guidedStoryEnd(layoutTop,story.getBoundingClientRect().height,stage.getBoundingClientRect().height);
    if(endY<=startY)return;
    const duration=guidedScrollDuration(endY-startY,stageHeight,layoutHeight-stageHeight);
    guideProgressPerSecond=(endY-startY)/Math.max(1,layoutHeight-stageHeight)/(duration/1000);
    // During the explicit guided visit, use the decoder's continuous playback
    // instead of flushing it with a seek on every animation frame.
    guideNative=true;
    story.classList.add('is-guided');
    document.documentElement.classList.add('is-guiding-story');
    video.playbackRate=guidedMediaRate(scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight),guideProgressPerSecond);
    Promise.resolve(video.play()).catch(()=>{guideNative=false;});
    if(video.requestVideoFrameCallback)videoFrameHandle=video.requestVideoFrameCallback(trackPresentedFrame);
    let began=null;
    function advance(now) {
      if(document.hidden||reduced()){cancelGuide();return;}
      began ??= now;
      const p=clamp((now-began)/duration);
      window.scrollTo({top:guidedScrollPosition(startY,endY,p),behavior:'instant'});
      if(p<1)guideHandle=requestAnimationFrame(advance);
      else {
        cancelGuide();
        // Freeze the decoded final portrait, not the next section or an
        // imprecise seek at the frame boundary.
        displayProgress=1;displayTime=targetTime=LAST_FRAME;
        if(video.currentTime!==LAST_FRAME_SEEK) {
          seekPending=true;seekFrameTime=LAST_FRAME;video.currentTime=LAST_FRAME_SEEK;stats.seeks++;
        }
        requestTick();
      }
    }
    guideHandle=requestAnimationFrame(advance);
  }

  function reduced() {return document.documentElement.dataset.motion==='reduced' || (document.documentElement.dataset.motionPreference!=='full'&&systemMotion.matches);}
  function stabilizeViewport() {
    const next={width:innerWidth,height:innerHeight};
    if(!shouldReframe(framedViewport,next,coarse.matches))return;
    framedViewport=next;
    if(!coarse.matches) {
      story.style.removeProperty('--story-viewport');
      story.style.setProperty('--story-distance',`${innerHeight*(1+STORY_SCROLL_SCREENS)}px`);
      return;
    }
    // Resolve stable viewport units once, rather than re-measuring innerHeight
    // when the address bar retracts on the first gesture.
    const probe=document.createElement('div');
    probe.style.cssText='position:fixed;left:0;top:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const large=probe.getBoundingClientRect().height||innerHeight;
    probe.style.height='100svh';
    const small=probe.getBoundingClientRect().height||innerHeight;
    probe.remove();
    story.style.setProperty('--story-viewport',`${large}px`);
    story.style.setProperty('--story-distance',`${large+small*STORY_SCROLL_SCREENS}px`);
  }
  function dimensions() {
    stabilizeViewport();
    layoutTop=story.getBoundingClientRect().top+window.scrollY;
    layoutHeight=story.offsetHeight;
    stageWidth=stage.clientWidth;stageHeight=stage.clientHeight;
    headerHeight=document.querySelector('.site-header')?.offsetHeight||88;
    screens.resize(stageWidth,stageHeight);
  }
  function finishLoader() {
    clearTimeout(timeout);loading=false;loader.hidden=true;
    if(site)site.inert=oldInert;
    if(oldFocus?.isConnected&&loader.contains(document.activeElement))oldFocus.focus({preventScroll:true});
  }
  function showLoader() {
    oldFocus=document.activeElement;loader.hidden=false;loading=true;
    if(site)site.inert=true;
    skip.focus({preventScroll:true});
    meter.value=0;percent.textContent='0%';
    loadStatus.textContent='Loading only the film sized for your screen.';
  }
  function showFallback(message) {
    if(guideHandle||guideNative)cancelGuide();
    ready=false;story.classList.remove('is-ready','is-enhanced');
    stage.style.setProperty('--opening-opacity','1');stage.style.setProperty('--opening-shift','0');
    stage.style.setProperty('--scene-scale','1');stage.style.setProperty('--scene-lift','0px');
    stage.style.setProperty('--scene-x','0px');
    currentView={scale:1,lift:0,shift:0,focus:0};
    opening.inert=false;
    if(status)status.textContent=message;
    load.hidden=false;replay.hidden=true;
    for(const c of chapters)c.classList.remove('is-active');
    screens.hide();
    finishLoader();dimensions();
  }
  function releaseVideo() {
    video.pause();video.removeAttribute('src');video.load();seekPending=false;seekFrameTime=null;
    if(blobURL){URL.revokeObjectURL(blobURL);blobURL=null;}
  }
  async function selectAsset() {
    family=manifest.families.find(f=>f.id===chooseMotionFamily(stageWidth,stageHeight))||manifest.families[0];
    const ratio=family.aspect[0]/family.aspect[1],width=Math.min(stageWidth,stageHeight*ratio);
    stage.dataset.family=family.id;stage.dataset.fit=useCoverFrame(stageWidth,stageHeight,family.id)?'cover':'contain';video.poster=family.poster;
    return chooseCapableVariant(family.variants,width,width/ratio,devicePixelRatio,connection,
      {memory:navigator.deviceMemory,cores:navigator.hardwareConcurrency,portable:coarse.matches},navigator.mediaCapabilities);
  }
  async function download(asset,signal) {
    const parts=asset.parts?.length?asset.parts:[{src:asset.src,sizeBytes:asset.sizeBytes}];
    const total=asset.sizeBytes||parts.reduce((sum,part)=>sum+part.sizeBytes,0);
    if(total>180*1024*1024)throw new Error('Selected movie exceeds the browser memory budget.');
    const downloaded=[];let received=0,lastUpdate=0,lastPaint=0;
    const started=performance.now();
    function updateProgress() {
      const elapsed=performance.now()-started;
      if(elapsed-lastPaint<120&&received<total)return;
      lastPaint=elapsed;
      if(total){const p=Math.min(96,Math.floor(received/total*96));meter.value=p;percent.textContent=`${p}%`;}
      else {meter.removeAttribute('value');percent.textContent=`${(received/1048576).toFixed(1)} MB`;}
      if(elapsed-lastUpdate>600||(total&&received>=total)) {
        const remaining=total&&elapsed>1000?Math.ceil((total-received)/(received/elapsed)/1000):0;
        const label=family.id==='phone'?'Phone':family.id.startsWith('tablet')?'Tablet':'Desktop';
        const estimate=remaining>90?`about ${Math.ceil(remaining/60)} min left`:`about ${remaining}s left`;
        loadStatus.textContent=`${label} · ${asset.width} × ${asset.height} · ${(received/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB${remaining>2?` · ${estimate}`:''}`;
        // Real progress can extend the estimate, but stalled transfers fail
        // open. Smaller short-GOP assets no longer justify a 15-minute wait.
        clearTimeout(timeout);
        const budget=Math.min(180000-(performance.now()-loadBegan),Math.max(30000,remaining*1700+12000));
        timeout=setTimeout(()=>controller?.abort(new Error('Loading deadline reached.')),Math.max(1,budget));
        lastUpdate=elapsed;
      }
    }
    for(const part of parts) {
      const response=await fetch(part.src,{signal,cache:'force-cache'});
      if(!response.ok)throw new Error(`Film request failed (${response.status}).`);
      const chunks=[];let partBytes=0;
      if(response.body) {
        const reader=response.body.getReader();
        for(;;) {
          const {done,value}=await reader.read();if(done)break;
          chunks.push(value);partBytes+=value.byteLength;received+=value.byteLength;
          if(received>180*1024*1024){await reader.cancel();throw new Error('Movie memory budget exceeded.');}
          updateProgress();
        }
        downloaded.push(new Blob(chunks));
      } else {
        const blob=await response.blob();downloaded.push(blob);
        partBytes=blob.size;received+=blob.size;updateProgress();
      }
      if(part.sizeBytes&&partBytes!==part.sizeBytes)throw new Error('Movie part is incomplete.');
    }
    if(total&&received!==total)throw new Error('Movie transfer is incomplete.');
    return new Blob(downloaded,{type:'video/mp4'});
  }
  function setStageVar(name,value) {
    if(stage.style.getPropertyValue(name)!==value)stage.style.setProperty(name,value);
  }
  function updateCopy(time) {
    const projectsVisible=screens.update(time,family?.id,currentView);
    const openingAlpha=1-Math.min(1,Math.max(0,(time-.55)/1.6));
    setStageVar('--opening-opacity',openingAlpha.toFixed(3));
    setStageVar('--opening-shift',String(-Math.min(25,time*10)));
    if(opening.inert!==(openingAlpha<.04))opening.inert=openingAlpha<.04;
    const name=projectsVisible?'':time<4?'':time<8?'mind':time<12?'build':time<15.5?'work':time>18.3?'return':'';
    for(const c of chapters) {
      const active=c.dataset.chapter===name;c.classList.toggle('is-active',active);
      for(const a of c.querySelectorAll('a'))a.tabIndex=active?0:-1;
    }
    progress.value=displayProgress*20;
    if(targetTime>=LAST_FRAME-.03&&!stats.completed) {
      stats.completed=true;document.dispatchEvent(new CustomEvent('portfolio:scroll-story-complete',{detail:{family:family.id,stats:{...stats}}}));
    }
    if(targetTime<1)stats.completed=false;
  }
  function tick(now) {
    frameHandle=0;if(!ready||disabled||document.hidden)return;
    if(layoutTop+layoutHeight<scrollY||layoutTop>scrollY+innerHeight)return;
    targetTime=progressTime(scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight));
    const dt=Math.min(48,now-(lastTick||now-16));
    const targetProgress=scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight);
    displayProgress=smoothTime(displayProgress,targetProgress,dt,1/100000);
    displayTime=smoothTime(displayTime,targetTime,dt);
    lastTick=now;
    // Pan and zoom the same film/overlay plane, anchored to the middle ERP card.
    const view=showcaseCamera(displayProgress,stageWidth,stageHeight,family?.id,headerHeight,screens.focusBounds(family?.id));
    currentView=view;
    setStageVar('--scene-scale',String(view.scale));
    setStageVar('--scene-lift',`${view.lift}px`);
    setStageVar('--scene-x',`${view.shift}px`);
    const wanted=Math.min(LAST_FRAME,Math.round(displayTime*24)/24);
    const preciseShowcase=guideNative&&displayTime>=14.5&&displayTime<=15.85;
    // Use the same frame-safe offset as the final portrait. Otherwise a seek
    // can decode the previous frame and briefly hide a newly revealed title.
    const seekAt=preciseShowcase?insideFrameTime(wanted):wanted;
    if(guideNative) {
      const rate=guidedMediaRate(displayProgress,guideProgressPerSecond);
      if(Math.abs(video.playbackRate-rate)>.025)video.playbackRate=rate;
      // At the slow project reveal the native decoder's clock can otherwise
      // run through the reading window before the scroll camera catches up.
      // Seek the few changing source frames precisely while the independent
      // camera keeps animating continuously; resume playback for the return.
      if(preciseShowcase&&!showcasePrecision){showcasePrecision=true;video.pause();}
      else if(!preciseShowcase&&showcasePrecision){
        showcasePrecision=false;
        Promise.resolve(video.play()).catch(()=>{guideNative=false;});
      }
      if(!video.requestVideoFrameCallback)presentedTime=video.currentTime;
    }
    if(!seekPending&&Math.abs(video.currentTime-seekAt)>=(guideNative&&!preciseShowcase ? .45 : 1/48)) {
      seekPending=true;seekFrameTime=preciseShowcase?wanted:null;video.currentTime=seekAt;stats.seeks++;
    }
    stats.maxLag=Math.max(stats.maxLag,Math.abs(video.currentTime-targetTime));
    updateCopy(presentedTime);
    if(Math.abs(displayTime-targetTime)>1/240||Math.abs(displayProgress-targetProgress)>1/10000)frameHandle=requestAnimationFrame(tick);
  }
  function requestTick() {if(ready&&!frameHandle)frameHandle=requestAnimationFrame(tick);}
  async function start({manual=false,rotation=false}={}) {
    if(loading)return;
    if(reduced()&&!manual){showFallback('Reduced motion: static portrait. The complete portfolio is ready below.');return;}
    disabled=false;const epoch=++requestEpoch;controller?.abort();controller=new AbortController();
    if(rotation){ready=false;screens.hide();}
    showLoader();loadBegan=performance.now();
    timeout=setTimeout(()=>controller?.abort(new Error('Loading deadline reached.')),15000);
    try {
      manifest ||= await fetch('./assets/motion/manifest.json',{signal:controller.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Film manifest unavailable.');return r.json();});
      const asset=await selectAsset();if(!asset)throw new Error('No smooth compatible movie.');
      clearTimeout(timeout);
      timeout=setTimeout(()=>controller?.abort(new Error('Loading deadline reached.')),loadingBudget(asset.sizeBytes,connection));
      if(rotation)releaseVideo();
      const blob=await download(asset,controller.signal);
      if(epoch!==requestEpoch)return;
      releaseVideo();currentAsset=asset;blobURL=URL.createObjectURL(blob);
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{video.removeEventListener('loadeddata',done);video.removeEventListener('error',bad);controller.signal.removeEventListener('abort',aborted);};
        const done=()=>{cleanup();resolve();};const bad=()=>{cleanup();reject(new Error('Cannot decode movie.'));};
        const aborted=()=>{cleanup();reject(new Error('Loading stopped.'));};
        video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',bad,{once:true});
        controller.signal.addEventListener('abort',aborted,{once:true});video.src=blobURL;video.preload='auto';video.load();
      });
      loadStatus.textContent='Preparing smooth scrolling and project previews.';
      await screens.loaded;
      if(epoch!==requestEpoch)return;
      story.classList.add('is-enhanced','is-ready');ready=true;
      load.hidden=true;replay.hidden=false;dimensions();
      displayProgress=scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight);
      displayTime=progressTime(displayProgress);targetTime=displayTime;presentedTime=displayTime;
      video.currentTime=displayTime;video.pause();meter.value=100;percent.textContent='100%';
      status.textContent='The scroll experience is ready.';
      finishLoader();requestTick();
      document.dispatchEvent(new CustomEvent('portfolio:scroll-ready',{detail:{family:family.id,
        asset:currentAsset.src||currentAsset.parts?.[0]?.src,quality:currentAsset.quality,
        width:currentAsset.width,height:currentAsset.height,parts:currentAsset.parts?.length||1,bytes:blob.size}}));
    } catch(error) {
      if(epoch!==requestEpoch)return;
      releaseVideo();showFallback('The scroll film did not finish loading. Continue to the portfolio or choose Load the scroll film.');
    }
  }
  function skipLoading() {
    cancelGuide();
    requestEpoch++;controller?.abort();disabled=true;releaseVideo();showFallback('Motion skipped. The portfolio is ready.');
    const work=document.getElementById('work');work.scrollIntoView({behavior:'instant',block:'start'});
    work.setAttribute('tabindex','-1');work.focus({preventScroll:true});
  }
  skip.addEventListener('click',skipLoading);
  loader.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();skipLoading();}});
  load.addEventListener('click',()=>{
    if(reduced()) {
      // The explicit opt-in should also enable the matching layout preference.
      document.querySelector('[data-motion-toggle]')?.click();
    } else start({manual:true});
  });
  explore?.addEventListener('click',async event=>{
    if(reduced())return; // Normal anchor access is intentional in reduced motion.
    event.preventDefault();
    const request=++guideRequest;
    if(!ready)await start({manual:true});
    if(request!==guideRequest)return;
    if(ready)guideToPortrait();
    else document.getElementById('work')?.scrollIntoView({behavior:'instant',block:'start'});
  });
  window.addEventListener('wheel',cancelGuide,{passive:true});
  window.addEventListener('touchstart',cancelGuide,{passive:true});
  window.addEventListener('pointerdown',cancelGuide,{passive:true});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('a,button')!==explore)cancelGuide();
  });
  window.addEventListener('keydown',event=>{
    if(['Escape','Tab','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(event.key))cancelGuide();
  });
  replay.addEventListener('click',()=>story.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'}));
  video.addEventListener('seeked',()=>{
    seekPending=false;presentedTime=seekFrameTime??video.currentTime;seekFrameTime=null;
    updateCopy(presentedTime);requestTick();
  });
  video.addEventListener('error',()=>{if(ready){releaseVideo();showFallback('Film playback unavailable. All portfolio sections remain accessible.');}});
  window.addEventListener('scroll',requestTick,{passive:true});
  let resizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      const structural=shouldReframe(framedViewport,{width:innerWidth,height:innerHeight},coarse.matches);
      if(structural)cancelGuide();
      const previousProgress=ready?scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight):null;
      dimensions();
      if(family)stage.dataset.fit=useCoverFrame(stageWidth,stageHeight,family.id)?'cover':'contain';
      if(structural&&coarse.matches&&previousProgress>0&&previousProgress<1) {
        window.scrollTo({top:layoutTop+previousProgress*(layoutHeight-stageHeight),behavior:'instant'});
      }
      if(ready&&family&&chooseMotionFamily(stageWidth,stageHeight)!==family.id)start({manual:true,rotation:true});
      else requestTick();
    },150);
  },{passive:true});
  window.addEventListener('portfolio:fullscreenchange',()=>{
    const anchor=fullscreenAnchor||{p:ready?displayProgress:null,after:scrollY-(layoutTop+layoutHeight)};
    fullscreenAnchor=null;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      framedViewport=null;dimensions();
      if(anchor.after>=0) {
        window.scrollTo({top:layoutTop+layoutHeight+anchor.after,behavior:'instant'});
      } else if(anchor.p!==null&&anchor.p>=0&&anchor.p<1) {
        window.scrollTo({top:layoutTop+anchor.p*(layoutHeight-stageHeight),behavior:'instant'});
        displayProgress=anchor.p;displayTime=progressTime(anchor.p);
      }
      if(ready&&family&&chooseMotionFamily(stageWidth,stageHeight)!==family.id)start({manual:true,rotation:true});
      else requestTick();
    }));
  });
  window.addEventListener('portfolio:fullscreenwillchange',()=>{
    fullscreenAnchor={p:ready?scrollProgress(scrollY,layoutTop,layoutHeight,stageHeight):null,after:scrollY-(layoutTop+layoutHeight)};
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGuide();if(frameHandle)cancelAnimationFrame(frameHandle);frameHandle=0;}else requestTick();});
  window.addEventListener('portfolio:motionchange',event=>{
    if(event.detail?.reduced){cancelGuide();disabled=true;requestEpoch++;controller?.abort();releaseVideo();showFallback('Reduced motion enabled. Explore the portfolio directly.');}
    else {disabled=false;start({manual:true});}
  });
  window.addEventListener('pagehide',()=>{cancelGuide();controller?.abort();if(blobURL)URL.revokeObjectURL(blobURL);},{once:true});
  dimensions();
  if(location.hash&&location.hash!=='#top'){load.hidden=false;status.textContent='Direct link: scroll film skipped.';}
  else if(connection.saveData){load.hidden=false;status.textContent='Data saver: static portrait. Load the film only if you choose.';}
  else start();
  return {start,skipLoading,getState:()=>({ready,loading,family:family?.id,targetTime,displayTime,mediaTime:video.currentTime,stats})};
}
