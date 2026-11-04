const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts', 'v17');
fs.mkdirSync(out, {recursive:true});
// A real PCM file, with independent spectral bands and amplitude envelopes.
const rate=44100,seconds=18, samples=rate*seconds;
const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
const frequencies=[45,80,140,220,350,600,1000,1800,3200,7000];
for(let i=0;i<samples;i++){const t=i/rate;let v=0;for(let j=0;j<10;j++){const pulse=Math.exp(-((t*2.2+j*.19)%1)*10);v+=Math.sin(2*Math.PI*frequencies[j]*t)*(.009+.04*pulse)*(.6+.4*Math.sin(t*.7+j));}wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2);}
fs.writeFileSync('/tmp/vj-test.wav',wav);
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream']});
const context=await browser.newContext({viewport:{width:1268,height:540},permissions:['microphone']});
const page=await context.newPage();const errors=[], checks=[], samplesLog=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
// Deterministic randomness for reproducing this test's graph lineage only.
await page.addInitScript(()=>{let seed=731031;Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};});
const snapshot=()=>page.evaluate(()=>vj.snapshot());
const pixels=()=>page.evaluate(()=>{const c=document.querySelector('#view'),g=c.getContext('webgl2');const p=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,p);let lit=0,white=0,mean=0;for(let i=0;i<p.length;i+=4){const v=(p[i]+p[i+1]+p[i+2])/765;lit+=v>.035;white+=v>.92;mean+=v;}return {lit:lit/(p.length/4),white:white/(p.length/4),mean:mean/(p.length/4)};});
function pass(name,data){checks.push({name,status:'passed',...data});console.log('PASS',name,JSON.stringify(data||{}));}
try{
await page.goto(process.env.VJ_URL||'http://127.0.0.1:8787');await page.selectOption('#quality','480');await page.waitForTimeout(1000);let s=await snapshot();assert.equal(s.compileCount,1);assert.equal(s.glError,0);assert.equal(s.contextLost,false);assert.equal(s.compileErrors.length,0);pass('HTML + WebGL2 compile/link');assert((await pixels()).lit<.001);pass('Silence blacks out');
await page.click('#demo');await page.waitForTimeout(1800);assert((await snapshot()).bands.some(x=>x>.1));assert((await pixels()).lit>.015);pass('Demo produces analyzed bands and visible pixels');
await page.locator('#file').setInputFiles('/tmp/vj-test.wav');await page.waitForFunction(()=>{const p=document.querySelector('#player');return !p.paused&&p.currentTime>.5;});await page.evaluate(()=>document.querySelector('#player').loop=true);let before=await page.locator('#player').evaluate(p=>p.currentTime);await page.waitForTimeout(800);assert(await page.locator('#player').evaluate(p=>p.currentTime)>before);s=await snapshot();assert.equal(s.audioState,'running');assert(s.bands.every(x=>x>.0005));assert(s.bands.every(x=>x<.98));pass('PCM music playback + time + 10 AGC bands',{bands:s.bands});
await page.locator('#player').evaluate(p=>p.currentTime=8);await page.waitForTimeout(400);assert(await page.locator('#player').evaluate(p=>p.currentTime)>=8);await page.locator('#player').evaluate(p=>p.pause());const paused=await page.locator('#player').evaluate(p=>p.currentTime);await page.waitForTimeout(300);assert.equal(await page.locator('#player').evaluate(p=>p.currentTime),paused);await page.locator('#player').evaluate(p=>p.play());pass('Seek + pause + resume');
await page.locator('#volume').evaluate(e=>{e.value=0;e.dispatchEvent(new Event('input'));});await page.waitForTimeout(500);s=await snapshot();assert.equal(s.outputGain,0);assert(s.volume>.005);assert(s.bands.some(x=>x>.1));pass('Output gain independent from analysis');await page.locator('#volume').evaluate(e=>{e.value=80;e.dispatchEvent(new Event('input'));});
await page.click('#mic');await page.waitForFunction(()=>vj.snapshot().micOn);s=await snapshot();assert(s.micTracks.every(x=>x==='live'));assert(await page.locator('#player').evaluate(p=>p.paused));await page.waitForTimeout(500);pass('Virtual microphone ON + player pause',{volume:(await snapshot()).volume});await page.click('#mic');s=await snapshot();assert.equal(s.micOn,false);assert.equal(s.micTracks.length,0);pass('Microphone OFF stops tracks');
await page.click('#full');await page.waitForFunction(()=>document.fullscreenElement!==null);await page.evaluate(()=>document.exitFullscreen());pass('Fullscreen enters and exits');
await page.click('#demo');await page.locator('#change').evaluate(e=>e.value=0);
await page.waitForFunction(()=>!vj.snapshot().pending);await page.waitForTimeout(400);
const pre=await snapshot();const prePixels=await pixels();await page.click('#mutate');
await page.waitForFunction(()=>vj.snapshot().pending);
const candidate=await snapshot();assert.equal(candidate.manualMutationClicks,pre.manualMutationClicks+1);assert.notEqual(candidate.materialTarget.hue,pre.materialTarget.hue);assert((await page.locator('#mutationState').innerText()).includes('変容'));assert.notEqual(candidate.candidate.render.main,pre.graph.render.main);assert.notEqual(candidate.candidate.composition.layout,pre.graph.composition.layout);
await page.locator('#view').screenshot({path:path.join(out,'mutation-immediate.png')});
const continuity=[];let previousProgress=0;
while((await snapshot()).pending){const st=await snapshot();const px=await pixels();assert(st.transition>=previousProgress);previousProgress=st.transition;continuity.push({progress:st.transition,...px});await page.waitForTimeout(350);}
const post=await snapshot();const postPixels=await pixels();await page.locator('#view').screenshot({path:path.join(out,'mutation-completed.png')});
assert.notEqual(pre.shaderVersion,post.shaderVersion);assert(postPixels.lit>.005);
assert(continuity.some(x=>x.progress>.2&&x.progress<.8));
assert(continuity.every(x=>x.mean>Math.min(prePixels.mean,postPixels.mean)*.15),'unexpected blackout during morph');
assert(post.stateSteps>pre.stateSteps);assert(post.feedbackFrames>pre.feedbackFrames);
pass('Forced meta mutation changes renderer + composition + compiled source');
pass('Continuous morph without a black switching frame',{samples:continuity});
pass('Reaction state and feedback history survive renderer mutation',{steps:[pre.stateSteps,post.stateSteps],historyPreservations:post.historyPreservations});
await page.locator('#change').evaluate(e=>e.value=70);
const initial=await snapshot();samplesLog.push({label:'start',snapshot:initial,pixels:await pixels()});
await page.locator('#view').screenshot({path:path.join(out,'00-start.png')});const started=Date.now();
for(const target of [20,40]){while(Date.now()-started<target*1000)await page.waitForTimeout(Math.min(1000,target*1000-(Date.now()-started)));s=await snapshot();samplesLog.push({label:target+'s',snapshot:s,pixels:await pixels()});await page.locator('#view').screenshot({path:path.join(out,`${target}-seconds.png`)});assert(s.generation>initial.generation||s.pending);assert.equal(s.compileErrors.length,0);assert.equal(s.glError,0);console.log('EVOLUTION',target,s.generation,s.graph.render.main,s.graph.composition.layout,s.fps,s.width,s.height);}
const methods=new Set(samplesLog.flatMap(x=>[x.snapshot.graph.render.main,x.snapshot.candidate?.render.main].filter(Boolean)));
assert(methods.size>=2,'rendering approach did not evolve');
pass('40 seconds autonomous renderer / graph evolution',{methods:[...methods],fps:samplesLog.map(x=>x.snapshot.fps)});
assert.notDeepEqual(initial.route,samplesLog.at(-1).snapshot.route);pass('10-band routing evolves');
assert(samplesLog.at(-1).snapshot.materialChanges>0);assert(samplesLog.at(-1).snapshot.cameraChanges>0);pass('Independent material and camera schedules');
await page.click('#demo');await page.waitForTimeout(2000);assert((await pixels()).lit<.001);pass('Stopping input returns to black');assert.deepEqual(errors,[]);assert.deepEqual((await snapshot()).compileErrors,[]);pass('No browser JS / console / WebGL errors');
}catch(e){checks.push({name:'test failure',status:'failed',message:e.stack});console.error(e);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
const final=await snapshot().catch(()=>null);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({date:new Date().toISOString(),renderer:'Chromium / ANGLE SwiftShader (software GPU)',checks,errors,samples:samplesLog,final},null,2));await browser.close();
})();
