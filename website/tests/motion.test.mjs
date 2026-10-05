import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { chooseMotionFamily, chooseMotionVariant, chooseCapableVariant, scrollProgress, progressTime, smoothTime, SCROLL_BEATS, showcaseFocus, showcaseCamera, loadingBudget, shouldReframe, guidedStoryEnd, guidedScrollDuration, guidedScrollPosition, guidedFrameDuration, guidedMediaRate, insideFrameTime, flowRamp } from '../motion.js';
import {SHOWCASE_RANGE,GUIDED_DURATION,STORY_SCROLL_SCREENS} from '../motion-curve.js';
import {planeMatrix, SCREEN_PROJECTS, projectFocusBounds, useCoverFrame} from '../project-screens.js';
const surfaces=JSON.parse(readFileSync(new URL('../assets/motion/project-surfaces.json',import.meta.url),'utf8'));

const variants = [
  { quality: 'low', type: 'video/mp4', width: 864, height: 486 },
  { quality: 'balanced', type: 'video/mp4', width: 1280, height: 720 },
  { quality: 'high', type: 'video/mp4', width: 1920, height: 1080 },
  { quality: 'max', type: 'video/mp4', width: 3840, height: 2160 },
];

test('viewport shape selects authored media, not a generic cover crop', () => {
  for (const [w,h,family] of [
    [320,568,'phone'], [390,844,'phone'], [430,932,'phone'],
    [768,1024,'tablet-portrait'], [820,1180,'tablet-portrait'],
    [1024,768,'tablet'], [1280,800,'wide'], [1366,768,'wide'],
    [2560,1080,'wide'], [844,390,'wide'],
  ]) assert.equal(chooseMotionFamily(w,h), family, `${w}x${h}`);
});

test('auto never downloads the max raster', () => {
  for (const dpr of [1,2,3,4]) {
    assert.equal(chooseMotionVariant(variants,3840,2160,dpr).quality,'high');
  }
});

test('display needs and constrained hardware select an appropriate rendition', () => {
  const candidates=variants.filter(v=>v.quality!=='low');
  assert.equal(chooseMotionVariant(candidates,1920,1080,2,{downlink:20}).quality,'high');
  for(const connection of [{saveData:true},{effectiveType:'2g'},{effectiveType:'3g'},{downlink:.8}])
    assert.equal(chooseMotionVariant(candidates,1920,1080,2,connection).quality,'balanced');
  assert.equal(chooseMotionVariant(candidates,640,360,1,{}).quality,'balanced');
});

test('explicit 4K choice is available without making it the default', () => {
  assert.equal(chooseMotionVariant(variants,400,225,1,{},'max').quality,'max');
  assert.equal(chooseMotionVariant(variants,400,225,1,{saveData:true},'max').quality,'max');
});

test('selection does not mutate manifest arrays; missing media fails safely', () => {
  const before = JSON.stringify(variants);
  chooseMotionVariant(variants,1000,600,2);
  assert.equal(JSON.stringify(variants),before);
  assert.equal(chooseMotionVariant([],1000,600,2),null);
  assert.equal(chooseMotionVariant([{type:'video/webm',width:100,height:100}],1000,600,2),null);
});

test('scroll progress is bounded, reversible, and finishes before following content', () => {
  assert.equal(scrollProgress(0,0,6000,1000),0);
  assert.equal(scrollProgress(2500,0,6000,1000),.5);
  assert.equal(scrollProgress(5000,0,6000,1000),1);
  assert.equal(scrollProgress(8000,0,6000,1000),1);
  assert.equal(scrollProgress(-500,0,6000,1000),0);
  assert.equal(progressTime(1),479/24);
});

test('guided visit ends on the full final portrait, before the work section enters',()=>{
  for(const [top,height,viewport] of [[0,5760,600],[0,10368,1080],[0,7427,844],[120,9830,1024]]) {
    const end=guidedStoryEnd(top,height,viewport);
    assert.equal(scrollProgress(end,top,height,viewport),1);
    assert.equal(top+height-end,viewport,'following section stays below the viewport');
    assert.equal(progressTime(scrollProgress(end,top,height,viewport)),479/24);
    const oldWorkTarget=top+height-108;
    assert(end<oldWorkTarget,'do not scroll past the final photo to align the work heading');
    const oldRate=(oldWorkTarget-top)/guidedScrollDuration(oldWorkTarget-top,viewport,height-viewport);
    const newRate=(end-top)/guidedScrollDuration(end-top,viewport,height-viewport);
    assert(Math.abs(oldRate-newRate)<1e-9,'stop earlier without changing the journey speed');
    assert.equal(guidedScrollDuration(end-top,viewport,height-viewport),GUIDED_DURATION);
  }
});

test('fractional story endpoints round inward without skipping the last frame',()=>{
  const top=13.4,height=7427.2,viewport=844;
  const end=guidedStoryEnd(top,height,viewport);
  assert.equal(end,6596);
  assert(top+height-end>=viewport);
  assert.equal(Math.round(progressTime(scrollProgress(end,top,height,viewport))*24),479);
  assert.equal(guidedStoryEnd(100,500,600),100);
});

test('precise seeks remain inside the intended frame after browser time rounding',()=>{
  for(let frame=0;frame<480;frame++) {
    const target=insideFrameTime(frame/24);
    for(const rounded of [Math.round(target*1e6)/1e6,Math.floor(target*1e6)/1e6]) {
      assert.equal(Math.floor(rounded*24),frame,'do not decode the preceding frame');
      assert(rounded<20,'last portrait stays before the ended state');
    }
  }
  assert.equal(insideFrameTime(20),19.96875);
});

test('scroll timing smoothing never overshoots either direction', () => {
  for(const [current,target] of [[1,10],[10,1]]) {
    const next=smoothTime(current,target,16);
    assert.ok(next>Math.min(current,target)&&next<Math.max(current,target));
  }
});

test('independently decodable scrub movie is selected for background', () => {
  const withScrub=[...variants,{type:'video/mp4',quality:'balanced',width:960,height:540,scrub:true}];
  assert.equal(chooseMotionVariant(withScrub,1280,720,2).scrub,true);
  assert.equal(chooseMotionVariant(withScrub,1280,720,2,{},'max').quality,'max');
});

test('eye passes are quicker while the moving project reveal has readable breathing room', () => {
  for(const [p,t] of SCROLL_BEATS)assert.ok(Math.abs(progressTime(p)-t)<1e-8);
  const times=Array.from({length:1001},(_,i)=>progressTime(i/1000));
  assert.ok(times.every((t,i)=>i===0||t>times[i-1]));
  assert.ok(progressTime(.04)>1);
  const atFrame=frame=>SCROLL_BEATS.find(([,time])=>Math.abs(time-frame/24)<1e-8)?.[0];
  const entry=atFrame(96)-atFrame(22),exit=atFrame(471)-atFrame(432);
  const reference=GUIDED_DURATION/1000;
  assert.ok(entry*reference>=1.9&&entry*reference<=2.3,'eye entry is brisk, without the former long macro crawl');
  assert.ok(exit*reference>=1.65&&exit*reference<=2.1,'the same eye returns briskly');
  assert.ok(exit<entry);
  assert.ok(atFrame(22)<.015,'near-static source opening is not stretched');
  const reading=(atFrame(374)-atFrame(361))*reference;
  assert.ok(reading>=2.6&&reading<=3.1,'readable project names during the moving focus');
  assert.ok(progressTime(.64)>progressTime(.61));
  assert.ok(progressTime(.67)>progressTime(.64));
});

test('interior travel has a steady cadence instead of the old stop-start rate curve',()=>{
  const atFrame=frame=>SCROLL_BEATS.find(([,time])=>Math.round(time*24)===frame)[0];
  for(const [start,end,seconds,frames] of [[100,235,3.6,144],[244,319,2.7,84],[378,427,2.8,58]]) {
    for(let frame=start;frame<end;frame++) {
      const dt=(atFrame(frame+1)-atFrame(frame))*GUIDED_DURATION/1000;
      assert(Math.abs(dt-seconds/frames)<.000001,'uniform non-eye travel, apart from boundary blends');
    }
  }
  for(const [start,end] of [[24,93],[434,469]]) {
    for(let frame=start;frame<end;frame++) {
      const dt=(atFrame(frame+1)-atFrame(frame))*GUIDED_DURATION/1000;
      assert(dt>=1/96-.00001&&dt<=1/20+.00001,'bounded eye-frame cadence');
    }
  }
});

test('focus camera cruises at a steady rate, with short smooth starts and turns',()=>{
  assert.equal(flowRamp(0),0);assert.equal(flowRamp(1),1);
  for(let i=1;i<1000;i++)assert(flowRamp(i/1000)>flowRamp((i-1)/1000));
  for(const t of [.25,.4,.6,.75]){
    const derivative=(flowRamp(t+.00001)-flowRamp(t-.00001))/.00002;
    assert(Math.abs(derivative-1/.84)<.00001);
  }
});

test('a busy renderer cannot fast-forward the paused project camera',()=>{
  assert.equal(guidedFrameDuration(16,true),16);
  assert.equal(guidedFrameDuration(50,true),50);
  assert.equal(guidedFrameDuration(-5,true),0);
  assert.equal(guidedFrameDuration(700,true),1000/30);
  assert.equal(guidedFrameDuration(700,false),700,'continuous video keeps its native clock outside the precise showcase');
  const p=SHOWCASE_RANGE.start+(SHOWCASE_RANGE.peak-SHOWCASE_RANGE.start)*.5;
  const delta=guidedFrameDuration(700,true)/GUIDED_DURATION;
  assert(Math.abs(showcaseFocus(p+delta)-showcaseFocus(p))<.04,'no large camera leap after the stall');
});

test('project camera stays aligned with the retimed showcase, then withdraws once', () => {
  assert.equal(showcaseFocus(.3),0);
  const {start,peak,leave,end}=SHOWCASE_RANGE;
  assert.ok(showcaseFocus((start+peak)/2)>0);
  assert.ok(showcaseFocus(peak)>showcaseFocus((start+peak)/2));
  assert.ok(showcaseFocus((leave+end)/2)<showcaseFocus(peak));
  assert.equal(peak,leave,'no flat camera hold while scrolling');
  for(const fraction of [.15,.35,.65,.85]){
    const forward=showcaseFocus(start+(peak-start)*fraction);
    const backward=showcaseFocus(end-(end-peak)*fraction);
    assert.ok(Math.abs(forward-backward)<.00001,'matching zoom-in and zoom-out pace');
  }
  assert.equal(showcaseFocus(.8),0);
  for(let i=0;i<=1000;i++)assert.ok(showcaseFocus(i/1000)>=0&&showcaseFocus(i/1000)<=1);
});

test('Attendance ERP occupies the middle plane; no private repository is linked', () => {
  assert.equal(SCREEN_PROJECTS[1].id,'attendance');
  assert.equal(SCREEN_PROJECTS[1].title,'Attendance ERP');
  assert.equal(new Set(SCREEN_PROJECTS.map(p=>p.id)).size,3);
  assert.ok(SCREEN_PROJECTS.every(p=>!p.href));
});

test('Attendance ERP becomes the clear focal point without clipping its card', () => {
  for(const [w,h,f] of [[1366,768,'wide'],[1366,600,'wide'],[1024,768,'tablet'],[390,844,'phone'],[820,1180,'tablet-portrait']]){
    const bounds=projectFocusBounds(surfaces,f),camera=showcaseCamera(SHOWCASE_RANGE.peak,w,h,f,88,bounds);
    const ratio=surfaces.families[f].aspect[0]/surfaces.families[f].aspect[1];
    const fit=(useCoverFrame(w,h,f)?Math.max:Math.min)(h,w/ratio),width=fit*ratio;
    const x=value=>((w-width)/2+value*width-w/2)*camera.scale+w/2+camera.shift;
    const y=value=>((h-fit)/2+value*fit-h/2)*camera.scale+h/2+camera.lift;
    assert(x(bounds.left)>=8&&x(bounds.right)<=w-8,`${f}: whole ERP card fits horizontally`);
    assert(y(bounds.top)>=96&&y(bounds.bottom)<=h-20,`${f}: heading and lower margin remain clear`);
    assert(camera.scale>=(f==='phone'?1.2:2)&&camera.scale<=2.65);
    assert(Math.abs((x(bounds.left)+x(bounds.right))/2-w/2)<1);
    assert.deepEqual(showcaseCamera(.1,w,h,f,88,bounds),{scale:1,lift:0,shift:0,focus:0});
    assert.deepEqual(showcaseCamera(1,w,h,f,88,bounds),{scale:1,lift:0,shift:0,focus:0});
  }
  assert.equal(projectFocusBounds({},'wide'),null);
  assert.deepEqual(showcaseCamera(.6,1366,768,'wide',88),{scale:1,lift:0,shift:0,focus:0});
});

test('high-quality efficient media is selected on slow networks and limited devices', () => {
  const scrubs=variants.slice(1,3).map(v=>({...v,scrub:true}));
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{effectiveType:'3g'}).quality,'balanced');
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{downlink:.8}).quality,'balanced');
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{},'auto',{memory:2}).quality,'balanced');
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{},'auto',{cores:2}).quality,'balanced');
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{},'auto',{memory:4,cores:4}).quality,'balanced');
  assert.equal(chooseMotionVariant(scrubs,1920,1080,2,{downlink:20},'auto',{memory:8,cores:8}).quality,'high');
});

test('short laptop viewports still choose Full HD when the device can handle it', () => {
  const candidates=variants.slice(1,3);
  for(const [width,height] of [[1280,650],[1366,600],[1440,720],[1920,700]]) {
    assert.equal(chooseMotionVariant(candidates,width,height,1,{downlink:10},'auto',{memory:8,cores:8,portable:false}).quality,'high');
  }
  assert.equal(chooseMotionVariant(candidates,1066,600,1,{downlink:1.6,effectiveType:'4g'},'auto',{memory:8,cores:8,portable:false}).quality,'high','a coarse 4G estimate should not needlessly soften desktop video');
  assert.equal(chooseMotionVariant(candidates,1366,600,1,{downlink:.8},'auto',{memory:8,cores:8,portable:false}).quality,'balanced');
  assert.equal(chooseMotionVariant(candidates,1024,700,1,{},'auto',{portable:true}).quality,'balanced');
});

test('loading deadline follows transfer size and network speed, but is bounded', () => {
  assert.equal(loadingBudget(2e6,{downlink:100}),30000);
  assert.equal(loadingBudget(20e6,{downlink:.2}),180000);
  assert.ok(loadingBudget(60e6,{downlink:2})>loadingBudget(60e6,{downlink:20}));
  assert.ok(Number.isFinite(loadingBudget(undefined)));
});

test('mobile browser toolbar movement does not reframe or rescale the scroll range', () => {
  assert.equal(shouldReframe({width:390,height:760},{width:390,height:844},true),false);
  assert.equal(shouldReframe({width:390,height:844},{width:390,height:760},true),false);
  assert.equal(shouldReframe({width:390,height:844},{width:844,height:390},true),true);
  assert.equal(shouldReframe({width:1366,height:768},{width:1366,height:900},false),true);
  assert.equal(shouldReframe(null,{width:390,height:844},true),true);
});

test('hero guided visit takes a readable route rather than a fast default anchor jump', () => {
  assert.ok(GUIDED_DURATION>=17000&&GUIDED_DURATION<=18000);
  for(const viewport of [600,768,844,1180]){
    const span=viewport*STORY_SCROLL_SCREENS;
    assert.equal(guidedScrollDuration(span,viewport,span),GUIDED_DURATION);
    assert.equal(guidedScrollDuration(span/2,viewport,span),GUIDED_DURATION/2);
  }
  assert.equal(guidedScrollDuration(0,768),1200);
  assert.equal(guidedScrollPosition(0,6800,0),0);
  assert.equal(guidedScrollPosition(0,6800,1),6800);
  assert.equal(guidedScrollPosition(0,6800,.1),680,'no slow ease-in before the already slow opening');
  const steps=Array.from({length:10},(_,i)=>guidedScrollPosition(0,6800,(i+1)/10)-guidedScrollPosition(0,6800,i/10));
  assert.ok(steps.every(step=>Math.abs(step-680)<1e-8),'guided scroll distance advances at one steady rate');
  assert.equal(guidedScrollPosition(500,6800,0),500);
});

test('decoder capabilities can select a smooth alternative before downloading',async()=>{
  const candidates=variants.slice(1,3).map(v=>({...v,sizeBytes:10e6}));
  const calls=[];
  const caps={decodingInfo:async c=>{calls.push(c);return {supported:true,smooth:c.video.width<1900,powerEfficient:true};}};
  assert.equal((await chooseCapableVariant(candidates,1920,1080,2,{},{},caps)).quality,'balanced');
  assert.equal(calls.length,2);
  assert.equal((await chooseCapableVariant(candidates,1920,1080,2,{},{},{decodingInfo:async()=>{throw new Error('unavailable');}})).quality,'high');
  assert.equal(await chooseCapableVariant(candidates,1920,1080,2,{},{},{decodingInfo:async()=>({supported:false,smooth:false})}),null);
});

test('guided native playback follows the calibrated curve at bounded supported rates',()=>{
  for(let i=0;i<=1000;i++){
    const rate=guidedMediaRate(i/1000,1/27);
    assert.ok(Number.isFinite(rate)&&rate>=.125&&rate<=4);
  }
  assert.ok(guidedMediaRate(.03,1/27)>0);
  assert.ok(guidedMediaRate(.9,1/27)<guidedMediaRate(.01,1/27),'return remains controlled after the fast opening');
});

test('project card homography maps all corners to the real plane', () => {
  const q=[[100,70],[610,90],[620,380],[110,360]],m=planeMatrix(q);
  for(const [[x,y],[X,Y]] of [[[0,0],q[0]],[[640,0],q[1]],[[640,360],q[2]],[[0,360],q[3]]]){
    const divisor=m[3]*x+m[7]*y+m[15];
    assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/divisor-X)<1e-7);
    assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/divisor-Y)<1e-7);
  }
  assert.equal(planeMatrix([[0,0],[0,0],[0,0],[0,0]]),null);
});
