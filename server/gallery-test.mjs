import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSchool} from './school.mjs';
import {classifyGalleryAssets,filterGallery,publicCityUrl} from '../dist/gallery-types.mjs';
import {gallerySamples} from '../dist/home.mjs';
import {galleryListUrl,galleryRoute,sampleReturn} from '../dist/gallery.mjs';

const dir=mkdtempSync(join(tmpdir(),'dol-gallery-check-'));
const secret='fixture-'+crypto.randomUUID();
let school=createSchool({dataDir:dir,bootstrapSecret:secret});
const server=createServer((q,r)=>school.handle(q,r,new URL(q.url,'http://localhost')));
server.listen(0,'127.0.0.1');
await once(server,'listening');
const root='http://127.0.0.1:'+server.address().port+'/api/school/';
async function call(cookie,path,body,status=body?201:200) {
  const res=await fetch(root+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await res.json();
  assert.equal(res.status,status,path+' '+JSON.stringify(data).slice(0,100));
  return {data,cookie:res.headers.getSetCookie()[0]?.split(';')[0]};
}
const get=async(cookie,path,status)=>(await call(cookie,path,undefined,status)).data;
const post=async(cookie,path,body,status)=>(await call(cookie,path,body,status)).data;
try{
  const teacher=(await call('','login',{login:'teacher',secret},200)).cookie;
  const a=await post(teacher,'classes',{name:'솔방울 교실'}), b=await post(teacher,'classes',{name:'메아리 교실'});
  async function student(group) {
    const {login,secret}=await post(teacher,'classes/'+group.id+'/students',{name:'연구원'});
    return (await call('','login',{classCode:group.code,login,secret},200)).cookie;
  }
  const author=await student(a),peer=await student(a),other=await student(b);
  const p=await post(author,'projects',{classId:a.id,title:'여러 공방에서 만든 작품'});
  const base='projects/'+p.id;
  const png=readFileSync(new URL('../dist/assets/paper-boat.png',import.meta.url)).toString('base64');
  const video=readFileSync(new URL('../dist/assets/paper-boat.webm',import.meta.url)).toString('base64');
  const cityUrl='https://namijini-future-city-production.up.railway.app/future-city/result?city=123';
  const items=[
    {kind:'city',title:'도시 이미지',filename:'비공개이름.png',mime:'image/png',data:png,description:'처음 생각 · 공개하지 않은 개인 성찰\n작품 주소 · '+cityUrl},
    {kind:'file',title:'실제로 움직이는 배',filename:'비공개영상.webm',mime:'video/webm',data:video},
    {kind:'file',title:'이전 웹 설계',filename:'이름을 숨겨요.dol-web.json',data:'e30='},
    {kind:'file',title:'이전 입체 설계',filename:'모형.stl',data:'c29saWQ='},
    {kind:'file',title:'이전 발명 설계',filename:'이름.dol-robot.json',data:'e30='},
    {kind:'note',title:'전시할 생각',description:'다음에는 날씨를 바꿔 볼래요.'},
    {kind:'city',title:'도시 작품 주소만',description:'확인한 점 · 공유하지 않을 관찰\n작품 주소 · '+cityUrl},
    {kind:'city',title:'잘못된 주소',description:'다음 시도 · 비공개 초안\n작품 주소 · https://example.com/future-city/'}
  ];
  const ids=[];
  for(const item of items)ids.push((await post(author,base+'/assets',item)).id);
  const v=await post(author,base+'/versions',{revision:0,reason:'첫 버전'});
  async function exhibit(title,assetIds,approved=true) {
    const e=await post(author,base+'/exhibits',{title,versionId:v.id,assetIds,stage:'완성'});
    if(approved)await post(teacher,'gallery/'+e.id+'/moderate',{status:'approved'},200);
    return e.id;
  }
  const mixed=await exhibit('함께 만든 도시',ids.slice(0,5));
  const note=await exhibit('그다음 아이디어',[ids[5]]),empty=await exhibit('자료를 고르기 전',[]);
  const hidden=await exhibit('아직 승인 전',[ids[1]],false);
  const linkOnly=await exhibit('도시를 직접 열어 봐요',[ids[6],ids[7]]);
  const textOnly=await exhibit('공개 범위가 다른 버전',[ids[2]]);
  const query=(type,group=a)=>'gallery?type='+type+'&classId='+group.id;
  school.close();school=createSchool({dataDir:dir,bootstrapSecret:secret});
  const all=await get(peer,query('all'));
  assert.deepEqual(new Set(all.map(e=>e.id)),new Set([mixed,note,empty,textOnly,linkOnly]));
  for(const type of ['image','video','3d','robot'])assert.deepEqual((await get(peer,query(type))).map(e=>e.id),[mixed]);
  assert.deepEqual(new Set((await get(peer,query('web'))).map(e=>e.id)),new Set([mixed,textOnly]));
  assert.deepEqual(new Set((await get(peer,query('other'))).map(e=>e.id)),new Set([note,empty]));
  assert.deepEqual(new Set((await get(peer,query('city'))).map(e=>e.id)),new Set([mixed,linkOnly]));
  const links=await get(peer,'gallery/'+linkOnly);assert.equal(links.assets[0].publicUrl,cityUrl);assert.equal(links.assets[1].publicUrl,undefined);assert.ok(links.assets.every(a=>a.description===''));assert.ok(!JSON.stringify(links).includes('공유하지 않을 관찰'));
  for(const url of ['https://x.example/future-city/',cityUrl.replace('/future-city/','/secret/'),cityUrl.replace('https://','https://student:secret@'),'javascript:alert(1)',cityUrl.replace('/result','/%2e%2e/private')])assert.equal(publicCityUrl(url),'');
  const detail=await get(peer,'gallery/'+mixed);
  assert.deepEqual(detail.types,['video','image','web','3d','robot','city']);
  assert.ok(!JSON.stringify(detail).includes('비공개이름')&&!JSON.stringify(detail).includes('공개하지 않은 개인 성찰'));
  assert.deepEqual((await get(peer,'gallery/'+textOnly)).types,['web']);
  await get(peer,'gallery/'+hidden,404);await get(other,'gallery/'+mixed,404);await get('',query('video'),401);
  await get(peer,query('video',b),404);assert.deepEqual(await get(teacher,query('video',b)),[]);await get(peer,query('no-such-type'),400);
  await post(teacher,'gallery/'+mixed+'/moderate',{status:'revoked'},200);assert.deepEqual(await get(peer,query('video')),[]);
  assert.deepEqual(classifyGalleryAssets([{kind:'audio',filename:'녹음.webm',mime:'audio/webm'}]),['other']);
  assert.deepEqual(filterGallery(gallerySamples(),'video').map(s=>s.id),['boat']);
  assert.deepEqual(filterGallery(gallerySamples(),'3d').map(s=>s.id),['switch']);
  assert.equal(galleryRoute('#gallery/'+mixed+'/video/'+a.id).type,'video');
  assert.equal(sampleReturn('#sample/boat/gallery/video/'+a.id).href,galleryListUrl('video',a.id));
  console.log('PASS gallery: persisted mixed works, all types, selected assets, class membership, approval, revocation and sample navigation');
}finally{
  server.close();school.close();
}
