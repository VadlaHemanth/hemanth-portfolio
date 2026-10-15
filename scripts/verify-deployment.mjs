#!/usr/bin/env node
/**
 * Read-only deployment proof. Requires Node 20+, Git and curl.
 *
 * node scripts/verify-deployment.mjs --revision=<new-commit> \
 *   --previous=<old-commit> --url=https://portfolio.hemanthvadla.tech/
 *
 * Compares public response bytes with committed public files, not the mutable
 * working tree. Does not build, commit, push, deploy, log in, or change DNS.
 * Report stays in ignored maintenance/performance, outside the public build.
 * Journey plates and fonts are small, so their bytes are always verified.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const [key,...values]=arg.replace(/^--/,'').split('=');
  return [key,values.length?values.join('='):true];
}));
if(args.help || !args.revision) {
  console.log('Usage: node scripts/verify-deployment.mjs --revision=<commit> [--previous=<commit>] [--url=https://portfolio.hemanthvadla.tech/] [--output=maintenance/performance/deployment-verification.json]');
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
const MiB=1024*1024;
const report={
  checkedAt:new Date().toISOString(),url:base.href,expectedRevision:revision,previousRevision:previous,
  method:'Normal public GET with revalidation; every public file, journey plate and font compared to explicit Git blobs. No deployment mutation.',
  mediaByteIntegrity:'pending',
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
  // Mutable files revalidate on every visit; journey plates and fonts are content-addressed and immutable.
  const revalidating=[
    ['index.html','/'],['app.js','/app.js'],['styles.css','/styles.css'],
    ['resume.html','/resume.html'],['resume.css','/resume.css'],['robots.txt','/robots.txt'],['sitemap.xml','/sitemap.xml'],
    ['assets/social-preview.jpg','/assets/social-preview.jpg'],['assets/Vadla-Hemanth-Resume.pdf','/assets/Vadla-Hemanth-Resume.pdf'],
    ['assets/journey/manifest.json','/assets/journey/manifest.json'],
  ];
  for(const file of [...tracked].sort()) {
    const relative=file.replace(/^website\//,'');
    if(/^(?:css|js|vendor)\/.+\.(?:css|js)$/.test(relative))revalidating.push([relative,'/'+relative]);
  }
  const manifest=JSON.parse(git('show',`${revision}:website/assets/journey/manifest.json`).toString());
  const immutable=[['fonts/HubotSans-VF.woff2','/fonts/HubotSans-VF.woff2'],['fonts/MonaSans-VF.woff2','/fonts/MonaSans-VF.woff2']];
  for(const tier of Object.values(manifest.tiers))for(const file of Object.values(tier)) {
    const relative=file.src.replace(/^\.\//,'');
    immutable.push([relative,'/'+relative]);
  }
  let changedFilesVerified=0;
  for(const [file,route,isImmutable] of [...revalidating.map(r=>[...r,false]),...immutable.map(r=>[...r,true])]) {
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
      checkCache(route,response.headers['cache-control'],isImmutable);
      if(isImmutable)report.media.push({path:repoPath,matches});
      if(route==='/') {
        const headerSource=git('show',`${revision}:website/_headers`).toString();
        const csp=headerSource.match(/^\s+Content-Security-Policy:\s*(.+)$/mi)?.[1]?.trim();
        check('published CSP matches committed policy',!!csp && response.headers['content-security-policy']===csp,
          response.headers['content-security-policy'] || 'missing');
      }
    } catch(error) {check(`request ${route}`,false,error.message);}
  }
  if(previous)check('new-revision content evidence',changedFilesVerified>0,`${changedFilesVerified} changed public files match the new commit`);
  report.mediaByteIntegrity=report.media.length&&report.media.every(row=>row.matches)?'verified':'failed';
  // Metadata-only negative checks. Never fetch a personal source record's body.
  for(const route of [
    '/tests/performance.test.mjs','/package.json','/scripts/verify-deployment.mjs',
    '/maintenance/performance/HANDOFF.md','/design/resume-data.json','/content.js',
    '/assets/motion/manifest.json','/downloads.html',
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
    journeyFilesChecked:report.media.length,mediaByteIntegrity:report.mediaByteIntegrity,
    errors:report.errors,report:output,
  },null,2));
  process.exitCode=report.passed?0:1;
} finally {
  await fs.rm(temp,{recursive:true,force:true});
}
