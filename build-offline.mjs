import {readFile,writeFile,readdir} from 'node:fs/promises';
const folder=new URL('./dist/',import.meta.url);
const imports={},assets=new Map();
for(const name of await readdir(new URL('assets/',folder))){if(!/\.(?:jpg|png|webp|webm)$/i.test(name))continue;const bytes=await readFile(new URL('assets/'+name,folder));assets.set('./assets/'+name,'data:'+(name.endsWith('.webm')?'video/webm':'image/'+(name.endsWith('.jpg')?'jpeg':name.split('.').at(-1)))+';base64,'+bytes.toString('base64'));}
const embed=code=>code.replace(/(['"])(\.\/assets\/[^'"]+\.(?:jpg|png|webp|webm))\1/g,(s,q,path)=>assets.has(path)?q+assets.get(path)+q:s);
for(const n of await readdir(folder)){if(n.startsWith('.')||!n.endsWith('.mjs'))continue;const code=embed(await readFile(new URL(n,folder),'utf8')).replace(/(['"])\.\/([\w-]+\.mjs)\1/g,"'thinking-lab/$2'");imports['thinking-lab/'+n]='data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
let html=await readFile(new URL('index.html',folder),'utf8');
for(const [tag,file] of [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)">/g)]){const css=await readFile(new URL(file,folder),'utf8');html=html.replace(tag,()=>'<style>'+css+'</style>');}
html=html.replace('<script type="module" src="./app.mjs"></script>',()=>'<script type="importmap">'+JSON.stringify({imports})+'</script><script type="module">import "thinking-lab/app.mjs";</script>');
await writeFile(process.argv[2]||new URL('../생각코드.html',import.meta.url),html);
