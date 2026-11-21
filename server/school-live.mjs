const activeSeconds=60,retentionMs=86400000;
const toolKeys=new Set([
  'home','cover','student','projects','project','start','studio','workshop','make','dialogue','image','video',
  'web','3d','robot','switch','city','storyboard','gallery','materials','journal','plan','test','feedback',
  'versions','models','sample','demo','join'
]);
const iso=t=>new Date(t).toISOString();
const deny=(status,message)=>{throw Object.assign(new Error(message),{status,code:'class_live_'+status});};

export function createClassLive({db,one,all,run,tx,classFor,projectFor}){
  db.exec(`
    CREATE TABLE IF NOT EXISTS class_live_tabs (
      sessionKey TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,tabId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,classId TEXT REFERENCES classes(id) ON DELETE CASCADE,
      projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,tool TEXT,active INTEGER NOT NULL,
      seenAt INTEGER NOT NULL,seq INTEGER NOT NULL,PRIMARY KEY(sessionKey,tabId)
    );
    CREATE INDEX IF NOT EXISTS class_live_tab_class ON class_live_tabs(classId,active,seenAt);
    CREATE TABLE IF NOT EXISTS class_live_seen (
      classId TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seenAt INTEGER NOT NULL,PRIMARY KEY(classId,userId)
    );
    CREATE TABLE IF NOT EXISTS class_live_drafts (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,authorId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,at TEXT NOT NULL,PRIMARY KEY(projectId,authorId)
    );
  `);
  let nextCleanup=0;
  function cleanup(t){
    if(t<nextCleanup)return;
    run('DELETE FROM class_live_tabs WHERE seenAt<=?',t-retentionMs);
    run('DELETE FROM class_live_seen WHERE seenAt<=?',t-retentionMs);
    nextCleanup=t+60000;
  }
  cleanup(Date.now());
  function pulse(u,key,b){
    if(u.role!=='student')deny(403,'학생 계정에서 참여 중인 학급에만 접속 상태를 보낼 수 있어요.');
    const tab=b.tabId===undefined?'main':b.tabId;
    if(typeof tab!=='string'||!/^[-_a-zA-Z0-9]{1,80}$/.test(tab))deny(400,'학급 화면을 새로 열어 주세요.');
    if(b.active!==undefined&&typeof b.active!=='boolean')deny(400,'탭 상태를 확인해 주세요.');
    if(b.seq!==undefined&&(!Number.isSafeInteger(b.seq)||b.seq<0))deny(400,'탭 순서를 확인해 주세요.');
    const t=Date.now(),response={ok:true,asOf:iso(t),activeWithinSeconds:activeSeconds};
    cleanup(t);
    return tx(()=>{
      const prev=one('SELECT classId,seq FROM class_live_tabs WHERE sessionKey=? AND tabId=?',key,tab);
      if(prev&&b.seq!==undefined&&b.seq<=prev.seq)return response;
      const seq=b.seq??((prev?.seq||0)+1);
      let cl=null,projectId=null,tool=null;
      const active=b.active!==false;
      if(active){
        if(!toolKeys.has(b.tool))deny(400,'등록된 수업 화면을 선택해 주세요.');
        tool=b.tool;
        if(b.projectId){
          if(typeof b.projectId!=='string')deny(400,'프로젝트를 확인해 주세요.');
          const p=projectFor(u,b.projectId);cl=p.classId;projectId=p.id;
          if(b.classId&&b.classId!==cl)deny(404,'이 학급의 프로젝트를 찾을 수 없어요.');
        }else if(b.classId){
          if(typeof b.classId!=='string')deny(400,'학급을 확인해 주세요.');
          cl=classFor(u,b.classId).id;
        }else{
          const roster=all('SELECT classId FROM members WHERE userId=? LIMIT 2',u.id);
          if(roster.length!==1)deny(400,'접속 상태를 보낼 학급을 선택해 주세요.');
          cl=roster[0].classId;
        }
      }else{
        if(b.classId){if(typeof b.classId!=='string')deny(400,'학급을 확인해 주세요.');classFor(u,b.classId);}
        if(b.projectId){
          if(typeof b.projectId!=='string')deny(400,'프로젝트를 확인해 주세요.');
          const p=projectFor(u,b.projectId);if(b.classId&&b.classId!==p.classId)deny(404,'이 학급의 프로젝트를 찾을 수 없어요.');
        }
        if(prev&&b.classId&&prev.classId&&b.classId!==prev.classId)return response;
        cl=prev?.classId||null;
      }
      // Replacing this per-tab row preserves server arrival order when timestamps share a millisecond.
      run('INSERT OR REPLACE INTO class_live_tabs VALUES(?,?,?,?,?,?,?,?,?)',
        key,tab,u.id,cl,projectId,tool,active?1:0,t,seq);
      if(active)run('INSERT INTO class_live_seen VALUES(?,?,?) ON CONFLICT(classId,userId) DO UPDATE SET seenAt=excluded.seenAt',cl,u.id,t);
      if(!prev)run('DELETE FROM class_live_tabs WHERE sessionKey=? AND tabId IN (SELECT tabId FROM class_live_tabs WHERE sessionKey=? ORDER BY seenAt DESC,rowid DESC LIMIT -1 OFFSET 12)',key,key);
      return response;
    });
  }

  // Keep one autosave marker per contributor and project. Versions and attached work retain their own authors.
  function markDraft(projectId,authorId,revision,at){
    run('INSERT INTO class_live_drafts VALUES(?,?,?,?) ON CONFLICT(projectId,authorId) DO UPDATE SET revision=excluded.revision,at=excluded.at',projectId,authorId,revision,at);
  }

  function snapshot(u,id){
    const c=classFor(u,id,true),t=Date.now();cleanup(t);
    const rows=all(`WITH connected AS (
      SELECT l.userId,l.projectId,l.tool,row_number() OVER(PARTITION BY l.userId ORDER BY l.seenAt DESC,l.rowid DESC) AS position
      FROM class_live_tabs l JOIN sessions s ON s.token=l.sessionKey AND s.expires>?
      WHERE l.classId=? AND l.active=1 AND l.seenAt>?
    )
    SELECT u.id,u.name,seen.seenAt,k.userId IS NOT NULL AS online,k.tool,p.id AS projectId,p.title AS projectTitle,
      g.id AS teamId,g.name AS teamName
    FROM members m JOIN users u ON u.id=m.userId
    LEFT JOIN class_live_seen seen ON seen.classId=m.classId AND seen.userId=u.id AND seen.seenAt>?
    LEFT JOIN connected k ON k.userId=u.id AND k.position=1
    LEFT JOIN projects p ON p.id=k.projectId AND p.classId=m.classId
       AND ((p.teamId IS NULL AND p.ownerId=u.id) OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.teamId=p.teamId AND tm.userId=u.id))
    LEFT JOIN teams g ON g.id=p.teamId WHERE m.classId=? ORDER BY u.name,u.id`,t,id,t-activeSeconds*1000,t-retentionMs,id);

    // Never select a draft, prompt, private contribution, filename or feedback body.
    const ranked=all(`WITH scope AS MATERIALIZED (
      SELECT p.id,p.title,p.teamId,p.ownerId,p.createdAt,g.name AS teamName FROM projects p
      LEFT JOIN teams g ON g.id=p.teamId WHERE p.classId=?
    ), change(id,kind,at,authorId,projectId,versionId,versionNumber) AS (
      SELECT 'create-'||id,'created',createdAt,ownerId,id,NULL,NULL FROM scope
      UNION ALL SELECT 'draft-'||d.projectId||'-'||d.revision,'draft',d.at,d.authorId,d.projectId,NULL,NULL FROM scope p JOIN class_live_drafts d ON d.projectId=p.id
      UNION ALL SELECT 'asset-'||a.id,'asset',a.createdAt,a.authorId,a.projectId,NULL,NULL FROM scope p JOIN assets a ON a.projectId=p.id
      UNION ALL SELECT 'version-'||v.id,'version',v.createdAt,v.authorId,v.projectId,v.id,v.n FROM scope p JOIN versions v ON v.projectId=p.id
    ), details AS (
      SELECT change.*,p.title AS projectTitle,p.teamId,p.teamName,u.name AS authorName,u.role AS authorRole,
        row_number() OVER(ORDER BY at DESC,change.id DESC) AS feedRank,
        row_number() OVER(PARTITION BY authorId ORDER BY at DESC,change.id DESC) AS authorRank
      FROM change JOIN scope p ON p.id=change.projectId JOIN users u ON u.id=change.authorId
    ) SELECT * FROM details WHERE feedRank<=30 OR authorRank=1 ORDER BY feedRank`,id);
    const events=[],byAuthor=new Map();
    for(const {feedRank,authorRank,...e} of ranked){if(feedRank<=30)events.push(e);if(authorRank===1)byAuthor.set(e.authorId,e);}
    const students=rows.map(({seenAt,online,...s})=>({...s,online:!!online,lastSeenAt:seenAt?iso(seenAt):null,lastSave:byAuthor.get(s.id)||null}));
    return {class:{id:c.id,name:c.name},asOf:iso(t),heartbeatSeconds:15,activeWithinSeconds:activeSeconds,students,events};
  }
  return {pulse,snapshot,markDraft};
}
