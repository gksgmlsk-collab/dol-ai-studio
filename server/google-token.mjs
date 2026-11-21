import {createPublicKey,verify} from 'node:crypto';

const jwksUri='https://www.googleapis.com/oauth2/v3/certs';
const invalid=()=>Object.assign(new Error('Google 인증을 확인하지 못했어요. 계정을 다시 선택해 주세요.'),{status:401,code:'google_invalid'});
const unreachable=()=>Object.assign(new Error('Google 공개 키를 확인할 수 없어요. 인터넷 연결을 확인하거나 교사 아이디로 로그인해 주세요.'),{status:503,code:'google_keys_unavailable'});
export const validClientId=id=>typeof id==='string'&&id.length<=256&&/^\d+(?:-[a-zA-Z0-9_-]+)?\.apps\.googleusercontent\.com$/.test(id);

export function createGoogleVerifier(fetchKeys=fetch){
  let keys=new Map(),expires=0,lastFetch=0,loading=null;
  async function refresh(){
    if(loading)return loading;
    lastFetch=Date.now();
    loading=(async()=>{
      try{
        const res=await fetchKeys(jwksUri,{redirect:'error',signal:AbortSignal.timeout(6000)});
        if(!res.ok)throw Error();
        const document=await res.json(),next=new Map();
        for(const jwk of document.keys||[]){
          if(jwk.kty==='RSA'&&jwk.alg==='RS256'&&jwk.use==='sig'&&typeof jwk.kid==='string')
            next.set(jwk.kid,createPublicKey({format:'jwk',key:jwk}));
        }
        if(!next.size)throw Error();
        const age=Number(res.headers.get('age'))||0;
        const ttl=Number(/(?:^|,)\s*max-age=(\d+)/i.exec(res.headers.get('cache-control')||'')?.[1]??60);
        keys=next;expires=Date.now()+Math.max(0,Math.min(86400,ttl-age))*1000;
      }catch{throw unreachable();}
    })().finally(()=>{loading=null;});
    await loading;
  }
  return async function verifyGoogleToken(credential,clientId,nonce){
    if(typeof credential!=='string'||credential.length>16000||!validClientId(clientId)||typeof nonce!=='string'||!nonce)throw invalid();
    const parts=credential.split('.');
    if(parts.length!==3||parts.some(s=>!s||!/^[\w-]+$/.test(s)))throw invalid();
    let header,claims;
    try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw invalid();}
    if(header?.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.kid.length>250)throw invalid();
    if(Date.now()>=expires||(!keys.has(header.kid)&&Date.now()-lastFetch>30000))await refresh();
    const key=keys.get(header.kid);
    if(!key||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))throw invalid();
    const t=Math.floor(Date.now()/1000);
    if(!claims||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||
       (claims.azp!==undefined&&claims.azp!==clientId)||!Number.isSafeInteger(claims.exp)||claims.exp<=t||
       !Number.isSafeInteger(claims.iat)||claims.iat>t+60||claims.iat>=claims.exp||
       (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>t+60))||
       claims.nonce!==nonce||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||
       claims.email_verified!==true||typeof claims.email!=='string'||claims.email.length>254||!/^\S+@[^\s@]+$/.test(claims.email))throw invalid();
    const email=claims.email.toLowerCase();
    return {subject:claims.sub,email,authoritative:email.endsWith('@gmail.com')||typeof claims.hd==='string'&&claims.hd.trim().length>0};
  };
}
