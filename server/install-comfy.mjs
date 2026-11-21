// Windows portable runtime for this classroom. The release is pinned so a
// partial download can be resumed without mixing two different archives.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const base=fileURLToPath(new URL('../.local/comfy/',import.meta.url));
const url='https://github.com/Comfy-Org/ComfyUI/releases/download/v0.46.0/ComfyUI_windows_portable_nvidia.7z';
const checksum='6a5255c7ec01fdc54bdbd8e4507073cf6acda2fbeea74ae1829a50681af5fac6';
const total=2085169944;
const prefix=join(base,'ComfyUI_windows_portable_nvidia-0.46.0.7z');
const archive=join(base,'verified-v0.46.0.7z');
const parts=join(base,'download-parts');
const python=join(base,'ComfyUI_windows_portable','python_embeded','python.exe');
const size = path=>stat(path).then(s=>s.size,e=>{if(e.code==='ENOENT')return 0;throw e;});
const sleep = ms=>new Promise(done=>setTimeout(done,ms));
const digest=async path=>{const hash=createHash('sha256');for await(const data of createReadStream(path))hash.update(data);return hash.digest('hex');};
await mkdir(parts,{recursive:true});
if(!(await size(archive)===total && await digest(archive)===checksum)){
  const head=await size(prefix);
  if(head>total)throw Error('Invalid partial archive length.');
  const jobs=[];
  for(let start=head;start<total;start+=32*1024*1024){
    const end=Math.min(total-1,start+32*1024*1024-1);
    jobs.push({start,end,path:join(parts,start+'-'+end+'.part')});
  }
  let index=0,received=head;
  for(const job of jobs)received+=await size(job.path);
  const report=()=>console.log('Runtime download '+(received/total*100).toFixed(1)+'% ('+(received/1048576).toFixed(0)+' MiB)');
  report(); const progress=setInterval(report,45000);
  async function worker(){
    while(index<jobs.length){
      const {start,end,path}=jobs[index++];
      for(let attempt=0; ;attempt++){
        const have=await size(path),offset=start+have;
        if(offset===end+1)break;
        if(offset>end+1)throw Error('Invalid partial range.');
        const controller=new AbortController();
        let idle;
        const heartbeat=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),65000);};
        try{
          heartbeat();
          const res=await fetch(url,{headers:{Range:'bytes='+offset+'-'+end,'Accept-Encoding':'identity'},signal:controller.signal});
          if(res.status!==206 || res.headers.get('content-range')!=='bytes '+offset+'-'+end+'/'+total){
            await res.body?.cancel();
            throw Error('Invalid range response '+res.status);
          }
          let counter=offset;
          const measure=new Transform({transform(chunk,_encoding,next){
            if(counter+chunk.length>end+1){next(Error('Range overflow'));return;}
            counter+=chunk.length;received+=chunk.length;heartbeat();next(null,chunk);
          }});
          await pipeline(Readable.fromWeb(res.body),measure,createWriteStream(path,{flags:'a'}));
          if(counter!==end+1)throw Error('Incomplete byte range');
        }catch(e){
          if(attempt>=14)throw Error('Failed download range '+start+' after retries: '+e.message);
          console.log('Retrying '+start+' ('+(e.cause?.code||e.message)+')');
          await sleep(Math.min(30000,1500*(attempt+1)));
        }finally{clearTimeout(idle);}
      }
    }
  }
  try {await Promise.all(Array.from({length:6},()=>worker()));}
  finally {clearInterval(progress);}
  const file=await open(archive,'w');
  try{
    for(const input of [...(head?[prefix]:[]),...jobs.map(j=>j.path)]){
      for await(const chunk of createReadStream(input)){await file.writeFile(chunk);}
    }
  }finally{await file.close();}
  if(await size(archive)!==total || await digest(archive)!==checksum)throw Error('The SHA-256 digest of the runtime archive does not match the official release.');
}
console.log('SHA-256 verified. Extracting portable runtime.');
const tar=spawn('tar.exe',['-xf',archive,'-C',base],{stdio:'inherit',windowsHide:true});
const [code]=await once(tar,'exit');
if(code!==0 || !await size(python))throw Error('Runtime extraction failed.');
console.log('Portable ComfyUI is ready in '+base);
