/* Self-Driving Car Sim - ray-cast sensors + pure-pursuit autopilot */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const cv=$('#cv'),g=cv.getContext('2d');
const W=cv.width,H=cv.height;

// ---- track: closed loop centerline via superposition of sines ----
let track=null;
function genTrack(seed){
  const rand=(()=>{let s=seed;return()=>{s=(s*16807)%2147483647;return s/2147483647;};})();
  const a1=60+rand()*50,a2=30+rand()*40,p1=rand()*6.28,p2=rand()*6.28,a3=10+rand()*20,p3=rand()*6.28;
  const cx=W/2,cy=H/2,base=Math.min(W,H)/2-70;
  const pts=[];
  for(let i=0;i<200;i++){
    const t=i/200*Math.PI*2;
    const r=base+a1*Math.sin(t*2+p1)+a2*Math.sin(t*3+p2)+a3*Math.sin(t*5+p3);
    pts.push([cx+Math.cos(t)*r,cy+Math.sin(t)*r*0.8]);
  }
  const half=34; // half road width
  return {pts,half};
}
function closestPt(x,y){
  let bi=0,bd=1e18;
  for(let i=0;i<track.pts.length;i++){const dx=track.pts[i][0]-x,dy=track.pts[i][1]-y;const d=dx*dx+dy*dy;if(d<bd){bd=d;bi=i;}}
  return {i:bi,d:Math.sqrt(bd)};
}
function aheadIdx(i,k){return (i+k)%track.pts.length;}

// ---- car ----
let car,auto=true,showRays=true,crashes=0,lapStart=null,bestLap=null,lastLap=null,lapCount=0;
function resetCar(){
  const p=track.pts[0],q=track.pts[2];
  car={x:p[0],y:p[1],heading:Math.atan2(q[1]-p[1],q[0]-p[0]),speed:0};
  lapStart=performance.now();
}
function raycast(x,y,ang,maxLen=160){
  const dx=Math.cos(ang),dy=Math.sin(ang);
  for(let d=8;d<maxLen;d+=4){
    const px=x+dx*d,py=y+dy*d;
    const c=closestPt(px,py);
    if(c.d>track.half)return d;
  }
  return maxLen;
}
function sensors(){
  const angs=[-Math.PI/3,-Math.PI/6,0,Math.PI/6,Math.PI/3];
  return angs.map(a=>({a,d:raycast(car.x,car.y,car.heading+a)}));
}
function autopilot(){
  // pure pursuit: aim at a centerline point ahead proportional to speed
  const c=closestPt(car.x,car.y);
  const look=Math.max(4,Math.round(car.speed*1.2)+4);
  const tgt=track.pts[aheadIdx(c.i,look)];
  const want=Math.atan2(tgt[1]-car.y,tgt[0]-car.x);
  let dh=want-car.heading;
  while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
  const steer=Math.max(-0.6,Math.min(0.6,dh*1.4));
  // throttle from clearance + upcoming curvature
  const ahead=track.pts[aheadIdx(c.i,18)],ahead2=track.pts[aheadIdx(c.i,36)];
  const curv=Math.abs(Math.atan2(ahead2[1]-ahead[1],ahead2[0]-ahead[0])-Math.atan2(ahead[1]-car.y,ahead[0]-car.x));
  const sen=sensors();const front=sen[2].d;
  const targetSpeed=Math.max(1.6,Math.min(6,front/40-curv*4));
  return {steer,throttle:car.speed<targetSpeed?0.25:-0.35};
}
const keys={};
document.addEventListener('keydown',e=>{keys[e.key]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();});
document.addEventListener('keyup',e=>keys[e.key]=false);
function manual(){
  let steer=0,throttle=0;
  if(keys.ArrowLeft)steer=-0.55;if(keys.ArrowRight)steer=0.55;
  if(keys.ArrowUp)throttle=0.25;if(keys.ArrowDown)throttle=-0.3;
  return {steer,throttle};
}
function step(){
  const ctl=auto?autopilot():manual();
  car.heading+=ctl.steer*Math.min(1,car.speed/2+0.2)*0.9;
  car.speed+=ctl.throttle;
  car.speed*=0.985;
  car.speed=Math.max(0,Math.min(7,car.speed));
  car.x+=Math.cos(car.heading)*car.speed;
  car.y+=Math.sin(car.heading)*car.speed;
  // crash?
  const c=closestPt(car.x,car.y);
  if(c.d>track.half-6){crashes++;resetCar();}
  // lap: pass start line region
  if(c.i<4&&car.speed>0&&lapStart&&performance.now()-lapStart>8000){
    lastLap=(performance.now()-lapStart)/1000;lapCount++;
    if(!bestLap||lastLap<bestLap)bestLap=lastLap;
    lapStart=performance.now();
  }
}
function draw(){
  g.clearRect(0,0,W,H);
  const dark=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#0f172a';
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#0c4a6e';
  // road
  g.lineCap='round';g.lineJoin='round';
  g.strokeStyle='rgba(128,128,128,.35)';g.lineWidth=track.half*2;
  g.beginPath();track.pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.stroke();
  g.strokeStyle=dark;g.lineWidth=1.5;g.setLineDash([8,10]);
  g.beginPath();track.pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.stroke();
  g.setLineDash([]);
  // start line
  const s0=track.pts[0],s1=track.pts[4];
  g.strokeStyle='#0e9f6e';g.lineWidth=4;
  g.beginPath();g.moveTo(s0[0],s0[1]);g.lineTo(s1[0],s1[1]);g.stroke();
  // sensor rays
  const sen=sensors();
  if(showRays){
    for(const r of sen){
      const a=car.heading+r.a;
      g.strokeStyle='rgba(220,38,38,.4)';g.lineWidth=1;
      g.beginPath();g.moveTo(car.x,car.y);g.lineTo(car.x+Math.cos(a)*r.d,car.y+Math.sin(a)*r.d);g.stroke();
    }
  }
  // car
  g.save();g.translate(car.x,car.y);g.rotate(car.heading);
  g.fillStyle=accent;
  g.beginPath();g.roundRect(-14,-8,28,16,4);g.fill();
  g.fillStyle='rgba(255,255,255,.85)';g.fillRect(4,-6,7,12);
  g.restore();
}
function kpiRender(){
  $('#kpis').innerHTML=[
    ['Speed',(car.speed*20).toFixed(0)+' km/h'],['Mode',auto?'Autopilot':'Manual'],
    ['Laps',lapCount],['Best lap',bestLap?bestLap.toFixed(1)+'s':'-'],['Crashes',crashes]
  ].map(([l,v])=>`<div class="card kpi"><div class="small muted">${l}</div><div class="kpi-val" style="font-size:1.1rem">${v}</div></div>`).join('');
}
let running=true,frames=0;
function loop(){
  if(!running)return;
  step();draw();
  if(++frames%20===0)kpiRender();
  requestAnimationFrame(loop);
}
$('#btnAuto').addEventListener('click',()=>{auto=!auto;$('#btnAuto').textContent=auto?'Autopilot: on':'Autopilot: off (arrow keys)';});
$('#btnTrack').addEventListener('click',()=>{track=genTrack(Math.floor(Math.random()*1e9));crashes=0;lapCount=0;bestLap=null;resetCar();});
$('#optRays').addEventListener('change',e=>showRays=e.target.checked);

track=genTrack(42);resetCar();kpiRender();loop();

window._test={
  state:()=>({x:car.x,y:car.y,speed:car.speed,crashes,laps:lapCount,bestLap}),
  sensors,auto:(v)=>{auto=v;},stepN:n=>{for(let i=0;i<n;i++)step();},
  newTrack:seed=>{track=genTrack(seed);resetCar();},
  dist:()=>closestPt(car.x,car.y).d};
})();
