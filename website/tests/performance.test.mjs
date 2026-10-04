import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open, readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {chooseMotionFamily, chooseMotionVariant} from '../motion.js';

const website = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(website,'assets/motion/manifest.json'),'utf8'));
const MiB = 1024 * 1024;
const mediaFiles=variant=>variant.parts?.length?variant.parts:[variant];

// Quality is the contract. Parts satisfy the host's file limit; they are not
// lower-resolution renditions, nor a way to reduce Lighthouse's measured bytes.
test('each family has sharp efficient and high-detail deliveries within the host limit', async () => {
  assert.equal(manifest.version,6);
  assert.equal(manifest.duration,20);
  assert.equal(manifest.fps,24);
  assert.deepEqual(manifest.families.map(family=>family.id).sort(), ['phone','tablet','tablet-portrait','wide']);
  const dimensions={wide:[1920,1080],tablet:[1440,1080],'tablet-portrait':[1080,1440],phone:[1080,1920]};
  const paths=new Set();
  for (const family of manifest.families) {
    assert.equal(family.variants.length,2,`${family.id}: efficient and full-detail choices`);
    assert.deepEqual(family.variants.map(v=>v.quality).sort(),['balanced','high']);
    for (const variant of family.variants) {
      assert.equal(variant.type,'video/mp4');
      assert.equal(variant.scrub,true);
      if(variant.quality==='high')assert.deepEqual([variant.width,variant.height],dimensions[family.id]);
      else assert.equal(Math.min(variant.width,variant.height),720,'the efficient tier is not a tiny fallback');
      assert.equal(variant.width / variant.height, family.aspect[0] / family.aspect[1]);
      assert(Number.isSafeInteger(variant.sizeBytes) && variant.sizeBytes>0 && variant.sizeBytes<25*MiB,
        `${family.id}: a compact complete file, not a 60 MB mandatory preload`);
      assert(variant.keyframeInterval>0&&variant.keyframeInterval<=24,'bounded one-second maximum GOP');
      assert.match(variant.sha256,/^[a-f0-9]{64}$/);
      let total=0;
      for(const part of mediaFiles(variant)) {
        assert.match(part.src,new RegExp(`^assets/motion/${family.id}-v[56]-${variant.quality}-${variant.width}x${variant.height}-[a-f0-9]{8,64}\\.mp4$`));
        assert(!paths.has(part.src),`${part.src}: parts cannot alias other families or indices`);
        paths.add(part.src);
        assert.match(part.sha256,/^[a-f0-9]{64}$/);
        assert(Number.isSafeInteger(part.sizeBytes) && part.sizeBytes>0 && part.sizeBytes<25*MiB,
          `${part.src}: per-file delivery limit`);
        assert.equal((await stat(path.join(website,part.src))).size,part.sizeBytes,
          `${part.src}: real byte counts drive loader progress`);
        total+=part.sizeBytes;
      }
      assert.equal(total,variant.sizeBytes,`${family.id}: part sum equals the full MP4`);
    }
  }
});

test('real shipped variants adapt to display needs and constrained devices', () => {
  for (const [width,height] of [[360,800],[390,844],[820,1180],[1024,768],[1366,768],[1920,1080]]) {
    const family=manifest.families.find(row=>row.id===chooseMotionFamily(width,height));
    const ratio=family.aspect[0]/family.aspect[1], fitted=Math.min(width,height*ratio);
    for (const [connection,device] of [
      [{saveData:true},{}], [{effectiveType:'2g'},{}], [{effectiveType:'3g'},{}],
      [{downlink:1},{}], [{},{memory:2}], [{},{cores:2}],
    ]) {
      const selected=chooseMotionVariant(family.variants,fitted,fitted/ratio,3,connection,'auto',device);
      assert.equal(selected.quality,'balanced',`${family.id}: efficient high-quality tier on constrained devices`);
    }
    const selected=chooseMotionVariant(family.variants,fitted,fitted/ratio,2,{downlink:20,effectiveType:'4g'},'auto',{memory:8,cores:8});
    assert.equal(selected.quality,height>width&&width<=360?'balanced':'high',`${family.id}: resolution matched to display and DPR`);
  }
});

async function atoms(variant) {
  const files=[];
  try {
    let start=0;
    for(const part of mediaFiles(variant)) {
      files.push({file:await open(path.join(website,part.src),'r'),start,size:part.sizeBytes});
      start+=part.sizeBytes;
    }
    const size=variant.sizeBytes, rows=[];
    let offset=0;
    async function readVirtual(position,length) {
      const output=Buffer.alloc(length);
      let written=0;
      while(written<length) {
        const source=files.find(row=>position>=row.start && position<row.start+row.size);
        assert(source,'Virtual MP4 read stays within the ordered part list');
        const count=Math.min(length-written,source.start+source.size-position);
        const result=await source.file.read(output,written,count,position-source.start);
        assert.equal(result.bytesRead,count);
        written+=count;position+=count;
      }
      return output;
    }
    // Parse the virtual *whole* MP4. Individual raw parts are not MP4 segments.
    while(offset+8<=size && rows.length<20) {
      const buffer=await readVirtual(offset,Math.min(16,size-offset));
      const length=buffer.readUInt32BE(0);
      const atomSize=length===1?Number(buffer.readBigUInt64BE(8)):length===0?size-offset:length;
      assert(atomSize>=8 && offset+atomSize<=size,'Valid bounded MP4 atom');
      rows.push({type:buffer.toString('ascii',4,8),offset,size:atomSize});
      offset+=atomSize;
    }
    return rows;
  } finally {await Promise.all(files.map(row=>row.file.close()));}
}

test('ordered raw parts exactly reproduce each approved MP4 and retain fast-start metadata', async () => {
  for (const family of manifest.families) for (const variant of family.variants) {
    const aggregate=createHash('sha256');
    for(const part of mediaFiles(variant)) {
      const hash=createHash('sha256');
      for await(const bytes of createReadStream(path.join(website,part.src))) {
        hash.update(bytes);aggregate.update(bytes);
      }
      assert.equal(hash.digest('hex'),part.sha256,`${part.src}: exact part bytes`);
    }
    assert.equal(aggregate.digest('hex'),variant.sha256,`${family.id}: exact ordered full-movie bytes`);
    const rows=await atoms(variant);
    assert.equal(rows[0]?.type,'ftyp');
    const moov=rows.find(row=>row.type==='moov'), mdat=rows.find(row=>row.type==='mdat');
    assert(moov && mdat && moov.offset<mdat.offset, `${family.id}: fast-start MP4 required`);
  }
});

function cacheRules(text) {
  const rows=[];
  let route;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {route=line.trim();continue;}
    const match=line.trim().match(/^Cache-Control:\s*(.+)$/i);
    if (match) rows.push({
      route,value:match[1],
      pattern:new RegExp('^'+route.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$'),
    });
  }
  return rows;
}

test('Pages cache rules never join contradictory lifetimes, and mutable code revalidates', async () => {
  const text=await readFile(path.join(website,'_headers'),'utf8'), rules=cacheRules(text);
  for (const route of [
    '/','/index.html','/resume','/resume.html','/404','/404.html',
    '/app.js','/motion.js','/project-screens.js','/content.js',
    '/styles.css','/scroll-story.css','/catalog.css','/resume.css',
    '/robots.txt','/sitemap.xml','/assets/motion/manifest.json','/assets/motion/project-surfaces.json',
    '/assets/Vadla-Hemanth-Resume.pdf','/assets/social-preview.jpg',
  ]) {
    const matching=rules.filter(rule=>rule.pattern.test(route));
    assert.equal(matching.length,1,`${route}: exactly one explicit cache policy`);
    assert.deepEqual([...matching[0].value.matchAll(/\bmax-age=(\d+)\b/g)].map(match=>Number(match[1])),[0]);
    assert.match(matching[0].value,/\bno-cache\b/,`${route}: a zone Browser Cache TTL can override max-age=0 alone`);
    if (['/','/index.html','/resume','/resume.html','/404','/404.html'].includes(route))
      assert.match(matching[0].value,/\bno-transform\b/,`${route}: preserve canonical HTML through the edge`);
    assert.match(matching[0].value,/\bmust-revalidate\b/);
    assert.doesNotMatch(matching[0].value,/\bimmutable\b/);
  }
  for (const family of manifest.families) for (const variant of family.variants) for(const part of mediaFiles(variant)) {
    const matching=rules.filter(rule=>rule.pattern.test('/'+part.src));
    assert.equal(matching.length,1,`${part.src}: no blanket max-age=0 conflict`);
    assert.deepEqual([...matching[0].value.matchAll(/\bmax-age=(\d+)\b/g)].map(match=>Number(match[1])),[31536000]);
    assert.match(matching[0].value,/\bimmutable\b/);
    assert.doesNotMatch(matching[0].value,/\bno-cache\b/,'Do not disable versioned movie reuse');
  }
});

test('the release bypasses previously fresh four-hour script and style caches, including module imports', async () => {
  const html=await readFile(path.join(website,'index.html'),'utf8');
  const linked=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/g)]
    .map(match=>new URL(match[1],'https://portfolio.example/'));
  const entry=linked.find(url=>url.pathname==='/app.js'), version=entry?.searchParams.get('v');
  assert(version,'Entry module needs a versioned URL for upgrades from the initial cache policy');
  for(const name of ['app.js','styles.css','scroll-story.css','catalog.css']) {
    assert.equal(linked.find(url=>url.pathname==='/'+name)?.searchParams.get('v'),version,`${name}: matching release version`);
  }
  for(const name of ['app.js','motion.js']) {
    const source=await readFile(path.join(website,name),'utf8');
    const imports=[...source.matchAll(/\bfrom\s*["'](\.\/[^"']+\.js(?:\?[^"']*)?)["']/g)];
    assert(imports.length,`${name}: local module imports expected`);
    for(const [,specifier] of imports) {
      assert.equal(new URL(specifier,'https://portfolio.example/').searchParams.get('v'),version,
        `${name} -> ${specifier}: parent URL queries do not propagate to imports`);
    }
  }
});

test('critical text stays bounded without imposing a film or portrait fidelity budget', async () => {
  const files=['index.html','app.js','motion.js','project-screens.js','content.js','styles.css','scroll-story.css','catalog.css'];
  for(const file of ['skills.js','skills.css']) {
    if(await stat(path.join(website,file)).then(()=>true,()=>false))files.push(file);
  }
  const payloads=await Promise.all(files.map(file=>readFile(path.join(website,file))));
  assert(payloads.reduce((sum,bytes)=>sum+bytes.length,0)<350*1024,'Critical text under 350 KiB uncompressed');
  assert(payloads.reduce((sum,bytes)=>sum+gzipSync(bytes).length,0)<85*1024,'Critical text under 85 KiB gzip-equivalent');
  for (const family of manifest.families) {
    assert((await stat(path.join(website,family.poster))).size>0,`${family.id}: valid static alternative`);
  }
});

test('performance artifacts and test tools stay outside the public build allowlist', async () => {
  const build=await readFile(path.join(website,'../scripts/build-site.mjs'),'utf8');
  assert.match(build,/const files\s*=\s*\[/);
  assert.doesNotMatch(build,/(?:cp|copyFile)\([^;\n]*(?:maintenance|performance|tests|node_modules)/);
  assert.doesNotMatch(build,/\.\.\/maintenance/);
  const ignore=await readFile(path.join(website,'../.gitignore'),'utf8');
  assert.match(ignore,/^\/\*$/m);
  assert.doesNotMatch(ignore,/^!\/maintenance\/?$/m);
});
