import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const website = fileURLToPath(new URL('../', import.meta.url));
const journey = JSON.parse(await readFile(path.join(website,'assets/journey/manifest.json'),'utf8'));
const MiB = 1024 * 1024;

test('journey media is small, content-addressed and complete for every tier', async () => {
  assert.deepEqual(Object.keys(journey.tiers).sort(), ['high','low','mid']);
  const budgets={high:4*MiB, mid:3.5*MiB, low:2.5*MiB};
  for (const [name, tier] of Object.entries(journey.tiers)) {
    let total=0;
    for (const key of ['L0','L1','L2','neural','circuit','core']) {
      const file=tier[key];
      assert.match(file.src,new RegExp(`^\\./assets/journey/${name}/${key}\\.[a-f0-9]{10}\\.webp$`),`${name}.${key}: hashed name`);
      const bytes=(await stat(path.join(website,file.src))).size;
      assert.equal(bytes,file.bytes,`${name}.${key}: real byte counts drive loader progress`);
      total+=bytes;
    }
    assert(total<budgets[name],`${name}: ${(total/MiB).toFixed(2)} MiB within budget`);
  }
  assert((await stat(path.join(website,'assets/journey/poster.webp'))).size>0,'static alternative exists');
  // Nothing stale lingers next to the manifest's files.
  const listed=new Set(Object.values(journey.tiers).flatMap(t=>Object.values(t).map(f=>f.src.replace('./',''))));
  for (const tier of Object.keys(journey.tiers)) {
    for (const file of await readdir(path.join(website,'assets/journey',tier)))
      assert(listed.has(`assets/journey/${tier}/${file}`),`${tier}/${file} is referenced by the manifest`);
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
    '/app.js','/styles.css','/resume.css','/css/tokens.css','/css/journey.css','/css/sections.css',
    '/js/sections.js','/js/journey/journey.js','/vendor/lenis.js',
    '/robots.txt','/sitemap.xml','/assets/journey/manifest.json',
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
  const immutable=[...Object.values(journey.tiers).flatMap(t=>Object.values(t).map(f=>f.src.slice(1))),'/fonts/HubotSans-VF.woff2','/fonts/MonaSans-VF.woff2'];
  for (const route of immutable) {
    const matching=rules.filter(rule=>rule.pattern.test(route));
    assert.equal(matching.length,1,`${route}: no blanket max-age=0 conflict`);
    assert.deepEqual([...matching[0].value.matchAll(/\bmax-age=(\d+)\b/g)].map(match=>Number(match[1])),[31536000]);
    assert.match(matching[0].value,/\bimmutable\b/);
  }
});

test('the release bypasses previously fresh four-hour script and style caches, including module imports', async () => {
  const html=await readFile(path.join(website,'index.html'),'utf8');
  const linked=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/g)]
    .map(match=>new URL(match[1],'https://portfolio.example/'));
  const entry=linked.find(url=>url.pathname==='/app.js'), version=entry?.searchParams.get('v');
  assert(version,'Entry module needs a versioned URL for upgrades from the initial cache policy');
  for(const name of ['app.js','styles.css','css/tokens.css','css/journey.css','css/sections.css','js/sections.js']) {
    assert.equal(linked.find(url=>url.pathname==='/'+name)?.searchParams.get('v'),version,`${name}: matching release version`);
  }
  const modules=['app.js',...(await readdir(path.join(website,'js/journey'))).filter(f=>f.endsWith('.js')).map(f=>`js/journey/${f}`)];
  for(const name of modules) {
    const source=await readFile(path.join(website,name),'utf8');
    const imports=[...source.matchAll(/\bfrom\s*["']((?:\.\/|\.\.\/)[^"']+\.m?js(?:\?[^"']*)?)["']/g)];
    for(const [,specifier] of imports) {
      assert.equal(new URL(specifier,'https://portfolio.example/x/').searchParams.get('v'),version,
        `${name} -> ${specifier}: parent URL queries do not propagate to imports`);
    }
  }
});

test('critical text stays small', async () => {
  const journeyFiles=(await readdir(path.join(website,'js/journey'))).filter(f=>f.endsWith('.js')).map(f=>`js/journey/${f}`);
  const files=['index.html','app.js','styles.css','css/tokens.css','css/journey.css','css/sections.css','js/sections.js','vendor/lenis.js',...journeyFiles];
  const payloads=await Promise.all(files.map(file=>readFile(path.join(website,file))));
  assert(payloads.reduce((sum,bytes)=>sum+bytes.length,0)<300*1024,'Critical text under 300 KiB uncompressed');
  assert(payloads.reduce((sum,bytes)=>sum+gzipSync(bytes).length,0)<90*1024,'Critical text under 90 KiB gzip-equivalent');
});

test('performance artifacts and test tools stay outside the public build allowlist', async () => {
  const build=await readFile(path.join(website,'../scripts/build-site.mjs'),'utf8');
  assert.match(build,/const files\s*=\s*\[/);
  assert.doesNotMatch(build,/(?:cp|copyFile)\([^;\n]*(?:maintenance|performance|tests|node_modules|production-v3)/);
  assert.doesNotMatch(build,/\.\.\/maintenance/);
  const ignore=await readFile(path.join(website,'../.gitignore'),'utf8');
  assert.match(ignore,/^\/\*$/m);
  assert.doesNotMatch(ignore,/^!\/maintenance\/?$/m);
  assert.doesNotMatch(ignore,/^!\/production-v3\/?$/m);
});
