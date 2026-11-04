const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/v17');fs.mkdirSync(out,{recursive:true});
const url=process.env.VJ_URL||'http://127.0.0.1:8787';
// Real PCM audio with spectral transients, independent of the demo generator.
const rate=44100,n=rate*12,wav=Buffer.alloc(44+n*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
const frequencies=[45,80,140,220,350,600,1000,1800,3200,7000];
for(let i=0;i<n;i++){let v=0,t=i/rate;for(let j=0;j<10;j++)v+=Math.sin(t*frequencies[j]*Math.PI*2)*(.01+.045*Math.exp(-((t*2.3+j*.17)%1)*9));wav.writeInt16LE(Math.round(v*32767),44+i*2);}fs.writeFileSync('/tmp/vj-v15.wav',wav);
const launch={executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--autoplay-policy=user-gesture-required']};
(async()=>{
 const browser=await chromium.launch(launch),checks=[],errors=[];
 const pass=(name,data={})=>{checks.push({name,status:'passed',...data});console.log('PASS',name,JSON.stringify(data));};
 let context=await browser.newContext({viewport:{width:1268,height:720},permissions:['microphone']});let page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const connect=AudioNode.prototype.connect;window.__destinations=[];
  AudioNode.prototype.connect=function(destination,...args){
   const result=connect.call(this,destination,...args);
   if(destination instanceof AudioDestinationNode){
    const tap=this.context.createAnalyser();tap.fftSize=1024;const silence=this.context.createGain();silence.gain.value=0;
    connect.call(this,tap);connect.call(tap,silence);connect.call(silence,this.context.destination);
    window.__destinations.push({node:this,type:this.constructor.name,tap});
   }
   return result;
  };
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__gumCalls=0;window.__streams=[];
  navigator.mediaDevices.getUserMedia=(...args)=>{window.__gumCalls++;return gum(...args).then(s=>{window.__streams.push(s);return s;});};
 });
 const snap=()=>page.evaluate(()=>vj.snapshot());
 const destinationRms=()=>page.evaluate(()=>Math.max(0,...window.__destinations.filter(x=>x.type==='AnalyserNode').map(({tap})=>{const d=new Float32Array(tap.fftSize);tap.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((s,v)=>s+v*v,0)/d.length);}))); 
 try{
  await page.goto(url);await page.selectOption('#quality','480');await page.locator('#change').evaluate(e=>e.value=0);
  await page.locator('#file').setInputFiles('/tmp/vj-v15.wav');await page.waitForFunction(()=>vj.snapshot().sourceMode==='file'&&vj.snapshot().audioState==='running'&&vj.snapshot().outputRms>.002);
  await page.locator('#player').evaluate(p=>p.loop=true);
  const t=await page.locator('#player').evaluate(p=>p.currentTime);await page.waitForTimeout(600);assert(await page.locator('#player').evaluate(p=>p.currentTime)>t);
  const rms=await destinationRms();assert(rms>.005);const connections=await page.evaluate(()=>window.__destinations.map(x=>({type:x.type,gain:x.node.gain?.value})));
  assert(connections.some(x=>x.type==='AnalyserNode'));assert(connections.some(x=>x.type==='GainNode'&&x.gain===0));
  pass('WAV playback reaches actual browser destination input with nonzero PCM',{rms,connections,limitation:'No physical audio device / acoustic listening available'});
  let s=await snap();assert(s.bands.every(v=>v>.0001&&v<.98));assert.equal(s.audioInitializations,1);assert.equal(s.mediaSourceCreations,1);pass('10 AGC bands + single context and media source',{bands:s.bands});
  await page.locator('#volume').evaluate(e=>{e.value=0;e.dispatchEvent(new Event('input'));});await page.waitForTimeout(500);assert((await destinationRms())<.000001);assert((await snap()).volume>.005);pass('Gain zero silences destination while analysis remains live');
  await page.locator('#volume').evaluate(e=>{e.value=80;e.dispatchEvent(new Event('input'));});await page.waitForTimeout(300);assert(await destinationRms()>.005);
  await page.locator('#player').evaluate(p=>{p.currentTime=6;p.pause();});await page.waitForTimeout(200);const paused=await page.locator('#player').evaluate(p=>p.currentTime);await page.waitForTimeout(250);assert.equal(await page.locator('#player').evaluate(p=>p.currentTime),paused);
  await page.click('#enableAudio');await page.waitForFunction(()=>vj.snapshot().outputRms>.003);pass('Seek / pause / explicit resume restores destination PCM');
  await page.click('#mic');await page.waitForFunction(()=>vj.snapshot().micState==='on');assert(await page.locator('#player').evaluate(p=>p.paused));await page.waitForTimeout(300);assert(await destinationRms()<.000001);assert((await snap()).volume>.001);pass('Browser virtual microphone permission → ON / analysis / no speaker loopback',{kind:'Chromium fake input device, not physical mic'});
  await page.locator('body').evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');assert.equal((await snap()).micState,'off');assert(await page.evaluate(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));pass('Space OFF synchronizes UI and stops all tracks');
  const calls=await page.evaluate(()=>window.__gumCalls);
  await page.evaluate(()=>{for(let i=0;i<5;i++)document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>vj.snapshot().micState==='on');assert.equal(await page.evaluate(()=>window.__gumCalls),calls+1);assert.equal(await page.locator('#mic').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',repeat:true,bubbles:true,cancelable:true})));assert.equal((await snap()).micState,'on');pass('Rapid Space ON/OFF/ON reuses one permission request; repeats ignored');
  await page.evaluate(()=>{const t=document.createElement('input');t.id='typing';t.type='text';document.body.append(t);t.focus();});await page.keyboard.press('Space');assert.equal(await page.locator('#typing').inputValue(),' ');assert.equal((await snap()).micState,'on');await page.locator('#typing').evaluate(e=>e.remove());pass('Text editing preserves Space and microphone state');
  await page.click('#mic');await page.click('#enableAudio');await page.waitForFunction(()=>vj.snapshot().outputRms>.003);s=await snap();assert.equal(s.mediaSourceCreations,1);pass('File → microphone → file retains nonzero destination PCM');
  await page.locator('#file').setInputFiles('/tmp/vj-v15.wav');await page.waitForFunction(()=>vj.snapshot().outputRms>.003);assert.equal((await snap()).mediaSourceCreations,1);pass('Repeated file loads do not recreate MediaElementAudioSourceNode');
  await page.screenshot({path:path.join(out,'audio-diagnostics.png')});
  assert.deepEqual(errors,[]);pass('No unhandled browser exceptions in real audio-path tests');
 }catch(e){errors.push(e.stack);console.error(e);process.exitCode=1;await page.screenshot({path:path.join(out,'audio-failure.png')}).catch(()=>{});}
 await context.close();
 // Browser-level denial; grant camera only so other permissions are denied.
 try{
  context=await browser.newContext({permissions:['camera']});page=await context.newPage();await page.goto(url);
  const permission=await page.evaluate(async()=> (await navigator.permissions.query({name:'microphone'})).state);assert.equal(permission,'denied');
  await page.locator('#file').setInputFiles('/tmp/vj-v15.wav');await page.waitForFunction(()=>vj.snapshot().outputRms>.003);await page.click('#mic');await page.waitForFunction(()=>vj.snapshot().micState==='denied');assert.equal((await page.evaluate(()=>vj.snapshot())).sourceMode,'file');assert((await page.evaluate(()=>vj.snapshot())).outputRms>.003);assert((await page.locator('#micStatus').innerText()).includes('サイト設定'));assert.equal((await page.evaluate(()=>vj.snapshot())).micOn,false);pass('Actual browser permission denial maps to denied with site-settings instructions');
 }catch(e){errors.push(e.stack);console.error(e);process.exitCode=1;}finally{await context.close();}
 async function fault(name,init,run){
  const ctx=await browser.newContext({permissions:['microphone']});const p=await ctx.newPage();
  try{await p.addInitScript(init);await p.goto(url);await p.locator('#change').evaluate(e=>e.value=0);await run(p);pass(name,{kind:'Controlled fault injection; not a physical-device success test'});}catch(e){errors.push(e.stack);console.error(name,e);process.exitCode=1;}finally{await ctx.close();}
 }
 await fault('NotFoundError → missing device with recovery help',()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('No device','NotFoundError'));},async p=>{await p.click('#mic');await p.waitForFunction(()=>vj.snapshot().micState==='missing');assert((await p.locator('#micStatus').innerText()).includes('接続'));});
 await fault('Busy device → explicit error',()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Busy','NotReadableError'));},async p=>{await p.click('#mic');await p.waitForFunction(()=>vj.snapshot().micState==='error');assert((await p.locator('#micStatus').innerText()).includes('占有'));});
 await fault('Insecure environment rejected before capture',()=>{Object.defineProperty(window,'isSecureContext',{value:false});},async p=>{await p.click('#mic');await p.waitForFunction(()=>vj.snapshot().micState==='error');assert((await p.locator('#micStatus').innerText()).includes('HTTPS'));});
 await fault('Unanswered permission expires visibly; retry does not duplicate GUM',()=>{window.__calls=0;navigator.mediaDevices.getUserMedia=()=>{window.__calls++;return new Promise(()=>{});};},async p=>{await p.clock.install();await p.click('#mic');await p.waitForFunction(()=>vj.snapshot().micState==='requesting');await p.clock.fastForward(15100);assert.equal((await p.evaluate(()=>vj.snapshot())).micState,'error');assert((await p.locator('#micStatus').innerText()).includes('未完了'));await p.click('#mic');assert.equal(await p.evaluate(()=>window.__calls),1);await p.click('#mic');assert.equal((await p.evaluate(()=>vj.snapshot())).micState,'off');});
 await fault('Late permission after cancellation stops stream without going ON',()=>{const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.__resolve=resolve);window.__lateGrant=async()=>{window.__lateStream=await native({audio:true});window.__resolve(window.__lateStream);};},async p=>{await p.click('#mic');await p.waitForFunction(()=>vj.snapshot().micState==='requesting');await p.click('#mic');await p.evaluate(()=>window.__lateGrant());await p.waitForFunction(()=>window.__lateStream.getTracks().every(t=>t.readyState==='ended'));assert.equal((await p.evaluate(()=>vj.snapshot())).micState,'off');assert.equal((await p.evaluate(()=>vj.snapshot())).micNodeCreations,0);});
 await fault('Stalled resume does not prevent GUM call; stream stops on resume error',()=>{const Native=window.AudioContext;const ctx=new Native();Object.defineProperty(ctx,'state',{get:()=> 'suspended'});ctx.resume=()=>new Promise(()=>{});window.AudioContext=function(){return ctx;};const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__calls=0;navigator.mediaDevices.getUserMedia=(...args)=>{window.__calls++;return native(...args).then(s=>{window.__captured=s;return s;});};},async p=>{await p.clock.install();await p.click('#mic');await p.waitForFunction(()=>window.__calls===1&&window.__captured);await p.clock.fastForward(6100);await p.waitForFunction(()=>vj.snapshot().micState==='error');assert(await p.evaluate(()=>window.__captured.getTracks().every(t=>t.readyState==='ended')));assert((await p.locator('#micStatus').innerText()).includes('音声'));});
 await fault('play() policy rejection → explicit gesture recovery instructions',()=>{HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError'));},async p=>{await p.locator('#file').setInputFiles('/tmp/vj-v15.wav');await p.waitForFunction(()=>document.querySelector('#audioState').textContent.includes('再生をブロック'));});
 await fault('Unresolved play() has a bounded visible error',()=>{HTMLMediaElement.prototype.play=()=>new Promise(()=>{});},async p=>{await p.clock.install();await p.locator('#file').setInputFiles('/tmp/vj-v15.wav');await p.clock.fastForward(8100);assert((await p.locator('#audioState').innerText()).includes('未完了'));});
 await fault('Unsupported / corrupt WAV reports actual decoder failure',()=>{},async p=>{await p.locator('#file').setInputFiles({name:'invalid.wav',mimeType:'audio/wav',buffer:Buffer.from('invalid PCM data')});await p.waitForFunction(()=>document.querySelector('#player').error!==null);assert((await p.locator('#audioState').innerText()).match(/形式|デコード|再生できません/));});
 await fault('Explicit gesture retries a pending resume before the old timeout',()=>{const Native=window.AudioContext,ctx=new Native();let running=false;window.__resumeCalls=0;Object.defineProperty(ctx,'state',{get:()=>running?'running':'suspended'});ctx.resume=()=>{window.__resumeCalls++;if(window.__resumeCalls===1)return new Promise(()=>{});running=true;return Promise.resolve();};window.AudioContext=function(){return ctx;};},async p=>{await p.locator('#file').setInputFiles('/tmp/vj-v15.wav');await p.waitForFunction(()=>window.__resumeCalls===1);await p.click('#enableAudio');await p.waitForFunction(()=>window.__resumeCalls>=2&&vj.snapshot().audioState==='running');assert(!(await p.locator('#audioState').innerText()).includes('TimeoutError'));});
 fs.writeFileSync(path.join(out,'audio-results.json'),JSON.stringify({checks,errors,physicalMicrophone:'unverified',physicalSpeakers:'unverified; no /dev/snd',destinationVerification:'Independent PCM tap on the node actually connected to AudioDestinationNode; gain-zero and input switching verified'},null,2));await browser.close();
})();
