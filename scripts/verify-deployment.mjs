#!/usr/bin/env node
/**
 * Read-only deployment proof. Requires Node 20+, Git and curl.
 *
 * node scripts/verify-deployment.mjs --revision=<new-commit> \
 *   --previous=<old-commit> --url=https://portfolio.hemanthvadla.tech/ \
 *   --verify-media
 *
 * Compares public response bytes with committed public files, not the mutable
 * working tree. Does not build, commit, push, deploy, log in, or change DNS.
 * Report stays in ignored maintenance/performance, outside the public build.
 * --verify-media downloads and hashes every active binary part sequentially.
 * Without that opt-in, media byte integrity is explicitly "not_checked".
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const [key,...values]=arg.replace(/^--/,'').split('=');
  return [key,values.length?values.join('='):true];
}));
if(args.help || !args.revision) {
  console.log('Usage: node scripts/verify-deployment.mjs --revision=<commit> [--previous=<commit>] [--url=https://portfolio.hemanthvadla.tech/] [--verify-media] [--output=maintenance/performance/deployment-verification.json]');
  process.exit(args.help?0:2);
}
assert(typeof args.revision==='string' && /^[a-f0-9]{7,40}$/i.test(args.revision),'Use an explicit commit SHA, not a moving branch name.');
if(args.previous) assert(typeof args.previous==='string' && /^[a-f0-9]{7,40}$/i.test(args.previous),'Use a previous commit SHA.');
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...parameters)=>execFileSync('git',parameters,{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
const revision=git('rev-parse','--verify',`${args.revision}^{commit}`).toString().trim();
const previous=args.previous?git('rev-parse','--verify',`${args.previous}^{commit}`).toString().trim():null;
assert(!previous || previous!==revision,'The final revision must differ from the baseline.');
const base=new URL(args.url || 'https://portfolio.hemanthvadla.tech/');
assert(base.protocol==='https:' || (base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname)),'Use HTTPS except for a local diagnostic run.');
assert(!base.username && !base.password && !base.search && !base.hash,'Do not pass credentials or query parameters.');
const privateDir=path.join(root,'maintenance/performance');
const output=path.resolve(root,args.output || 'maintenance/performance/deployment-verification.json');
assert(output.startsWith(privateDir+path.sep),'Write reports only under maintenance/performance.');
await fs.mkdir(path.dirname(output),{recursive:true});
const temp=await fs.mkdtemp(path.join(privateDir,'.verify-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const verifyMedia=args['verify-media']===true || args['verify-media']==='true';
const MiB=1024*1024;
const report={
  checkedAt:new Date().toISOString(),url:base.href,expectedRevision:revision,previousRevision:previous,
  method:'Normal public GET with revalidation; application bytes compared to explicit Git blobs. Active v4 binary-part headers/range checked; optional sequential full-part and ordered aggregate hashing. No deployment mutation.',
  mediaByteIntegrity:verifyMedia?'pending':'not_checked',
  files:[],media:[],mediaAggregates:[],privatePaths:[],checks:[],errors:[],
};
let counter=0;
async function request(route,{head=false,range,streamFile=false,maxBytes=2*MiB}={}) {
  const number=counter++,bodyPath=path.join(temp,`${number}.body`),headersPath=path.join(temp,`${number}.headers`);
  const url=new URL(route,base).href;
  assert.equal(new URL(url).origin,base.origin,'Only this deployment origin may be requested.');
  const parameters=['--silent','--show-error','--location','--max-redirs','3','--max-time','30',
    '--proto','=https,http','--max-filesize',String(maxBytes),'--header','Cache-Control: no-cache',
    '--dump-header',headersPath,'--output',bodyPath,'--write-out','%{http_code}\n%{url_effective}'];
  if(head)parameters.push('--head');
  else if(!range)parameters.push('--compressed');
  if(range)parameters.push('--header',`Range: bytes=${range}`);
  // HEAD advertises full media size, so it needs a higher declared-size bound.
  if(head)parameters[parameters.indexOf('--max-filesize')+1]='26214400';
  parameters.push(url);
  const result=execFileSync('curl',parameters,{encoding:'utf8',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim().split('\n');
  const headerText=await fs.readFile(headersPath,'utf8');
  const headerBlock=headerText.trim().split(/\r?\n\r?\n/).at(-1);
  const headers={};
  for(const line of headerBlock.split(/\r?\n/).slice(1)) {
    const colon=line.indexOf(':');
    if(colon>0) {
      const key=line.slice(0,colon).toLowerCase(),value=line.slice(colon+1).trim();
      headers[key]=headers[key]?`${headers[key]}, ${value}`:value;
    }
  }
  assert.equal(new URL(result[1]).origin,base.origin,'Do not follow an unexpected cross-origin deployment redirect.');
  return {
    url,finalUrl:result[1],status:Number(result[0]),headers,
    body:head||streamFile?Buffer.alloc(0):await fs.readFile(bodyPath),
    bodyPath:streamFile?bodyPath:undefined,
  };
}
const exposedHeaders=response=>Object.fromEntries(
  ['content-type','content-length','cache-control','etag','cf-cache-status','accept-ranges','content-range','content-security-policy']
    .filter(name=>response.headers[name]).map(name=>[name,response.headers[name]])
);
function check(name,passed,details) {
  report.checks.push({name,passed,details});
  if(!passed)report.errors.push(`${name}: ${details}`);
}
function checkCache(route,value,immutable=false) {
  const maxAge=[...String(value||'').matchAll(/(?:^|,)\s*max-age=(\d+)/gi)].map(match=>Number(match[1]));
  const html=route==='/' || route.endsWith('.html') || ['/resume','/404'].includes(route);
  check(`cache ${route}`,maxAge.length===1 && maxAge[0]===(immutable?31536000:0)
    && (immutable?/\bimmutable\b/i:/\bmust-revalidate\b/i).test(value||'')
    && (immutable?!/\b(?:no-cache|no-store)\b/i.test(value||''):/\bno-cache\b/i.test(value||''))
    && (!html || /\bno-transform\b/i.test(value||'')),
    value || 'Cache-Control missing');
}

try {
  const tracked=new Set(git('ls-tree','-r','--name-only',revision,'--','website').toString().trim().split('\n'));
  const publicFiles=[
    ['index.html','/'],['app.js','/app.js'],['motion.js','/motion.js'],['project-screens.js','/project-screens.js'],
    ['content.js','/content.js'],['styles.css','/styles.css'],['scroll-story.css','/scroll-story.css'],['catalog.css','/catalog.css'],
    ['resume.html','/resume.html'],['resume.css','/resume.css'],['robots.txt','/robots.txt'],['sitemap.xml','/sitemap.xml'],
    ['assets/motion/manifest.json','/assets/motion/manifest.json'],
    ['assets/motion/project-surfaces.json','/assets/motion/project-surfaces.json'],
    ['assets/social-preview.jpg','/assets/social-preview.jpg'],['assets/Vadla-Hemanth-Resume.pdf','/assets/Vadla-Hemanth-Resume.pdf'],
  ];
  for(const file of ['skills.js','skills.css','motion-curve.js']) {
    if(tracked.has('website/'+file))publicFiles.push([file,'/'+file]);
  }
  let changedFilesVerified=0;
  for(const [file,route] of publicFiles) {
    const repoPath='website/'+file;
    if(!tracked.has(repoPath)) {
      check(`tracked ${repoPath}`,false,'Expected public file is absent from the requested revision.');
      continue;
    }
    try {
      const expected=git('show',`${revision}:${repoPath}`),response=await request(route);
      let changedFromPrevious=null;
      if(previous) {
        try {changedFromPrevious=!expected.equals(git('show',`${previous}:${repoPath}`));}
        catch {changedFromPrevious=true;}
      }
      const matches=response.status===200 && expected.equals(response.body);
      if(matches && changedFromPrevious)changedFilesVerified++;
      report.files.push({
        path:repoPath,url:response.url,finalUrl:response.finalUrl,status:response.status,
        expectedSha256:sha(expected),actualSha256:sha(response.body),expectedBytes:expected.length,actualBytes:response.body.length,
        matches,changedFromPrevious,headers:exposedHeaders(response),
      });
      check(`bytes ${route}`,matches,`${response.status}; ${response.body.length} bytes`);
      checkCache(route,response.headers['cache-control']);
      if(route==='/') {
        const headerSource=git('show',`${revision}:website/_headers`).toString();
        const csp=headerSource.match(/^\s+Content-Security-Policy:\s*(.+)$/mi)?.[1]?.trim();
        check('published CSP matches committed policy',!!csp && response.headers['content-security-policy']===csp,
          response.headers['content-security-policy'] || 'missing');
      }
    } catch(error) {check(`request ${route}`,false,error.message);}
  }
  if(previous)check('new-revision content evidence',changedFilesVerified>0,`${changedFilesVerified} changed public files match the new commit`);
  const manifest=JSON.parse(git('show',`${revision}:website/assets/motion/manifest.json`).toString());
  check('adaptive high-quality manifest',manifest.version===5 && manifest.families.length===4
    && manifest.families.every(family=>family.variants.length===2
      && family.variants.some(v=>v.quality==='high')&&family.variants.some(v=>v.quality==='balanced')),
  `version ${manifest.version}; efficient and high-detail choices for each device family`);
  let allMediaBytesMatch=true;
  for(const family of manifest.families) for(const variant of family.variants) {
    const parts=variant.parts?.length?variant.parts:[variant];
    const declaredTotal=parts.reduce((sum,part)=>sum+part.sizeBytes,0);
    check(`aggregate metadata ${family.id}`,parts.length>0 && declaredTotal===variant.sizeBytes
      && Number.isSafeInteger(variant.sizeBytes) && variant.sizeBytes>0 && variant.sizeBytes<180*MiB
      && /^[a-f0-9]{64}$/.test(variant.sha256||''),
    `${parts.length} parts; ${declaredTotal} / ${variant.sizeBytes} bytes`);
    const aggregate=createHash('sha256');
    let aggregateBytes=0,allPartsMatch=true;
    for(const [partIndex,part] of parts.entries()) {
      try {
        assert(/^assets\/motion\/[a-z0-9-]+\.(?:bin|mp4)$/.test(part.src),'Movie must be a versioned local asset.');
        assert(Number.isSafeInteger(part.sizeBytes) && part.sizeBytes>0 && part.sizeBytes<25*MiB,'Asset exceeds its 25 MiB delivery limit.');
        assert(/^[a-f0-9]{64}$/.test(part.sha256||''),'Part SHA-256 is required.');
        const response=await request('/'+part.src,{head:true});
        const valid=response.status===200 && Number(response.headers['content-length'])===part.sizeBytes
          && response.headers['content-type']?.startsWith(part.src.endsWith('.mp4')?'video/mp4':'application/octet-stream');
        const entry={
          family:family.id,quality:variant.quality,partIndex,url:response.url,status:response.status,
          expectedBytes:part.sizeBytes,expectedSha256:part.sha256,matchesSizeAndType:valid,headers:exposedHeaders(response),
          byteIntegrity:verifyMedia?'pending':'not_checked',
        };
        report.media.push(entry);
        check(`part ${part.src}`,valid,`${response.status}; Content-Length ${response.headers['content-length']}`);
        checkCache('/'+part.src,response.headers['cache-control'],true);
        if(verifyMedia) {
          const downloaded=await request('/'+part.src,{streamFile:true,maxBytes:part.sizeBytes});
          const partHash=createHash('sha256');
          let bytes=0;
          try {
            for await(const chunk of createReadStream(downloaded.bodyPath)) {
              partHash.update(chunk);aggregate.update(chunk);bytes+=chunk.length;
            }
          } finally {await fs.rm(downloaded.bodyPath,{force:true});}
          aggregateBytes+=bytes;
          entry.actualBytes=bytes;entry.actualSha256=partHash.digest('hex');
          const exact=downloaded.status===200 && bytes===part.sizeBytes && entry.actualSha256===part.sha256;
          entry.byteIntegrity=exact?'verified':'failed';
          allPartsMatch &&= exact;
          check(`exact part bytes ${part.src}`,exact,`${downloaded.status}; ${bytes} bytes; SHA-256 ${entry.actualSha256}`);
        }
      } catch(error) {
        allPartsMatch=false;
        check(`part ${part.src}`,false,error.message);
      }
    }
    const combined={
      family:family.id,quality:variant.quality,parts:parts.length,expectedBytes:variant.sizeBytes,
      expectedSha256:variant.sha256,byteIntegrity:verifyMedia?'pending':'not_checked',
    };
    if(verifyMedia) {
      combined.actualBytes=aggregateBytes;combined.actualSha256=aggregate.digest('hex');
      const exact=allPartsMatch && aggregateBytes===variant.sizeBytes && combined.actualSha256===variant.sha256;
      combined.byteIntegrity=exact?'verified':'failed';allMediaBytesMatch &&= exact;
      check(`exact ordered MP4 ${family.id}`,exact,`${aggregateBytes} bytes; SHA-256 ${combined.actualSha256}`);
    }
    report.mediaAggregates.push(combined);
  }
  if(verifyMedia)report.mediaByteIntegrity=allMediaBytesMatch && report.mediaAggregates.length===8?'verified':'failed';
  const phoneVariant=manifest.families.find(family=>family.id==='phone')?.variants.find(variant=>variant.quality==='high');
  const phone=phoneVariant?.parts?.[0]||phoneVariant;
  if(phone) {
    try {
      const response=await request('/'+phone.src,{range:'0-31'});
      report.range={url:response.url,status:response.status,bytes:response.body.length,headers:exposedHeaders(response)};
      check('32-byte first-part range response',response.status===206 && response.body.length===32
        && response.headers['content-range']===`bytes 0-31/${phone.sizeBytes}`
        && response.body.toString('ascii',4,8)==='ftyp',
      `${response.status}; ${response.body.length} bytes; ${response.headers['content-range']}`);
    } catch(error) {check('32-byte first-part range response',false,error.message);}
  } else check('high-quality phone media',false,'No high-quality phone parts in the committed manifest');
  // Metadata-only negative checks. Never fetch a personal source record's body.
  for(const route of [
    '/tests/performance.test.mjs','/package.json','/scripts/verify-deployment.mjs',
    '/maintenance/performance/HANDOFF.md','/design/resume-data.json',
  ]) {
    try {
      const response=await request(route,{head:true});
      report.privatePaths.push({url:response.url,status:response.status,headers:exposedHeaders(response)});
      check(`unpublished ${route}`,response.status===404,`Expected 404, received ${response.status}`);
    } catch(error) {check(`unpublished ${route}`,false,error.message);}
  }
  report.passed=report.errors.length===0;
  report.completedAt=new Date().toISOString();
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({
    passed:report.passed,expectedRevision:revision,changedFilesVerified,
    filesMatched:report.files.filter(row=>row.matches).length,filesChecked:report.files.length,
    mediaPartsChecked:report.media.length,mediaByteIntegrity:report.mediaByteIntegrity,
    errors:report.errors,report:output,
  },null,2));
  process.exitCode=report.passed?0:1;
} finally {
  await fs.rm(temp,{recursive:true,force:true});
}
