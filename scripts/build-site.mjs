/**
 * Explicit public-file allowlist. Cloudflare never receives dossiers, tests,
 * production renders, source scripts, credentials or optional movie downloads.
 */
import {cp, mkdir, readdir, rm, stat, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'website'),output=path.join(root,'dist');
await import('../website/build-content.mjs');
const files=[
  'index.html','resume.html','404.html','styles.css',
  'resume.css','app.js',
  '_headers','_redirects','robots.txt','sitemap.xml',
];
// Whole directories of public runtime files: tokens and styles, the journey and section
// scripts, vendored Lenis, and self-hosted fonts.
const directories=['css','js','vendor','fonts'];
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of files)await cp(path.join(source,file),path.join(output,file));
for(const directory of directories)await cp(path.join(source,directory),path.join(output,directory),{
  recursive:true,filter:filename=>!path.basename(filename).startsWith('.'),
});
// Only journey files named by the manifest ship; the old film archive never does.
const journey=JSON.parse(await readFile(path.join(source,'assets/journey/manifest.json'),'utf8'));
const activeJourney=new Set(['assets/journey/manifest.json','assets/journey/poster.webp']);
for(const tier of Object.values(journey.tiers))for(const file of Object.values(tier))activeJourney.add(file.src.replace(/^\.\//,''));
await cp(path.join(source,'assets'),path.join(output,'assets'),{
  recursive:true,
  filter:filename=>{
    if(path.basename(filename).startsWith('.'))return false;
    const relative=path.relative(source,filename).split(path.sep).join('/');
    if(relative.startsWith('assets/motion')||relative.startsWith('assets/portraits'))return false;
    return !relative.startsWith('assets/journey/')||activeJourney.has(relative)||!/\.[a-z0-9]+$/.test(relative);
  },
});

let count=0,bytes=0;
async function inspect(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await inspect(file);continue;}
    const info=await stat(file);
    if(info.size>25*1024*1024)throw new Error(`Cloudflare Pages 25 MiB limit exceeded: ${path.relative(output,file)}`);
    if(!/\.(html|css|js|json|svg|webp|jpg|png|pdf|txt|xml|woff2)$/.test(file)&&!['_headers','_redirects'].includes(entry.name))
      throw new Error(`Unapproved public file: ${path.relative(output,file)}`);
    if(/\.(?:html|js|json)$/.test(file)){
      const text=await readFile(file,'utf8');
      if(/Everything about Hemanth|Master_Personal_Profile|gh[pousr]_[a-zA-Z0-9]{30,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text))
        throw new Error(`Private material detected: ${path.relative(output,file)}`);
    }
    count++;bytes+=info.size;
  }
}
await inspect(output);
console.log(`Public site: ${count} files, ${(bytes/1048576).toFixed(2)} MiB. Every file meets the Pages asset limit.`);
