import {open,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../.local/models/',import.meta.url));
const packages=[
  ['이미지 모델','checkpoints','v1-5-pruned-emaonly-fp16.safetensors',2132696762],
  ['영상 모델','checkpoints','ltx-video-2b-v0.9.5.safetensors',6340729500],
  ['영상 프롬프트 인코더','text_encoders','t5xxl_fp8_e4m3fn.safetensors',4893934904]
];
async function fileSize(path){
  let handle;
  try{handle=await open(path,'r');return (await handle.stat()).size;}catch{return 0;}finally{await handle?.close();}
}
export async function setupProgress(){
  return (await Promise.all(packages.map(async([label,dir,name,total])=>{
    const target=join(root,dir,name),parts=join(root,'.ranges',name);
    if(await fileSize(target)===total)return {label,total,received:total,installed:true};
    let received=await fileSize(target+'.part');
    try{
      const layout=JSON.parse(await readFile(join(parts,'layout.json'),'utf8'));
      const files=(await readdir(parts)).filter(f=>/^\d+\.bin(?:\.part)?$/.test(f));
      received=Math.min(received,layout.first)+(await Promise.all(files.map(f=>fileSize(join(parts,f))))).reduce((a,b)=>a+b,0);
    }catch{}
    return received>0?{label,total,received:Math.min(received,total),installed:false}:null;
  }))).filter(Boolean);
}
