import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {lstat,realpath,open} from 'node:fs/promises';

const maxBytes=32*1024*1024,maxJson=46*1024*1024;
const okPath=path=>typeof path==='string'&&path.length<=300&&/^[^\\:\x00-\x1f?#%]+$/u.test(path)&&path.split('/').every(s=>s&&s[0]!=='.')&&/\.(html?|[cm]?js|css|json|map|png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|otf|stl|gltf|glb|obj|mtl|bin|wasm|drc|ktx2?|hdr|exr|webm|mp4|mp3|wav|ogg)$/i.test(path);
const fail=(code,message)=>{throw Object.assign(Error(message),{status:code,code:'switch_source'});};
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function readBundle(req){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'JSON 파일 묶음이 필요해요.');
  if(Number(req.headers['content-length'])>maxJson)fail(413,'파일 묶음의 크기를 32MB 이하로 줄여 주세요.');
  let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>maxJson)fail(413,'파일 묶음의 크기를 32MB 이하로 줄여 주세요.');chunks.push(c);}
  let v;try{v=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'파일 목록을 읽을 수 없어요.');}
  if(!v||!Number.isInteger(v.revision)||v.revision<0||!okPath(v.entry)||!/\.html?$/i.test(v.entry)||!Array.isArray(v.files)||!v.files.length||v.files.length>300)fail(400,'시작할 HTML과 자료 파일 목록을 확인해 주세요.');
  const files=[],paths=new Set();let size=0;
  for(const f of v.files){if(!okPath(f?.path)||paths.has(f.path)||typeof f.data!=='string'||f.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))fail(400,'자료 파일 이름이나 형식을 확인해 주세요.');paths.add(f.path);const bytes=Buffer.from(f.data,'base64');size+=bytes.length;if(size>maxBytes)fail(413,'파일 묶음의 크기를 32MB 이하로 줄여 주세요.');files.push({path:f.path,data:f.data});}
  if(!files.some(f=>f.path===v.entry&&f.data))fail(400,'선택한 시작 HTML이 비어 있거나 목록에 없어요.');
  const payload=JSON.stringify({entry:v.entry,files});return {revision:v.revision,entry:v.entry,count:files.length,size,hash:createHash('sha256').update(payload).digest('hex'),payload};
}
const fixedEntry='Seokam_Switch_3D.html';
async function knownSource(req,res){
  if(req.method!=='GET')fail(405,'지정한 위치의 원본은 읽을 수만 있어요.');
  const file=join(homedir(),'Documents','카카오톡 받은 파일',fixedEntry);
  let handle;try{
    const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile()||!info.size){send(res,200,{available:false});return;}
    if(info.size>maxBytes)fail(413,'지정한 HTML이 32MB보다 커요. 수업에 필요한 자료를 따로 모아 주세요.');
    const [actual,parent]=await Promise.all([realpath(file),realpath(dirname(file))]);if(actual!==join(parent,fixedEntry)){send(res,200,{available:false});return;}
    if(new URL(req.url,'http://local.invalid').searchParams.get('open')!=='1'){send(res,200,{available:true,entry:fixedEntry,size:info.size});return;}
    handle=await open(actual,'r');const stat=await handle.stat();if(!stat.isFile()||stat.size!==info.size||stat.mtimeMs!==info.mtimeMs)fail(409,'원본이 바뀌고 있어요. 잠시 뒤 다시 열어 주세요.');
    const data=Buffer.alloc(info.size);let used=0;while(used<data.length){const {bytesRead}=await handle.read(data,used,data.length-used,used);if(!bytesRead)fail(409,'파일을 복사하는 중이에요. 잠시 뒤 다시 열어 주세요.');used+=bytesRead;}
    if((await handle.stat()).mtimeMs!==info.mtimeMs)fail(409,'원본이 바뀌고 있어요. 잠시 뒤 다시 열어 주세요.');
    send(res,200,{available:true,entry:fixedEntry,size:data.length,bundle:{entry:fixedEntry,size:data.length,files:[{path:fixedEntry,data:data.toString('base64')}]}});
  }catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR'){send(res,200,{available:false});return;}if(['EACCES','EPERM'].includes(e.code))fail(403,'서버가 지정한 HTML을 읽을 수 없어요. 파일 선택으로 열어 주세요.');throw e;}finally{await handle?.close();}
}
export async function handleSwitchSource(req,res,classId,db,part){
  if(part==='default-file'){await knownSource(req,res);return;}
  db.exec('CREATE TABLE IF NOT EXISTS switch_sources(classId TEXT PRIMARY KEY REFERENCES classes(id),revision INTEGER NOT NULL,entry TEXT NOT NULL,count INTEGER NOT NULL,size INTEGER NOT NULL,hash TEXT NOT NULL,updatedAt TEXT NOT NULL,payload TEXT NOT NULL)');
  const getMeta=()=>db.prepare('SELECT revision,entry,count,size,hash,updatedAt FROM switch_sources WHERE classId=?').get(classId);
  if(req.method==='GET'){
    const meta=getMeta();if(!meta){send(res,200,{available:false,revision:0});return;}
    const full=new URL(req.url,'http://local.invalid').searchParams.get('bundle')==='1';send(res,200,{available:true,...meta,...full?{bundle:JSON.parse(db.prepare('SELECT payload FROM switch_sources WHERE classId=?').get(classId).payload)}:{}});return;
  }
  if(req.method!=='PUT')fail(405,'이 자료는 읽거나 등록할 수 있어요.');
  const input=await readBundle(req);db.exec('BEGIN IMMEDIATE');try{const old=getMeta();
    if(old?.hash!==input.hash){if((old?.revision||0)!==input.revision)fail(409,'다른 창에서 자료가 바뀌었어요. 학급 원본을 다시 연 뒤 등록해 주세요.');db.prepare('INSERT INTO switch_sources VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(classId) DO UPDATE SET revision=excluded.revision,entry=excluded.entry,count=excluded.count,size=excluded.size,hash=excluded.hash,updatedAt=excluded.updatedAt,payload=excluded.payload').run(classId,input.revision+1,input.entry,input.count,input.size,input.hash,new Date().toISOString(),input.payload);}
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  send(res,200,{available:true,...getMeta()});
}