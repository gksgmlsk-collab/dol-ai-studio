// A small original paper-boat scene. Every frame uses the same seed and camera.
export function paintLake(canvas,frame=0){
  const c=canvas.getContext('2d'), w=canvas.width,h=canvas.height;
  c.save();c.clearRect(0,0,w,h);c.scale(w/640,h/360);
  c.translate(-frame*20,-frame*9);c.scale(1+frame*.07,1+frame*.07);
  const gradient=(x0,y0,x1,y1,stops)=>{const g=c.createLinearGradient(x0,y0,x1,y1);stops.forEach(([p,color])=>g.addColorStop(p,color));return g;};
  const path=(pts,fill)=>{c.fillStyle=fill;c.beginPath();c.moveTo(...pts[0]);pts.slice(1).forEach(v=>v.length===2?c.lineTo(...v):c.bezierCurveTo(...v));c.closePath();c.fill();};
  let seed=53181;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  c.fillStyle=gradient(0,0,360,250,[[0,'#6b68ac'],[.4,'#ac86b1'],[.74,'#f1afb0'],[1,'#ffd09f']]);c.fillRect(0,0,660,255);
  const glow=c.createRadialGradient(442,121,1,442,121,120);glow.addColorStop(0,'#fff0beaa');glow.addColorStop(1,'#ffe2bd00');c.fillStyle=glow;c.fillRect(320,0,250,246);
  c.fillStyle='#fff0c7';c.beginPath();c.arc(444,121,34,0,Math.PI*2);c.fill();
  for(let i=0;i<35;i++){const x=random()*640,y=random()*105,r=random()*1.5+.45;c.fillStyle='rgba(255,244,219,'+(0.2+random()*.55)+')';c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.fill();}
  for(const [x,y] of [[132,45],[324,36],[548,54]]){path([[x,y-4],[x+1,y-1],[x+4,y],[x+1,y+1],[x,y+4],[x-1,y+1],[x-4,y],[x-1,y-1]],'#ffeccf');}
  function ridge(y,amplitude,color,freq,phase){
    const p=[[-4,230]];
    for(let x=-4;x<=655;x+=3)p.push([x,y+(Math.sin(x*freq+phase)+.38*Math.sin(x*freq*2.4+phase*2)+.15*Math.cos(x*freq*5.5))*amplitude]);
    p.push([655,240]);path(p,color);
  }
  ridge(146,24,'#b496b1',.017,3);ridge(169,20,'#9185a7',.012,1.8);ridge(188,15,'#706c91',.019,4.1);
  c.fillStyle=gradient(0,200,280,365,[[0,'#baa2b6'],[.38,'#b8a3bf'],[.69,'#9290b1'],[1,'#707a9d']]);c.fillRect(0,203,660,170);
  const island=(pts,color)=>path(pts,color);
  island([[-4,186],[60,174],[137,186],[170,194],[237,203],[194,207],[-4,212]],'#5a607c');
  island([[458,202],[511,191],[555,187],[591,176],[644,169],[648,205],[523,207]],'#77778f');
  for(let i=0;i<440;i++){const y=204+random()*157,x=random()*644,len=(y-180)*(.02+.06*random());c.fillStyle=i%5?'rgba(251,220,206,.27)':'rgba(83,82,118,.25)';c.fillRect(x,y,len,.45+random()*.8);}
  for(let i=0;i<85;i++){const y=206+random()*148,dist=(y-202)*.45+8,x=444+((random()+random())-1)*dist;c.fillStyle='rgba(255,226,183,'+(.2+random()*.32)+')';c.fillRect(x,y,2+random()*12,1);}
  // Crisp paper folds over a softer surface reflection.
  const x=350+frame*8,y=264-frame*2;
  c.save();c.translate(x,y);
  c.fillStyle='#625f844d';c.beginPath();c.ellipse(-1,14,61,4,0,0,Math.PI*2);c.fill();
  path([[-55,-9],[-23,-5],[1,-44],[16,-5],[58,-17],[34,10],[-30,14]],'#f3d2b2');
  path([[-54,-9],[-25,11],[-4,2]],'#fff0cd');path([[-23,-5],[1,-44],[4,-4]],'#fff8e3');
  path([[1,-44],[18,-4],[4,-4]],'#ccb2b6');path([[-54,-9],[-3,2],[58,-17],[27,12],[-23,15]],'#f5cfa9');
  path([[-3,2],[58,-17],[27,12]],'#fff2d4');path([[-3,2],[-23,15],[27,12]],'#d7a3a2');c.restore();
  const trees=(start,end,bottom,scale,color)=>{for(let x=start;x<end;){const s=(.6+random()*.7)*scale,y=bottom+Math.sin(x*.06)*2;path([[x,y-16*s],[x+3*s,y-9*s],[x+2*s,y-9*s],[x+6*s,y-3*s],[x+4*s,y-3*s],[x+7*s,y],[x-7*s,y],[x-4*s,y-3*s],[x-6*s,y-3*s],[x-2*s,y-9*s],[x-3*s,y-9*s]],color);x+=5*s;}};
  trees(-2,62,185,.75,'#565973');trees(604,646,179,.6,'#646b84');
  island([[-5,317],[30,311],[66,323],[109,324],[137,333],[201,341],[159,346],[42,343],[-4,348]],'#4e526f');
  trees(-6,68,320,1.8,'#4e526f');trees(58,109,326,1.05,'#4e526f');
  island([[461,360],[507,347],[548,344],[584,336],[647,330],[647,366]],'#494e6b');trees(583,651,340,1.7,'#494e6b');
  c.restore();
}
