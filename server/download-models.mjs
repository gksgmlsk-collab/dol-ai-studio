// Resumable local installation of the three publisher-provided safetensors.
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../.local/models/',import.meta.url));
const files=[
  ['Comfy-Org/stable-diffusion-1.5','9cfd069101959ca3828bf9c04a4419870832b74f','v1-5-pruned-emaonly-fp16.safetensors','checkpoints',2132696762,'e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916'],
  ['Lightricks/LTX-Video','8984fa25007f376c1a299016d0957a37a2f797bb','ltx-video-2b-v0.9.5.safetensors','checkpoints',6340729500,'720d15c9f19f7d0f6b2a92bbbc34410e2cfb2f6856a100b38f734fbf973d4adf'],
  ['Comfy-Org/stable-diffusion-3.5','934251d1e6168bcb45a069abc5bd5cdd5f8fea00','text_encoders/t5xxl_fp8_e4m3fn.safetensors','text_encoders',4893934904,'7d330da4816157540d6bb7838bf63a0f02f573fc48ca4d8de34bb0cbfd514f09']
];
const size=async file=>{try{return (await stat(file)).size;}catch{return 0;}};
const sum=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
async function receive(url,path,start,end,total){
  const existing=await size(path),offset=start+existing;
  if(offset===end+1)return;
  if(offset>end+1)throw Error('Oversized partial range');
  const stop=new AbortController();
  let timer;
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>stop.abort(),90000);};
  try{
    reset();
    const response=await fetch(url+'&from='+offset,{headers:{Range:'bytes='+offset+'-'+end,'Accept-Encoding':'identity'},signal:stop.signal});
    if(response.status!==206||response.headers.get('content-range')!=='bytes '+offset+'-'+end+'/'+total){
      await response.body?.cancel();
      throw Error('Unexpected HTTP range response '+response.status);
    }
    let bytes=existing;
    const meter=new Transform({transform(chunk,_,callback){reset();bytes+=chunk.length;
      if(bytes>end-start+1)callback(Error('Excess range data'));else callback(null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(path,{flags:'a'}));
  }finally{clearTimeout(timer);}
}
async function install([repo,commit,file,dir,bytes,digest]){
  const name=basename(file),dest=join(root,dir,name),partial=dest+'.part',parts=join(root,'.ranges',name);
  await mkdir(join(root,dir),{recursive:true});await mkdir(parts,{recursive:true});
  if(await size(dest)===bytes && await sum(dest)===digest){console.log(name+' verified');return;}
  const specPath=join(parts,'layout.json');
  let first;
  try{const f=await open(specPath,'wx');try{first=Math.min(await size(partial),bytes);await f.writeFile(JSON.stringify({first,bytes,commit}));}finally{await f.close();}}
  catch(e){if(e.code!=='EEXIST')throw e;const f=await open(specPath);try{const s=JSON.parse(await f.readFile('utf8'));if(s.commit!==commit||s.bytes!==bytes)throw Error('Model layout mismatch');first=s.first;}finally{await f.close();}}
  const chunkSize=32*1024*1024,ranges=[];
  for(let a=first;a<bytes;a+=chunkSize)ranges.push({a,b:Math.min(a+chunkSize,bytes)-1,path:join(parts,a+'.bin')});
  let next=0,done=first;
  async function worker(){
    while(next<ranges.length){
      const {a,b,path}=ranges[next++],len=b-a+1;
      if(await size(path)!==len){
        let last;
        for(let attempt=0;attempt<12;attempt++){
          try{
            const temp=path+'.part';
            await receive('https://huggingface.co/'+repo+'/resolve/'+commit+'/'+file+'?download=true&part='+a+'-'+b,temp,a,b,bytes);
            if(await size(temp)!==len)throw Error('Byte range length mismatch');
            await rename(temp,path);last=null;break;
          }catch(e){last=e;console.error(name+' '+a+' retry '+(attempt+1)+': '+e.message);await new Promise(r=>setTimeout(r,Math.min(1000*2**attempt,15000)));}
        }
        if(last)throw last;
      }
      done+=len;if(Math.floor(done/chunkSize)%8===0||done===bytes)console.log(name+' '+Math.floor(done/bytes*100)+'%');
    }
  }
  await Promise.all(Array.from({length:10},worker));
  const output=dest+'.verifying',fd=await open(output,'w'),h=createHash('sha256');
  try{
    for(const part of [...(first?[{path:partial,bytes:first}]:[]),...ranges.map(r=>({path:r.path,bytes:r.b-r.a+1}))]){
      for await(const chunk of createReadStream(part.path,{end:part.bytes-1})){
        h.update(chunk);let offset=0;while(offset<chunk.length){offset+=(await fd.write(chunk,offset,chunk.length-offset)).bytesWritten;}
      }
    }
  }finally{await fd.close();}
  if(await size(output)!==bytes||h.digest('hex')!==digest)throw Error('SHA-256 mismatch: '+name);
  await rename(output,dest);
  for(const {path} of ranges)await rm(path,{force:true});
  if(first)await rm(partial,{force:true});
  await rm(specPath,{force:true});
  console.log(name+' SHA-256 verified and installed');
}
await Promise.all(files.map(install));
