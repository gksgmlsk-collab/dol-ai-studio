let account='';
export function setAccount(userId){account=userId?'dol.account.'+encodeURIComponent(userId)+'.':'';}
const backing=()=>account?globalThis.sessionStorage:globalThis.localStorage;
const prefix=k=>account+k;
function keys(){return Object.keys(backing()).filter(k=>account?k.startsWith(account):!k.startsWith('dol.account.')).map(k=>k.slice(account.length));}
export const storage={getItem:k=>backing().getItem(prefix(k)),setItem:(k,v)=>backing().setItem(prefix(k),v),removeItem:k=>backing().removeItem(prefix(k)),key:i=>keys()[i]??null,get length(){return keys().length;}};
export function dbName(name){if(!account)return name;let key=storage.getItem('asset-workspace');if(!key){key=crypto.randomUUID();storage.setItem('asset-workspace',key);}return name+'-'+key;}
export function clearPastAccount(userId){let previous;try{previous=sessionStorage.getItem('dol.active-account');}catch{return;}if(previous&&previous!==userId){setAccount(previous);const key=storage.getItem('asset-workspace');if(key)for(const name of ['thinking-lab-maker-files','dol-fabrication-v1','dol-storyboard-v1'])indexedDB.deleteDatabase(name+'-'+key);for(const name of keys())storage.removeItem(name);}setAccount(userId);if(userId)sessionStorage.setItem('dol.active-account',userId);else sessionStorage.removeItem('dol.active-account');}
