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
  'index.html','resume.html','404.html','styles.css','scroll-story.css','catalog.css',
  'resume.css','app.js','motion.js','project-screens.js','content.js',
  'skills.css','skills.js','motion-curve.js',
  '_headers','_redirects','robots.txt','sitemap.xml',
];
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of files)await cp(path.join(source,file),path.join(output,file));
const motion=JSON.parse(await readFile(path.join(source,'assets/motion/manifest.json'),'utf8'));
const activeMotion=new Set(['assets/motion/manifest.json','assets/motion/project-surfaces.json']);
for(const family of motion.families)for(const variant of family.variants) {
  if(variant.src)activeMotion.add(variant.src);
  for(const part of variant.parts||[])activeMotion.add(part.src);
}
await cp(path.join(source,'assets'),path.join(output,'assets'),{
  recursive:true,
  filter:filename=>{
    if(path.basename(filename).startsWith('.'))return false;
    const relative=path.relative(source,filename).split(path.sep).join('/');
    return !relative.startsWith('assets/motion/')||activeMotion.has(relative);
  },
});

let count=0,bytes=0;
async function inspect(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){await inspect(file);continue;}
    const info=await stat(file);
    if(info.size>25*1024*1024)throw new Error(`Cloudflare Pages 25 MiB limit exceeded: ${path.relative(output,file)}`);
    if(!/\.(html|css|js|json|svg|webp|jpg|png|mp4|bin|pdf|txt|xml)$/.test(file)&&!['_headers','_redirects'].includes(entry.name))
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
