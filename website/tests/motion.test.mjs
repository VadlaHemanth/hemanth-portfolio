import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMotionFamily, chooseMotionVariant, chooseCapableVariant, scrollProgress, progressTime, smoothTime, SCROLL_BEATS, showcaseFocus, showcaseCamera, loadingBudget, shouldReframe, guidedScrollDuration, guidedScrollPosition, guidedMediaRate } from '../motion.js';
import {SHOWCASE_RANGE} from '../motion-curve.js';
import {planeMatrix, SCREEN_PROJECTS} from '../project-screens.js';

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
  assert.ok(entry*27>=4.2&&entry*27<=4.5,'entry shortened from the earlier 5.2 seconds');
  assert.ok(exit*27>=3.8&&exit*27<=4.15,'return is slightly brisker than entry');
  assert.ok(exit<entry);
  assert.ok(atFrame(22)<.015,'near-static source opening is not stretched');
  const reading=(atFrame(374)-atFrame(361))*27;
  assert.ok(reading>=2.8&&reading<=3.5,'readable project names without a repeated stationary page');
  assert.ok(progressTime(.64)>progressTime(.61));
  assert.ok(progressTime(.67)>progressTime(.64));
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

test('showcase camera reserves navigation clearance across authored aspect ratios', () => {
  for(const [w,h,f,edge,ratio] of [[1366,768,'wide',.055,16/9],[1024,768,'tablet',.112,4/3],[390,693,'phone',.033,9/16],[768,1024,'tablet-portrait',.026,3/4]]){
    const camera=showcaseCamera(SHOWCASE_RANGE.peak,w,h,f,88),fit=Math.min(h,w/ratio);
    const top=((h-fit)/2+edge*fit-h*.35)*camera.scale+h*.35+camera.lift;
    assert.ok(top>=103.9,`${f} top=${top}`);
    assert.ok(camera.scale>1&&camera.scale<=1.075);
    assert.deepEqual(showcaseCamera(.1,w,h,f,88),{scale:1,lift:0});
  }
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
  assert.ok(guidedScrollDuration(6800,768)>=25000);
  assert.ok(guidedScrollDuration(6800,768)<=30000);
  assert.equal(guidedScrollDuration(0,768),5000);
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
  assert.ok(guidedMediaRate(.9,1/27)<guidedMediaRate(.01,1/27),'native eye return remains deliberate');
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
