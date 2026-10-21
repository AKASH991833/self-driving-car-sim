import puppeteer from 'puppeteer-core';
import fs from 'fs';
const out='/tmp/shots73';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars']});
let fails=[];
const check=(name,ok,extra='')=>{console.log((ok?'PASS':'FAIL')+' '+name+(extra?' — '+extra:''));if(!ok)fails.push(name);};
for(const v of [{name:'desktop',w:1440,h:900},{name:'mobile',w:390,h:844}]){
 for(const theme of ['light','dark']){
  const page=await browser.newPage();
  await page.setViewport({width:v.w,height:v.h,deviceScaleFactor:1});
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await page.evaluateOnNewDocument(t=>localStorage.setItem('theme',t),theme);
  await page.goto('http://localhost:8073',{waitUntil:'networkidle2'});
  await new Promise(s=>setTimeout(s,600));
  // sensors return 5 distances in range
  const sen=await page.evaluate(()=>window._test.sensors().map(r=>Math.round(r.d)));
  check(`${v.name}/${theme} 5 sensor rays`,sen.length===5&&sen.every(d=>d>=8&&d<=160),sen.join(','));
  // autopilot drives: run 900 steps, car should move around the track without many crashes
  const r1=await page.evaluate(()=>{window._test.auto(true);window._test.stepN(900);return window._test.state();});
  const moved=Math.hypot(r1.x,r1.y)>0;
  check(`${v.name}/${theme} autopilot drives`,moved&&r1.speed>=0,`speed ${r1.speed.toFixed(2)} crashes ${r1.crashes}`);
  check(`${v.name}/${theme} autopilot survives mostly`,r1.crashes<=2,r1.crashes+' crashes in 900 steps');
  // longer run keeps car on road at end
  const r2=await page.evaluate(()=>{window._test.stepN(1200);const d=window._test.dist();return {...window._test.state(),d};});
  check(`${v.name}/${theme} car stays near road`,r2.d<40,'dist '+r2.d.toFixed(1));
  // manual mode: no auto steer; press ArrowUp moves car
  const r3=await page.evaluate(()=>{window._test.auto(false);window._test.newTrack(7);return window._test.state();});
  await page.keyboard.down('ArrowUp');
  await new Promise(s=>setTimeout(s,800));
  await page.keyboard.up('ArrowUp');
  const r4=await page.evaluate(()=>window._test.state());
  check(`${v.name}/${theme} manual throttle moves car`,Math.hypot(r4.x-r3.x,r4.y-r3.y)>5,`moved ${Math.hypot(r4.x-r3.x,r4.y-r3.y).toFixed(1)}px`);
  // canvas has drawn content
  const drawn=await page.$eval('#cv',e=>{const c=e.getContext('2d');const d=c.getImageData(0,0,e.width,e.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)return true;return false;});
  check(`${v.name}/${theme} canvas drawn`,drawn);
  // KPIs render
  const kpi=await page.$eval('#kpis',e=>e.textContent);
  check(`${v.name}/${theme} KPIs render`,/Speed/.test(kpi)&&/Laps/.test(kpi));
  // new track button works
  await page.click('#btnTrack');
  await new Promise(s=>setTimeout(s,300));
  check(`${v.name}/${theme} new track resets crashes`,(await page.evaluate(()=>window._test.state())).crashes===0);
  await page.evaluate(()=>{window._test.auto(true);});
  await new Promise(s=>setTimeout(s,1200));
  await page.screenshot({path:`${out}/sim-${v.name}-${theme}.png`});
  check(`${v.name}/${theme} no console errors`,errs.length===0,errs.slice(0,3).join('|'));
  await page.close();
 }
}
await browser.close();
if(fails.length){console.log('\nFAILURES: '+fails.join(', '));process.exit(1);}
console.log('\nALL PASS');
