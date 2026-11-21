// This function lives in the outer opaque frame. The classroom document never parses source HTML.
function runPackage(pack){
  const frame=document.createElement('iframe');frame.title='3D 발명품 조작 화면';frame.setAttribute('sandbox','allow-scripts allow-downloads allow-pointer-lock');frame.setAttribute('allow','fullscreen');frame.style.cssText='display:block;width:100%;height:100%;border:0';document.body.append(frame);
  const report=(type,text)=>parent.postMessage({switchTool:1,type,text:String(text||'').slice(0,320)},'*');
  const b64=s=>{const bytes=new TextEncoder().encode(s);let raw='';for(let i=0;i<bytes.length;i+=24000)raw+=String.fromCharCode(...bytes.subarray(i,i+24000));return btoa(raw);};
  const unpack=s=>{const bytes=Uint8Array.from(atob(s),x=>x.charCodeAt(0));try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('euc-kr').decode(bytes);}};
  const mime=p=>({html:'text/html',htm:'text/html',mjs:'text/javascript',js:'text/javascript',cjs:'text/javascript',css:'text/css',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',ico:'image/x-icon',bmp:'image/bmp',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',gltf:'model/gltf+json',glb:'model/gltf-binary',stl:'model/stl',wasm:'application/wasm',webm:'video/webm',mp4:'video/mp4',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg'}[p.split('.').pop().toLowerCase()]||'application/octet-stream');
  const vroot='https://switch-pack.invalid/',virt=p=>vroot+p.split('/').map(encodeURIComponent).join('/');
  const files=new Map(pack.files.map(f=>[f.path,f])),assets=Object.create(null),aliases=Object.create(null),missing=new Set(),paths=[...files.keys()];
  function resolve(spec,from,withAlias=true){
    spec=String(spec||'').trim();if(!spec||/^(?:data:|blob:|#)/i.test(spec))return null;
    if(withAlias&&aliases[spec])return resolve(aliases[spec],pack.entry,false);
    if(withAlias){const k=Object.keys(aliases).filter(k=>k.endsWith('/')&&spec.startsWith(k)).sort((a,b)=>b.length-a.length)[0];if(k)return resolve(aliases[k]+spec.slice(k.length),pack.entry,false);}
    let url;try{url=new URL(spec,virt(from));}catch{return null;}if(!/^https?:$/.test(url.protocol))return null;
    let path;try{path=decodeURIComponent(url.pathname).replace(/^\/+/,'');}catch{return null;}
    if(files.has(path))return path;const tails=paths.filter(p=>path.endsWith('/'+p));if(tails.length)return tails.sort((a,b)=>b.length-a.length)[0];
    const leaf=path.split('/').pop();const matches=paths.filter(p=>p.split('/').pop()===leaf);return matches.length===1?matches[0]:null;
  }
  const doc=new DOMParser().parseFromString(unpack(files.get(pack.entry).data),'text/html');
  for(const s of doc.querySelectorAll('script[type="importmap"]')){try{const parsed=JSON.parse(s.textContent);for(const [a,v] of Object.entries(parsed.imports||{})){if(typeof v==='string'&&v)aliases[a]=v;}}catch{missing.add('importmap 형식');}s.remove();}
  const url=(p)=>'data:'+mime(p)+';base64,'+files.get(p).data;
  function mapped(spec,from){if(!spec||/^(data:|blob:|#)/i.test(spec))return spec;const p=resolve(spec,from);if(p)return assets[p]||url(p);missing.add(String(spec).split('?')[0].slice(-120));return 'about:blank';}
  function js(src,from){
    return src.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"'\n]+)\2/g,(all,before,q,spec)=>{const p=resolve(spec,from);if(p)return before+q+virt(p)+q;if(!/^(data:|blob:)/i.test(spec))missing.add(spec.slice(-120));return all;});
  }
  function css(src,from,trail=new Set()){
    return src.replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/gi,(_,spec)=>{const p=resolve(spec,from);if(!p||trail.has(p)){if(!p)missing.add(spec.slice(-120));return '';}return css(unpack(files.get(p).data),p,new Set([...trail,p]));}).replace(/url\(\s*(["']?)([^)'"]+)\1\s*\)/gi,(_,q,spec)=>'url("'+mapped(spec.trim(),from)+'")');
  }
  for(const p of paths)if(!/\.(?:[cm]?js|css|html?)$/i.test(p))assets[p]=url(p);
  for(const p of paths)if(/\.[cm]?js$/i.test(p))assets[p]='data:text/javascript;base64,'+b64(js(unpack(files.get(p).data),p));
  for(const p of paths)if(/\.css$/i.test(p))assets[p]='data:text/css;base64,'+b64(css(unpack(files.get(p).data),p));
  const imports=Object.create(null);for(const p of paths)if(/\.[cm]?js$/i.test(p))imports[virt(p)]=assets[p];
  for(const [a,v] of Object.entries(aliases)){const p=!a.endsWith('/')&&resolve(v,pack.entry,false);if(p&&assets[p])imports[a]=assets[p];}
  for(const e of doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed,frame,portal,link[rel=dns-prefetch],link[rel=preconnect],link[rel=prefetch],link[rel=prerender]'))e.remove();
  for(const e of doc.querySelectorAll('[integrity], [crossorigin]')){e.removeAttribute('integrity');e.removeAttribute('crossorigin');}
  for(const e of doc.querySelectorAll('script')){
    if(e.hasAttribute('src'))e.setAttribute('src',mapped(e.getAttribute('src'),pack.entry));else if(e.type==='module')e.textContent=js(e.textContent,pack.entry);
  }
  for(const e of doc.querySelectorAll('style'))e.textContent=css(e.textContent,pack.entry);
  for(const e of doc.querySelectorAll('[style]'))e.setAttribute('style',css(e.getAttribute('style'),pack.entry));
  for(const e of doc.querySelectorAll('link[href]'))e.href=mapped(e.getAttribute('href'),pack.entry);
  for(const e of doc.querySelectorAll('img[src],source[src],video[src],audio[src],input[type=image][src],track[src]'))e.setAttribute('src',mapped(e.getAttribute('src'),pack.entry));
  for(const e of doc.querySelectorAll('[poster]'))e.setAttribute('poster',mapped(e.getAttribute('poster'),pack.entry));
  for(const e of doc.querySelectorAll('img[srcset],source[srcset]')){const values=e.getAttribute('srcset');if(!values.trim().startsWith('data:'))e.setAttribute('srcset',values.split(',').map(x=>{const [path,...sz]=x.trim().split(/\s+/);return [mapped(path,pack.entry),...sz].join(' ');}).join(', '));}
  for(const e of doc.querySelectorAll('a[href]')){const h=e.getAttribute('href');if(h&&!/^(?:#|data:|blob:)/i.test(h)){const p=resolve(h,pack.entry);if(e.hasAttribute('download')&&p)e.href=assets[p]||url(p);else e.removeAttribute('href');}e.removeAttribute('target');}
  function localRuntime(config){
    const report=(type,text)=>parent.postMessage({switchFrame:1,type,text:String(text||'').slice(0,240)},'*');
    function localURL(value){const raw=String(value??'');if(/^(?:data:|blob:|#)/i.test(raw))return raw;let path;try{path=decodeURIComponent(new URL(raw,document.baseURI).pathname).replace(/^\/+/,'');}catch{return raw;}if(config[path])return config[path];
      const matches=Object.keys(config).filter(p=>p.split('/').at(-1)===path.split('/').at(-1));if(matches.length===1)return config[matches[0]];if(raw&&!/^about:/.test(raw))report('missing',path.slice(-110));return raw;}
    const nativeFetch=window.fetch.bind(window);window.fetch=(input,opts)=>{const src=input instanceof Request?input.url:input,dest=localURL(src);return nativeFetch(dest===String(src)?input:dest,opts);};
    const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,src,...args){return open.call(this,method,localURL(src),...args);};
    for(const [type,attr] of [[HTMLImageElement,'src'],[HTMLMediaElement,'src'],[HTMLScriptElement,'src']]){const d=Object.getOwnPropertyDescriptor(type.prototype,attr);if(d?.set&&d.configurable)Object.defineProperty(type.prototype,attr,{...d,set(v){d.set.call(this,localURL(v));}});}
    const set=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){return set.call(this,name,name==='src'&&/^(IMG|VIDEO|AUDIO|SOURCE|SCRIPT)$/.test(this.tagName)?localURL(value):value);};
    window.addEventListener('error',e=>{if(e.message)report('error',e.message);},true);
    window.addEventListener('unhandledrejection',e=>report('error',e.reason?.message||'원본에서 작업을 마치지 못했어요.'));
    window.addEventListener('DOMContentLoaded',()=>report('ready',''));
  }
  const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; worker-src data: blob:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri https://switch-pack.invalid";
  const base=doc.createElement('base');base.href=virt(pack.entry);const map=doc.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports}).replace(/</g,'\\u003c');const guard=doc.createElement('script');guard.textContent='('+localRuntime.toString()+')('+JSON.stringify(assets).replace(/</g,'\\u003c')+')';doc.head.prepend(meta,base,map,guard);
  let noted=0;window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data?.switchFrame===1&&['ready','missing','error'].includes(e.data.type)){if(e.data.type==='ready'||noted++<12)report(e.data.type,e.data.text);}});
  // A separate data document prevents the tool from inheriting the app's URL or authenticated origin.
  frame.src='data:text/html;charset=utf-8;base64,'+b64('<!doctype html>'+doc.documentElement.outerHTML);
  if(missing.size)report('missing',[...missing].slice(0,6).join(', '));
}

export function mountSwitchFrame(container,bundle,onStatus){
  const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts allow-downloads allow-pointer-lock');f.setAttribute('allow','fullscreen');f.className='sw-frame';f.title='격리된 3D 발명품 작업대';f.referrerPolicy='no-referrer';
  const csp="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; worker-src data: blob:; frame-src data:; object-src 'none'; form-action 'none'; base-uri https://switch-pack.invalid";
  const script='try{('+runPackage.toString()+')('+JSON.stringify(bundle).replace(/</g,'\\u003c')+')}catch(e){parent.postMessage({switchTool:1,type:"error",text:String(e.message).slice(0,240)},"*")}';
  f.srcdoc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;height:100%;background:#fff}</style></head><body><script>'+script.replace(/<\/script/ig,'<\\/script')+'</script></body></html>';
  const listen=e=>{if(e.source===f.contentWindow&&e.data?.switchTool===1&&['ready','missing','error'].includes(e.data.type))onStatus(e.data.type,String(e.data.text||'').slice(0,320));};window.addEventListener('message',listen);container.replaceChildren(f);return ()=>{window.removeEventListener('message',listen);f.remove();};
}