import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPaceMap,zoomUnits,tunnelDepthPerUnit} from './pace-map.mjs';

// Hemanth's v3 chapter list at 1440x900 (zoom length depends on the screen).
const twist={machine:2.1,break:3.1,mind:3.1,portal:2.2,zoom:1.4};
const forward=[['zoom',5],['portal',.45],['mind',4],['break',2.4],['machine',2.55]];
const CASE_STUDY=[
  ...forward.map(([id,length])=>({id,length,speed:1})),
  {id:'burst',length:1.6,speed:1},{id:'assemble',length:1.25,speed:1},
  {id:'focus',length:.9,speed:.85},{id:'hold',length:1.2,speed:.34},
  {id:'release',length:.9,speed:.85},{id:'collapse',length:1.15,speed:1.15},
  ...forward.slice().reverse().map(([id,length])=>({id:`back-${id}`,length,speed:twist[id]})),
  {id:'settle',length:.75,speed:.6,endSpeed:.6*.22},
];

function largestStep(map,steps) {
  let previous=map.visualAt(0),previousStep=null,worst=0;
  for(let i=1;i<=steps;i++){
    const visual=map.visualAt(map.scrollTotal*i/steps),step=visual-previous;
    assert(step>=-1e-12,'visual position never runs backwards');
    if(previousStep>1e-9)worst=Math.max(worst,Math.abs(step-previousStep)/previousStep);
    previousStep=step;previous=visual;
  }
  return worst;
}

test('equal speeds give a linear map: equal scroll, equal perceived motion',()=>{
  const map=createPaceMap([{length:2,speed:1},{length:3,speed:1}],{scrollPerUnit:.25});
  assert.equal(map.visualTotal,5);
  assert(Math.abs(map.scrollTotal-1.25)<1e-9);
  for(let i=0;i<=100;i++){
    const scroll=map.scrollTotal*i/100;
    assert(Math.abs(map.visualAt(scroll)-scroll/.25)<1e-9);
    assert(Math.abs(map.rateAt(scroll)-4)<1e-9);
  }
  assert.equal(map.visualAt(-5),0);assert.equal(map.visualAt(99),5);
  assert.equal(map.scrollAt(-1),0);assert.equal(map.scrollAt(99),map.scrollTotal);
});

test('blended pace changes never step; unblended ones do',()=>{
  const smooth=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:.55});
  assert(largestStep(smooth,4000)<.05,'speed changes by under 5% per 1/4000 of the journey');
  // Coarser steps keep each hard speed change inside one step, so it cannot hide.
  const hard=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:0});
  assert(largestStep(hard,400)>.3,'without blending the hold is a visible step');
});

test('the case-study chapters come to about seven screens of scroll',()=>{
  const map=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:.55});
  assert(map.scrollTotal>6.9&&map.scrollTotal<7.2,`journey is ${map.scrollTotal} viewport heights`);
  assert(Math.abs(map.visualTotal-36.55)<1e-9);
});

test('harmonic blending keeps scroll additive and slow chapters take longer',()=>{
  const chapters=[{length:4,speed:1},{length:2,speed:.5},{length:4,speed:1}];
  const hard=createPaceMap(chapters,{scrollPerUnit:1,blend:0});
  const soft=createPaceMap(chapters,{scrollPerUnit:1,blend:.3});
  assert(Math.abs(soft.scrollTotal-hard.scrollTotal)/hard.scrollTotal<.002);
  assert(Math.abs(hard.scrollTotal-12)<.01);
  const slowScroll=soft.scrollAt(6)-soft.scrollAt(4);
  assert(Math.abs(slowScroll-4)/4<.1,`slow chapter takes ${slowScroll}`);
  assert(soft.rateAt(soft.scrollAt(5))<soft.rateAt(soft.scrollAt(1))*.55);
});

test('an end speed eases the camera toward rest without stopping',()=>{
  const map=createPaceMap([{length:3,speed:1},{id:'settle',length:1,speed:.6,endSpeed:.132}],{scrollPerUnit:.2,blend:.2});
  let previous=Infinity;
  for(let i=0;i<=200;i++){
    const rate=map.rateAt(map.scrollAt(3.2+.8*i/200));
    assert(rate<=previous+1e-9,'rate keeps falling through the arrival');
    previous=rate;
  }
  const last=map.rateAt(map.scrollTotal);
  assert(last>0&&Math.abs(last-.132/.2)/(.132/.2)<.25,`final rate ${last}`);
});

test('at() reports the chapter, local progress and rate for a scroll position',()=>{
  const map=createPaceMap([{id:'dive',length:2,speed:1},{id:'hold',length:1,speed:.5}],{scrollPerUnit:1,blend:0});
  assert.deepEqual(map.at(0),{visual:0,index:0,id:'dive',t:0,rate:1});
  const middle=map.at(1);
  assert.equal(middle.id,'dive');assert(Math.abs(middle.t-.5)<1e-9);
  const hold=map.at(3);
  assert.equal(hold.id,'hold');assert(Math.abs(hold.t-.5)<1e-3);assert(Math.abs(hold.rate-.5)<1e-9);
  const end=map.at(map.scrollTotal);
  assert.equal(end.id,'hold');assert.equal(end.t,1);
  assert.equal(map.chapters[1].start,2);assert.equal(map.chapters[1].end,3);
});

test('scrollAt and visualAt invert each other',()=>{
  const map=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:.55});
  for(let i=0;i<=500;i++){
    const visual=map.visualTotal*i/500,scroll=map.scrollTotal*i/500;
    assert(Math.abs(map.visualAt(map.scrollAt(visual))-visual)<1e-9);
    assert(Math.abs(map.scrollAt(map.visualAt(scroll))-scroll)<1e-9);
  }
});

test('table resolution changes the result only slightly',()=>{
  const coarse=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:.55,samples:1024});
  const fine=createPaceMap(CASE_STUDY,{scrollPerUnit:.205,blend:.55,samples:8192});
  assert(Math.abs(coarse.scrollTotal-fine.scrollTotal)/fine.scrollTotal<.005);
});

test('invalid chapters and options fail early instead of producing NaN scroll',()=>{
  for(const chapters of [[],null,'zoom',[null],[[1,1]],[{length:1}],[{speed:1}],
    [{length:0,speed:1}],[{length:1,speed:0}],[{length:1,speed:-2}],[{length:NaN,speed:1}],
    [{length:1,speed:Infinity}],[{length:'2',speed:1}],[{length:1,speed:1,endSpeed:0}],
    [{length:1,speed:1},,{length:1,speed:1}]])
    assert.throws(()=>createPaceMap(chapters));
  const ok=[{length:1,speed:1}];
  for(const options of [{scrollPerUnit:0},{scrollPerUnit:-1},{blend:-.1},{blend:NaN},
    {samples:8},{samples:100.5},{samples:1e7}])
    assert.throws(()=>createPaceMap(ok,options));
  assert.throws(()=>createPaceMap(ok,{samples:8}),RangeError);
  const map=createPaceMap(ok);
  for(const value of [NaN,Infinity,undefined,'1'])assert.throws(()=>map.visualAt(value),TypeError);
  assert.throws(()=>map.scrollAt(NaN),TypeError);
});

test('caller changes cannot alter an approved pace map',()=>{
  const input=[{id:'a',length:1,speed:1},{id:'b',length:1,speed:.5}];
  const map=createPaceMap(input,{blend:0});
  const before=map.scrollTotal;
  input[1].speed=4;input.push({length:9,speed:1});
  assert.equal(map.scrollTotal,before);assert.equal(map.chapters.length,2);
  assert(Object.isFrozen(map.chapters)&&Object.isFrozen(map.chapters[0]));
});

test('zoom units are natural-log scale ratios',()=>{
  assert(Math.abs(zoomUnits(1,Math.E)-1)<1e-12);
  assert(Math.abs(zoomUnits(150,1)+Math.log(150))<1e-12);
  for(const [a,b] of [[0,1],[1,0],[-1,2],[NaN,1]])assert.throws(()=>zoomUnits(a,b));
});

test('tunnel depth per unit matches zoom flow at the chosen radius',()=>{
  assert.equal(tunnelDepthPerUnit(1,.5),2);
  for(const [wallRadius,matchRadius] of [[1,.5],[420,180],[2,1.5]]) {
    // A wall point at depth D appears at radius wallRadius/D on screen.
    const depth=wallRadius/matchRadius,du=1e-6;
    const moved=wallRadius/(depth-tunnelDepthPerUnit(wallRadius,matchRadius)*du);
    const flightFlow=(moved-matchRadius)/du,zoomFlow=matchRadius;
    assert(Math.abs(flightFlow-zoomFlow)/zoomFlow<1e-4);
  }
  for(const [a,b] of [[0,1],[1,0],[NaN,1],[1,-1]])assert.throws(()=>tunnelDepthPerUnit(a,b));
});
