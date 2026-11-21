const mode=location.hash==='#link'?'link':'login';
const teacherRoute=/^#login\/teacher-live\/([0-9a-z-]{1,80})$/i.exec(location.hash);
const returnTo='teacher-live'+(teacherRoute?'/'+teacherRoute[1]:'');
if(mode==='login')for(const link of document.querySelectorAll('a[href="/#join"]'))link.href='/#join/'+returnTo;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('link-form'),mount=$('google-button'),retry=$('retry');
let account=null,busy=false;
function tell(message,error=false){status.textContent=message;status.dataset.error=String(error);}
async function api(endpoint,body){
  const headers=body?{'Content-Type':'application/json','X-Dol-Account':account?.id||'guest'}:{};
  const res=await fetch('/api/school/'+endpoint,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers,body:body?JSON.stringify(body):undefined});
  const data=await res.json();if(!res.ok)throw Error(data.error||'로그인을 계속할 수 없어요.');return data;
}
function loadGoogle(){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.async=true;s.src='https://accounts.google.com/gsi/client';
    s.referrerPolicy=location.protocol==='http:'?'no-referrer-when-downgrade':'strict-origin-when-cross-origin';
    let timer;const failed=()=>{clearTimeout(timer);reject(Error('Google 로그인 화면을 불러오지 못했어요. 브라우저의 인터넷 연결을 확인해 주세요.'));};
    s.onload=()=>{clearTimeout(timer);window.google?.accounts?.id?resolve(window.google.accounts.id):failed();};s.onerror=failed;
    timer=setTimeout(failed,13000);document.head.append(s);
  });
}
async function start(password){
  if(busy)return;busy=true;form.querySelector('button').disabled=true;retry.hidden=true;
  try{
    const challenge=await api('google/start',{mode,password});$('password').value='';form.hidden=true;
    tell('Google 계정 선택 버튼을 여는 중이에요.');
    const google=await loadGoogle();
    google.initialize({client_id:challenge.clientId,nonce:challenge.nonce,ux_mode:'popup',auto_select:false,callback:async response=>{
      mount.replaceChildren();tell('Google 응답과 교사 초대를 확인하는 중이에요.');
      try{
        const result=await api('google/finish',{csrf:challenge.csrf,credential:response.credential});
        if(result.user?.role!=='teacher')throw Error('교사 계정을 확인할 수 없어요.');
        location.replace('/#'+(mode==='link'?'join':returnTo));
      }catch(e){tell(e.message,true);retry.hidden=false;}
    }});
    google.renderButton(mount,{type:'standard',text:'signin_with',size:'large',shape:'pill',theme:'outline',locale:'ko',width:Math.max(180,Math.min(320,Math.floor(mount.getBoundingClientRect().width)))});
    tell('사용할 Google 계정을 선택해 주세요. 선택 화면이 열리지 않으면 팝업 설정을 확인해 주세요.');
  }catch(e){tell(e.message,true);retry.hidden=false;}
  finally{busy=false;form.querySelector('button').disabled=false;}
}
retry.addEventListener('click',()=>location.reload());
form.addEventListener('submit',e=>{e.preventDefault();start($('password').value);});
try{
  const me=await api('google/current');account=me.user;
  if(!me.google?.enabled)throw Error('학교 운영자가 Google 웹 클라이언트 ID를 설정하면 이용할 수 있어요.');
  if(location.protocol!=='https:'&&location.hostname!=='localhost')throw Error('같은 포트의 localhost 주소로 수업 참여 화면을 열어 주세요.');
  if(mode==='link'){
    if(account?.role!=='teacher')throw Error('기존 교사 계정으로 로그인한 뒤 수업 참여에서 Google 계정 연결을 선택해 주세요.');
    if(me.google.linkedEmail)throw Error('이미 Google 계정이 연결되어 있어요.');
    $('title').textContent='교사 Google 계정 연결';$('intro').textContent=account.name+' 교사의 기존 작품과 교실을 이 계정으로 계속 열 수 있어요.';
    form.hidden=false;tell('교사 비밀번호를 확인한 뒤 연결할 Google 계정을 선택해요.');$('password').focus();
  }else{
    if(account)throw Error('현재 수업 계정에서 로그아웃한 뒤 Google 로그인을 시작해 주세요.');
    await start();
  }
}catch(e){tell(e.message,true);}
