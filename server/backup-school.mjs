import * as sqlite from 'node:sqlite';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {access,copyFile,mkdtemp,mkdir,rm,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';

const arg=process.argv[2];
if(!arg)throw Error('Usage: node server/backup-school.mjs <new-backup.sqlite>');
const base=process.env.DOL_SCHOOL_DIR||join(process.env.LOCALAPPDATA||homedir(),'DOL-AI-Studio','school');
const source=resolve(base,'classroom.sqlite'),dest=resolve(arg);
await access(source);
if(source.toLowerCase()===dest.toLowerCase())throw Error('Choose a new backup file.');
await mkdir(dirname(dest),{recursive:true});
const scratch=await mkdtemp(join(dirname(dest),'.dol-backup-')),tmp=join(scratch,'verified.sqlite');
const DB=sqlite.Database||sqlite.DatabaseSync;
try{
  const db=new DB(source,{readOnly:true,timeout:5000});
  try{await sqlite.backup(db,tmp);}finally{db.close();}
  const replica=new DB(tmp);
  try{
    replica.exec('PRAGMA journal_mode=DELETE');
    if(replica.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup integrity check failed.');
  }finally{replica.close();}
  await copyFile(tmp,dest,constants.COPYFILE_EXCL);
}finally{
  for(const extension of ['-journal','-shm','-wal',''])await rm(tmp+extension,{force:true});
  await rmdir(scratch);
}
console.log('Verified school database backup saved to '+dest);
