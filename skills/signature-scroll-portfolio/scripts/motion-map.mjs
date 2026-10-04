/**
 * Portable monotone progress -> media-time interpolation.
 * Points are authored/measured inputs, not a default story or aesthetic.
 * No DOM, dependencies, timers, storage or network access.
 */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=value=>{if(!Number.isFinite(value))throw new TypeError('Expected a finite number');return value;};

export function createMotionMap(input) {
  if(!Array.isArray(input)||input.length<2)throw new TypeError('Provide at least two [progress,time] points');
  const points=Array.from(input,point=>{
    if(!Array.isArray(point)||point.length!==2)throw new TypeError('Each point is [progress,time]');
    return Object.freeze([finite(point[0]),finite(point[1])]);
  });
  if(points[0][0]!==0||points.at(-1)[0]!==1||points[0][1]<0)
    throw new RangeError('Progress must span 0..1 and media time must be nonnegative');
  const h=[],slopes=[];
  for(let i=0;i<points.length-1;i++) {
    const span=points[i+1][0]-points[i][0],travel=points[i+1][1]-points[i][1];
    if(span<=0||travel<=0)throw new RangeError('Progress and media time must strictly increase');
    h.push(span);slopes.push(travel/span);
  }
  const tangents=points.map((_,i)=>{
    if(i===0)return slopes[0];
    if(i===points.length-1)return slopes.at(-1);
    const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
    return (w1+w2)/(w1/slopes[i-1]+w2/slopes[i]);
  });
  // Fritsch-Carlson limiter protects intervals with very different rates.
  for(let i=0;i<slopes.length;i++) {
    const a=tangents[i]/slopes[i],b=tangents[i+1]/slopes[i],norm=Math.hypot(a,b);
    if(norm>3){const factor=3/norm;tangents[i]=factor*a*slopes[i];tangents[i+1]=factor*b*slopes[i];}
  }
  function segment(value) {
    const progress=clamp(finite(value),0,1);
    let lo=0,hi=points.length-2;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid][0]<=progress)lo=mid;else hi=mid-1;}
    return {i:lo,u:(progress-points[lo][0])/h[lo]};
  }
  function at(progress) {
    const {i,u}=segment(progress),a=points[i][1],b=points[i+1][1];
    const value=(2*u**3-3*u**2+1)*a+(u**3-2*u**2+u)*h[i]*tangents[i]
      +(-2*u**3+3*u**2)*b+(u**3-u**2)*h[i]*tangents[i+1];
    return clamp(value,a,b);
  }
  function rate(progress) {
    const {i,u}=segment(progress);
    return Math.max(0,((6*u*u-6*u)*points[i][1]+(3*u*u-4*u+1)*h[i]*tangents[i]
      +(-6*u*u+6*u)*points[i+1][1]+(3*u*u-2*u)*h[i]*tangents[i+1])/h[i]);
  }
  function progressAtTime(time) {
    time=clamp(finite(time),points[0][1],points.at(-1)[1]);
    if(time===points[0][1])return 0;
    if(time===points.at(-1)[1])return 1;
    let lo=0,hi=1;
    for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(at(mid)<time)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  }
  return Object.freeze({points:Object.freeze(points),at,rate,progressAtTime});
}

export function scrollProgress(scrollY,top,height,viewportHeight) {
  [scrollY,top,height,viewportHeight].forEach(finite);
  return clamp((scrollY-top)/Math.max(1,height-viewportHeight),0,1);
}

export function smoothToward(current,target,dt,tau=85) {
  [current,target,dt,tau].forEach(finite);
  if(tau<=0)throw new RangeError('Smoothing time constant must be positive');
  return current+(target-current)*(1-Math.exp(-Math.max(0,dt)/tau));
}
