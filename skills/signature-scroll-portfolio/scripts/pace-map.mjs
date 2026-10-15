/**
 * Portable pace map for a scroll journey whose camera is computed in code.
 *
 * Chapters are measured in visual units: one unit is the picture growing by a
 * factor of e, or any other motion converted to the same on-screen flow. At
 * speed 1 every unit costs the same scroll distance, so equal scroll gives equal
 * perceived motion. Deliberate speed changes are blended with a Gaussian over
 * 1/speed, so velocity never steps and a pace change moves scroll distance
 * between neighbouring chapters instead of adding or removing it. The two ends
 * are padded with their own speed. Chapters much shorter than `blend` mostly
 * inherit their neighbours' speed.
 *
 * The chapter list and speeds are authored or measured inputs, not defaults.
 * No DOM, dependencies, timers, storage or network access.
 */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=t=>t*t*(3-2*t);
const finite=value=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError('Expected a finite number');
  return value;
};
const positive=(value,name)=>{
  if(finite(value)<=0)throw new RangeError(`${name} must be positive`);
  return value;
};

/** Visual units for a log-scale zoom from one scale to another (negative when zooming out). */
export function zoomUnits(fromScale,toScale) {
  return Math.log(positive(toScale,'toScale')/positive(fromScale,'fromScale'));
}

/**
 * Tunnel depth that costs one visual unit. A wall point at depth D appears at
 * screen radius wallRadius / D, so flight moves a point at radius r by
 * r^2 / wallRadius per unit of depth, while a log zoom moves it by r per unit.
 * The two agree at matchRadius when one unit equals wallRadius / matchRadius.
 */
export function tunnelDepthPerUnit(wallRadius,matchRadius) {
  return positive(wallRadius,'wallRadius')/positive(matchRadius,'matchRadius');
}

/**
 * chapters: [{id?, length, speed, endSpeed?}] in visual units. speed is relative
 * (1 = the journey's cruising pace); endSpeed eases the speed across the chapter,
 * e.g. an arrival that slows toward rest. scrollPerUnit is the scroll distance of
 * one unit at speed 1, in your scroll measure (viewport heights work well).
 */
export function createPaceMap(chapters,{scrollPerUnit=.2,blend=.5,samples=4096}={}) {
  if(!Array.isArray(chapters)||chapters.length===0)throw new TypeError('Provide at least one chapter');
  positive(scrollPerUnit,'scrollPerUnit');
  if(finite(blend)<0)throw new RangeError('blend must be zero or positive');
  if(!Number.isInteger(samples)||samples<16||samples>16384)throw new RangeError('samples must be an integer from 16 to 16384');
  let cursor=0;
  const list=Object.freeze(Array.from(chapters,(chapter,index)=>{
    if(!chapter||typeof chapter!=='object'||Array.isArray(chapter))throw new TypeError(`Chapter ${index} must be an object`);
    const length=positive(chapter.length,`Chapter ${index} length`);
    const speed=positive(chapter.speed,`Chapter ${index} speed`);
    const endSpeed=chapter.endSpeed===undefined?speed:positive(chapter.endSpeed,`Chapter ${index} endSpeed`);
    const id=chapter.id===undefined?`chapter-${index}`:String(chapter.id);
    const entry=Object.freeze({id,length,speed,endSpeed,start:cursor,end:cursor+length});
    cursor+=length;
    return entry;
  }));
  const visualTotal=cursor,n=samples,dv=visualTotal/(n-1);

  // Authored speed at each sample of visual position.
  const raw=new Float64Array(n);
  for(let i=0,k=0;i<n;i++){
    const v=i*dv;
    while(k<list.length-1&&v>=list[k].end)k++;
    const c=list[k];
    raw[i]=c.speed+(c.endSpeed-c.speed)*smooth(clamp((v-c.start)/c.length,0,1));
  }
  // Blend 1/speed (scroll per unit) with a Gaussian so the pace has no steps.
  const pace=new Float64Array(n);
  const sigma=blend/dv;
  if(sigma<1e-6)pace.set(raw);
  else {
    const radius=Math.min(n-1,Math.ceil(sigma*3)),kernel=new Float64Array(2*radius+1);
    let sum=0;
    for(let j=-radius;j<=radius;j++){kernel[j+radius]=Math.exp(-(j*j)/(2*sigma*sigma));sum+=kernel[j+radius];}
    for(let i=0;i<n;i++){
      let acc=0;
      for(let j=-radius;j<=radius;j++)acc+=kernel[j+radius]/raw[clamp(i+j,0,n-1)];
      pace[i]=sum/acc;
    }
  }
  // Scroll distance at each sample: the integral of scrollPerUnit / pace.
  const scrollTable=new Float64Array(n);
  for(let i=1;i<n;i++)scrollTable[i]=scrollTable[i-1]+scrollPerUnit*dv*(1/pace[i-1]+1/pace[i])/2;
  const scrollTotal=scrollTable[n-1];

  function sampleAt(visual) {
    const x=clamp(finite(visual),0,visualTotal)/dv,i=Math.min(n-2,Math.floor(x));
    return {i,u:clamp(x-i,0,1)};
  }
  function visualAt(scroll) {
    const s=finite(scroll);
    if(s<=0)return 0;
    if(s>=scrollTotal)return visualTotal;
    let lo=0,hi=n-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(scrollTable[mid]<=s)lo=mid;else hi=mid;}
    const span=scrollTable[hi]-scrollTable[lo];
    return Math.min(visualTotal,(lo+(span>0?(s-scrollTable[lo])/span:0))*dv);
  }
  function scrollAt(visual) {
    const v=finite(visual);
    if(v<=0)return 0;
    if(v>=visualTotal)return scrollTotal;
    const {i,u}=sampleAt(v);
    return scrollTable[i]+(scrollTable[i+1]-scrollTable[i])*u;
  }
  /** Perceived speed: visual units per unit of scroll at a scroll position. */
  function rateAt(scroll) {
    const {i,u}=sampleAt(visualAt(scroll));
    return (pace[i]+(pace[i+1]-pace[i])*u)/scrollPerUnit;
  }
  /** Everything a renderer needs from one scroll position. */
  function at(scroll) {
    const visual=visualAt(scroll);
    let index=list.findIndex(c=>visual<c.end);
    if(index<0)index=list.length-1;
    const c=list[index];
    return {visual,index,id:c.id,t:clamp((visual-c.start)/c.length,0,1),rate:rateAt(scroll)};
  }
  return Object.freeze({chapters:list,visualTotal,scrollTotal,at,visualAt,scrollAt,rateAt});
}
