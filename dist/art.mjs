// Original low-resolution illustrations, drawn on an integer pixel grid.
function painter(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  const rect = (x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  const poly = (points,color) => {
    const min=Math.min(...points.map(p=>p[1])), max=Math.max(...points.map(p=>p[1]));
    for (let y=min; y<max; y++) {
      const hits=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],line=y+.5;
        if((a[1]<=line && b[1]>line)||(b[1]<=line && a[1]>line)) hits.push(a[0]+(line-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      hits.sort((a,b)=>a-b);
      for(let j=0;j<hits.length;j+=2)rect(Math.round(hits[j]),y,Math.max(0,Math.round(hits[j+1])-Math.round(hits[j])),1,color);
    }
  };
  const sprite=(rows,colors,x,y,s=1)=>rows.forEach((r,dy)=>[...r].forEach((ch,dx)=> {if(colors[ch])rect(x+dx*s,y+dy*s,s,s,colors[ch]);}));
  return {c,rect,poly,sprite};
}
const shine=['..a..','..a..','aaaaa','..a..','..a..'];
const star=['....aa....','...abba...','aaabbbbaaa','abbbbbbbba','.abbbbbba.','..abbbba..','..abb bba.','..aa..aa..'].map(s=>s.replace(' ','a'));
const robot=['.......kk........','.......yy........','.......kk........','...kkkkkkkkkk....','..kwwwwwwwwwwk...','.kwwwwwwwwwggwk..','.kwkkkkkkkkkkwk..','kkwkbbbbbbbbkwkk.','kbwkblbbbbblkwbk.','kbwkblbbbbblkwbk.','.kwkbbbbbbbbkwk..','.kwwkkkkkkkkwwk..','..kwwwwwwwwwwk...','...kkkwwwwkkk....','..kkwwwwwwwwkk...','.kbkwwwbbwwwkbk..','.kbkwwwwwwwwkbk..','..kkkwwwwggkkk...','....kggkkggk.....','...kbbbk kbbbk...','...kkkkk kkkkk...'];
const botColors={k:'#243b63',w:'#fffdf1',g:'#b8c3d1',b:'#455cca',l:'#a9f7fe',y:'#ffc53f'};
function cloud(p,x,y,w=1){
  p.sprite(['....wwwww.........','..wwwwwwwww..www..','.wwwwwwwwwwwwwwww.','wwwwwwwwwwwwwwwwww','.dddddddddddddddd.'],{w:'#ffffff',d:'#bcdafa'},x,y,w);
}
function voxel(p,x,y,rx,ry,depth,colors){
  p.poly([[x-rx,y],[x,y+ry],[x,y+ry+depth],[x-rx,y+depth]],colors[1]);
  p.poly([[x+rx,y],[x,y+ry],[x,y+ry+depth],[x+rx,y+depth]],colors[2]);
  p.poly([[x,y-ry],[x+rx,y],[x,y+ry],[x-rx,y]],colors[0]);
}
function hero(p){
  const {c,rect,poly,sprite}=p;
  cloud(p,17,40);cloud(p,206,15);cloud(p,161,8);cloud(p,225,73);
  sprite(shine,{a:'#a1bfe9'},43,13);sprite(shine,{a:'#99bdea'},192,99);sprite(shine,{a:'#fff'},79,2);
  // Soft floating shadow made of nested diamonds.
  poly([[45,107],[130,71],[202,100],[118,136]],'#bfd8f4');
  poly([[51,106],[128,74],[194,100],[117,131]],'#b5d1ef');
  const sx=126, sy=38, rx=15,ry=7;
  const rock=['#6c5075','#a47969','#775e70'];
  const greens=['#96d889','#79b163','#538e69'];
  for(let j=0;j<5;j++)for(let i=0;i<5;i++){
    const x=sx+(i-j)*rx,y=sy+(i+j)*ry;
    const path=(i===1&&j>=2)||(j===2&&i>=1&&i<=3)||(i===3&&j<=2);
    voxel(p,x,y+3,rx,ry,10,rock);
    if(i===4 || j===4) {
      rect(x-(j===4?10:-7),y+12,3,2,'#b58a72');
      rect(x+(i===4?3:-5),y+14,2,2,'#85657a');
    }
    const gr=(i+j)%3===0?'#a0db86':(i+j)%3===1?'#94d37d':'#9dd885';
    voxel(p,x,y,rx,ry,4,path?['#f9da96','#d8b879','#c8ab73']:[gr,greens[1],greens[2]]);
    if(path) { rect(x-6,y,2,1,'#e0bc80'); rect(x+4,y+2,2,1,'#fff0b3'); }
    else {rect(x-8,y,2,1,'#77b86e'); rect(x+5,y,2,1,'#b5e798');}
  }
  function tree(x,y,scale){
    c.save(); c.translate(x,y); c.scale(scale,scale);
    voxel(p,0,-2,3,2,10,['#b78665','#96705a','#71566a']);
    voxel(p,0,-11,11,5,10,['#a3dfa4','#63ae83','#418f76']);
    voxel(p,-2,-17,8,4,7,['#b7e8a2','#77be89','#55a37d']);
    rect(-7,-17,4,1,'#d0efa6');c.restore();
  }
  tree(125,33,1); tree(113,39,.68);tree(164,55,.74);
  // A flag and a floating star mark the destination.
  rect(176,30,2,33,'#805f71'); rect(178,31,12,7,'#ffae45');rect(187,37,5,3,'#f07b39'); rect(178,31,10,2,'#ffda68');
  sprite(star,{a:'#dc8e33',b:'#ffe365'},153,43);rect(156,46,2,1,'#fff3b3');
  for (const [x,y] of [[100,80],[117,72],[131,66],[143,59]]) {
    poly([[x-4,y],[x,y-2],[x+5,y],[x+1,y+2]],'#f2ab4e');
  }
  poly([[65,77],[83,69],[103,77],[84,85]],'#77a774');
  sprite(robot,botColors,67,35,2);
  [[96,95],[102,97],[158,78],[133,91],[65,65]].forEach(([x,y],i)=>{
    rect(x,y,1,4,'#539372');rect(x-1,y,3,2,i%2?'#ffdb64':'#fffbea');rect(x,y,1,1,'#ee9f42');
  });
  voxel(p,208,83,10,5,7,rock);voxel(p,208,82,10,5,3,greens);tree(209,75,.45);
  voxel(p,43,76,7,3,5,rock);voxel(p,43,75,7,3,2,greens);
  sprite(shine,{a:'#ffbc4f'},55,40);sprite(shine,{a:'#ffffff'},203,44);
}
function smallArt(p,kind){
  const {rect,poly,sprite}=p;
  const style = {code:['#4566c6','#91b7ef','#f9faff'],image:['#70559e','#c4abe5','#fff8fe'],video:['#2e796a','#96cbb8','#fafcf1']}[kind];
  const [ink,shade,paper]=style;
  for(const [x,y] of [[31,23],[161,16],[151,48],[50,47]])sprite(shine,{a:shade},x,y);
  rect(57,13,4,1,shade);rect(59,11,1,4,shade);
  const shadow=(x,y,w)=>{rect(x+3,y,w-6,1,shade);rect(x,y+1,w,2,shade);rect(x+3,y+3,w-6,1,shade);};
  function frame(x,y,w,h,color,fill) {
    rect(x+2,y,w-4,h,color);rect(x,y+2,w,h-4,color);rect(x+2,y+2,w-4,h-4,fill);
  }
  if(kind==='code'){
    shadow(57,50,75);
    frame(63,9,60,40,ink,'#f5f8ff');rect(65,11,56,7,'#769df1');
    [68,72,76].forEach(x=>rect(x,13,2,2,'#f8fcff'));
    rect(66,19,54,1,'#b2c5ee');
    function block(x,y,w,color,bright){rect(x,y,w,6,color);rect(x+4,y+5,6,3,color);rect(x+2,y+1,w-4,1,bright);rect(x+4,y+3,w/2,1,'#f5f9ff');}
    block(71,23,31,'#6288e7','#a8bff6');block(76,30,31,'#64b5a1','#a0d6b6');block(76,37,22,'#e6a24d','#f7c462');
    poly([[116,35],[116,54],[121,49],[125,55],[129,52],[125,46],[132,45]],'#344578');
    poly([[118,39],[118,49],[121,46],[126,52],[127,51],[123,45],[127,44]],'#ffe49a');
  } else if(kind==='image'){
    shadow(61,50,73);
    frame(62,14,58,35,'#a685c6','#cdb6e5');frame(66,11,58,35,ink,paper);
    rect(70,15,50,26,'#c5dcf4');rect(75,18,5,5,'#ffcb6e');
    poly([[70,37],[85,24],[101,37],[111,29],[120,35],[120,41],[70,41]],'#8cc5a5');
    poly([[70,40],[83,32],[90,36],[99,27],[115,41],[70,41]],'#649d94');
    poly([[98,45],[99,38],[122,13],[128,10],[131,13],[129,19],[106,44]],'#674e81');
    poly([[100,41],[101,37],[122,16],[126,18],[105,41]],'#ffcb72');
    poly([[102,40],[104,42],[125,20],[124,18]],'#ed9561');
    poly([[99,44],[101,38],[105,42]],'#fff2b4');rect(98,44,2,2,ink);
    sprite(shine,{a:'#faf4ff'},130,25);
  } else {
    shadow(64,50,69);frame(68,19,53,29,ink,'#519e90');rect(71,24,47,21,'#67b4a4');
    poly([[67,16],[117,6],[120,15],[69,25]],'#304b56');
    [[72,15],[84,13],[96,10],[108,8]].forEach(([x,y])=>poly([[x,y],[x+6,y-1],[x+2,y+7],[x-4,y+8]],'#fff4d6'));
    rect(70,22,4,3,'#ffdb7d');poly([[90,26],[90,40],[104,33]],'#306f68');poly([[91,26],[91,38],[101,32]],'#fff3cf');
    sprite(['....ww....','..wwwwww..','.ww....ww.','ww..ww..ww','ww..ww..ww','.ww....ww.','..wwwwww..','....ww....'],{w:'#e9a660'},117,37);
  }
}
export function drawArt(canvas,kind){
  if(kind==='hero')hero(painter(canvas,246,135));
  else if(kind==='bot'){const p=painter(canvas,22,22);p.sprite(robot,botColors,0,0);}
  else smallArt(painter(canvas,192,60),kind);
}
