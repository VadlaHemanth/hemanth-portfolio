/* Public project covers mapped onto the actual three video-plane quads.
   These are labelled concept/preview cards, not fabricated application screenshots. */
export const SCREEN_PROJECTS=Object.freeze([
  {id:'satellite',title:'Satellite Research',type:'APPLIED AI · RESEARCH',subtitle:'From imagery to investigation.',image:'assets/satellite-study.svg'},
  {id:'attendance',title:'Attendance ERP',type:'AUTOMATIC ATTENDANCE SYSTEM',subtitle:'Face recognition. Connected campus workflows.',image:'assets/attendance-system.svg'},
  {id:'memory',title:'Vendor Payment',type:'MEMORY AGENT · DEMO',subtitle:'Past decisions. Better context.',image:'assets/memory-flow.svg'},
]);
export function useCoverFrame(width,height,family) {
  // Edge-to-edge on ordinary phone ratios; unusually narrow split screens keep
  // the full composition instead of cropping the outer project planes.
  return family==='phone'&&width/height>=.39;
}

export function planeMatrix(points,width=640,height=360) {
  const source=[[0,0],[width,0],[width,height],[0,height]],m=[];
  for(let i=0;i<4;i++){
    const [x,y]=source[i],[X,Y]=points[i];
    m.push([x,y,1,0,0,0,-X*x,-X*y,X],[0,0,0,x,y,1,-Y*x,-Y*y,Y]);
  }
  for(let c=0;c<8;c++){
    let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;
    [m[c],m[pivot]]=[m[pivot],m[c]];
    if(Math.abs(m[c][c])<1e-12)return null;
    const div=m[c][c];for(let k=c;k<9;k++)m[c][k]/=div;
    for(let r=0;r<8;r++)if(r!==c){const factor=m[r][c];for(let k=c;k<9;k++)m[r][k]-=factor*m[c][k];}
  }
  const [a,b,c,d,e,f,g,h]=m.map(r=>r[8]);
  return [a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1];
}

export function initProjectScreens(stage,camera=stage) {
  const layer=document.createElement('div');layer.className='project-screens';layer.hidden=true;
  layer.setAttribute('aria-label','Projects on the processor screens');
  const nodes=SCREEN_PROJECTS.map(card=>{
    const a=document.createElement('a');a.className='project-screen';a.href='#work';a.dataset.screenProject=card.id;a.tabIndex=-1;
    a.setAttribute('aria-label',`Explore ${card.title}`);a.setAttribute('aria-haspopup','dialog');
    const image=document.createElement('img');image.src=card.image;image.alt='';image.width=640;image.height=400;
    const type=document.createElement('span');type.className='screen-type';type.textContent=card.type;
    const title=document.createElement('strong');title.textContent=card.title;
    const subtitle=document.createElement('span');subtitle.className='screen-subtitle';subtitle.textContent=card.subtitle;
    const cta=document.createElement('span');cta.className='screen-cta';cta.textContent='VIEW PROJECT ↗';
    a.append(image,type,title,subtitle,cta);layer.append(a);return a;
  });
  const heading=document.createElement('div');heading.className='showcase-heading';heading.hidden=true;
  const label=document.createElement('span');label.className='eyebrow';label.textContent='THREE SELECTED BUILDS';
  const title=document.createElement('h2');title.textContent='Ideas made useful.';
  const note=document.createElement('p');note.textContent='Computer vision · Applied AI · Software';
  heading.append(label,title,note);stage.append(heading);camera.append(layer);
  let data=null,geometry={width:0,height:0,x:0,y:0};
  const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),8000);
  const loaded=fetch('./assets/motion/project-surfaces.json',{cache:'no-cache',signal:abort.signal}).then(r=>{
    if(!r.ok)throw new Error('Project surface geometry unavailable');return r.json();
  }).then(j=>{data=j;}).catch(()=>{data=null;}).finally(()=>clearTimeout(deadline));
  function resize(aspect,cover) {
    const sw=stage.clientWidth,sh=stage.clientHeight,ratio=aspect[0]/aspect[1];
    const width=(cover?Math.max:Math.min)(sw,sh*ratio),height=width/ratio;
    geometry={width,height,x:(sw-width)/2,y:(sh-height)/2};
  }
  function update(time,family) {
    const frame=Math.max(0,Math.min(479,Math.round(time*24)));
    const row=data?.families[family],quads=row?.frames[String(frame)];
    if(!quads){layer.hidden=true;heading.hidden=true;nodes.forEach(n=>n.tabIndex=-1);return false;}
    resize(row.aspect,useCoverFrame(stage.clientWidth,stage.clientHeight,family));layer.hidden=false;heading.hidden=false;
    // Keep most of the longer breathing interval fully readable; the camera,
    // rather than a long text fade, supplies the movement through these frames.
    const alpha=Math.min(1,Math.max(0,(time-15.02)/.06),Math.max(0,(15.625-time)/.06));
    layer.style.opacity=String(alpha);heading.style.opacity=String(alpha);
    for(let i=0;i<3;i++){
      const q=quads[i],center=[q.reduce((s,p)=>s+p[0],0)/4,q.reduce((s,p)=>s+p[1],0)/4];
      const inset=q.map(([x,y])=>[
        geometry.x+(center[0]+(x-center[0])*.969)*geometry.width,
        geometry.y+(center[1]+(y-center[1])*.949)*geometry.height,
      ]);
      const matrix=planeMatrix(inset);if(!matrix){nodes[i].hidden=true;continue;}
      nodes[i].hidden=false;nodes[i].style.transform=`matrix3d(${matrix.join(',')})`;nodes[i].tabIndex=alpha>.9?0:-1;
    }
    return true;
  }
  return{loaded,update,hide(){layer.hidden=true;heading.hidden=true;nodes.forEach(n=>n.tabIndex=-1);}};
}
