// Only a visible, signed-in student tab reports its classroom and tool.
export function studentPresence(user,classes=[]) {
  if(user?.role!=='student'||!['https:','http:'].includes(location.protocol))return {visit(){},stop(){}};
  const tabId=crypto.randomUUID(),events=new AbortController();
  let context=null,seq=0,timer=null,lastActive=false,stopped=false;
  const defaultClass=classes.length===1?classes[0].id:null;
  function publish(active,keepalive=false){
    if(stopped||(!active&&!lastActive))return;
    if(active&&(!context||document.hidden))return;
    lastActive=active;
    const body={tabId,seq:++seq,active,...(active?context:{})};
    fetch('/api/school/presence',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive}).catch(()=>{});
  }
  function schedule(){
    clearInterval(timer);timer=null;
    if(document.hidden||!context){publish(false,true);return;}
    publish(true);timer=setInterval(()=>publish(true),15000);
  }
  function visit(tool,{projectId=null,classId=null}={}){
    const scopedClass=classId||(!projectId?defaultClass:null);
    const next=tool&&(projectId||scopedClass)?{tool,projectId,classId:scopedClass}:null;
    if(next?.tool===context?.tool&&next?.projectId===context?.projectId&&next?.classId===context?.classId)return;
    context=next;schedule();
  }
  document.addEventListener('visibilitychange',schedule,{signal:events.signal});
  window.addEventListener('pagehide',()=>{clearInterval(timer);publish(false,true);},{signal:events.signal});
  window.addEventListener('pageshow',e=>{if(e.persisted)schedule();},{signal:events.signal});
  return {visit,stop(){clearInterval(timer);publish(false,true);stopped=true;events.abort();}};
}
