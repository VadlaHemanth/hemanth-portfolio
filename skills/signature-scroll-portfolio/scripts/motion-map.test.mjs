import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMotionMap,scrollProgress,smoothToward} from './motion-map.mjs';

test('linear input preserves source time, derivative and clamped endpoints',()=>{
  const map=createMotionMap([[0,0],[.2,4],[.7,14],[1,20]]);
  for(let i=0;i<=100;i++){
    assert(Math.abs(map.at(i/100)-i/5)<1e-10);
    assert(Math.abs(map.rate(i/100)-20)<1e-9);
  }
  assert.equal(map.at(-3),0);assert.equal(map.at(3),20);
});

test('uneven measured rates stay monotone without crossing neighboring bounds',()=>{
  const cases=[
    [[0,0],[.02,.8],[.18,2],[.3,6],[.7,6.9],[.71,8],[1,12]],
    [[0,0],[.001,1],[.999,1.01],[1,4]],
    [[0,4],[.3,4.01],[.31,10],[.85,18],[1,18.2]],
  ];
  for(const points of cases) {
    const map=createMotionMap(points);let previous=-Infinity;
    for(let i=0;i<=10000;i++){
      const p=i/10000,value=map.at(p);
      assert(value>=previous);assert(map.rate(p)>=0);
      previous=value;
    }
    for(const [p,t] of points)assert(Math.abs(map.at(p)-t)<1e-8);
    for(let i=0;i<=100;i++)assert(Math.abs(map.progressAtTime(map.at(i/100))-i/100)<1e-8);
  }
});

test('invalid knots fail early instead of producing NaN video seeks',()=>{
  for(const value of [[],[[0,1]],[[.1,0],[1,20]],[[0,0],[.8,10]],
    [[0,0],[.5,3],[.5,4],[1,5]],[[0,0],[.5,3],[1,3]],[[0,NaN],[1,20]]])
    assert.throws(()=>createMotionMap(value));
  assert.throws(()=>createMotionMap([[0,0],[1,20]]).at(Infinity));
});

test('caller changes cannot mutate the approved curve',()=>{
  const input=[[0,0],[1,4]],map=createMotionMap(input);
  input[1][1]=100;assert.equal(map.at(1),4);
  assert(Object.isFrozen(map.points[0]));
});

test('missing slots in sparse point arrays cannot bypass validation',()=>{
  for(const points of [
    [[0,0],[.5,,],[1,2]],
    [[0,0],[,1],[1,2]],
    [[0,0],,[1,2]],
  ])assert.throws(()=>createMotionMap(points),TypeError);
});

test('native progress handles short sections and overscroll',()=>{
  assert.equal(scrollProgress(0,100,1000,600),0);
  assert.equal(scrollProgress(300,100,1000,600),.5);
  assert.equal(scrollProgress(9000,100,1000,600),1);
  assert(Number.isFinite(scrollProgress(10,0,100,100)));
});

test('delta-time smoothing agrees across frame cadence and never overshoots',()=>{
  let a=0,b=0;
  for(let i=0;i<10;i++)a=smoothToward(a,1,10);
  for(let i=0;i<5;i++)b=smoothToward(b,1,20);
  assert(Math.abs(a-b)<1e-12);
  assert(smoothToward(0,1,10000)<=1);
  assert.equal(smoothToward(3,1,-1),3);
  assert.throws(()=>smoothToward(0,1,16,0),RangeError);
});
