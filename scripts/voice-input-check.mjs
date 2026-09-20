import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chat,commandEventView} from '../server/ai.mjs';
import assert from 'node:assert/strict';
const engines=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),root='http://127.0.0.1:4318',reports=[];
const fixture=path.resolve('artifacts/speech-native-probe.wav');execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File','scripts/speech-fixture.ps1','-OutputFile',fixture],{windowsHide:true});assert.ok(readFileSync(fixture).length>1000);
for(const engine of ['chromium','webkit']){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome',args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+fixture+'%noloop']}:{})});
 try{for(const [width,height]of [[1366,900],[320,740],[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',...(engine==='chromium'?{permissions:['microphone']}:{})}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root);await page.locator('.event-row').first().waitFor({state:'attached'});await page.locator('#voice-open').click();
  const supported=await page.evaluate(()=>!!(navigator.mediaDevices?.getUserMedia&&window.AudioContext&&window.AudioWorkletNode&&window.OfflineAudioContext&&isSecureContext));
  if(!supported){assert.match(await page.locator('#voice-status').innerText(),/unavailable/);assert.equal(await page.locator('#voice-start').isDisabled(),true);}
  else{
   await page.waitForFunction(()=>!document.querySelector('#voice-start').disabled);assert.equal(await page.locator('#voice-language').inputValue(),'en-US');
   if(width===1366){
    // This is Chromium's synthetic microphone device, not the user's microphone.
    const response=page.waitForResponse(r=>r.url().endsWith('/api/transcribe'),{timeout:60000});await page.locator('#voice-start').click();await page.locator('#voice-status').filter({hasText:'Recording · 9 /'}).waitFor({timeout:20000});await page.locator('#voice-stop').click();const r=await response,result=await r.json();assert.equal(r.status(),200,JSON.stringify(result));assert.match(result.text,/300 (?:km|kilometers)/i);assert.match(result.text,/72 hours/i);assert.match(result.text,/forecast/i);
    await page.waitForFunction(()=>!document.querySelector('#voice-insert').disabled);await page.screenshot({path:'artifacts/voice-native-transcript.png'});
    assert.equal(result.provider,'Local Whisper small.en');assert.match(result.text,/show all earthquakes deeper than 300 kilometers/i);writeFileSync('artifacts/speech-browser-probe.wav',Buffer.from(r.request().postDataJSON().audio,'base64'));
    // Keep the actual transcript, exercise editing by adding a question, and submit to the real local copilot.
    const question=result.text+' Give the count and source IDs of events matching that 72-hour view. Explain why a model match score is not an earthquake probability.';await page.locator('#voice-text').fill(question);await page.locator('#voice-insert').click();const aiResponse=page.waitForResponse(r=>r.url().endsWith('/api/chat'),{timeout:190000});await page.locator('#command-submit').click();const ai=await(await aiResponse).json();assert.equal(ai.provider,'ollama');assert.ok(ai.actions.includes('deep'));assert.ok(!ai.actions.includes('all'));assert.match(ai.answer,/probability|calibrat/i);await page.waitForFunction(()=>document.querySelector('#event-filters [data-filter="deep"]').classList.contains('active'));assert.equal(await page.locator('#event-window').inputValue(),'72');
    const state=await(await fetch(root+'/api/status')).json(),analysis=await(await fetch(root+'/api/analysis?mode=strict')).json(),catalog=await(await fetch(root+'/api/events?mode=strict&asOf='+analysis.asOf)).json(),eventView=commandEventView(question,catalog.events,analysis.asOf),astra=await chat(question,{...analysis,mode:'strict',eventView},{...state.config,aiProvider:'codex'});assert.equal(astra.provider,'codex');assert.equal(astra.model,'gpt-6-astra');assert.ok(astra.actions.includes('deep'));assert.ok(!astra.actions.includes('all'));assert.match(astra.answer,/probability|calibrat/i);
    reports.push({kind:'native-capture-transcription-copilot',recordedDevice:'Chrome synthetic WAV microphone',transcript:result.text,reviewEdit:'Appended a question without replacing the recognized command',eventView,ai,astra});await page.locator('#chat-close').click();await page.locator('#voice-open').click();await page.waitForFunction(()=>!document.querySelector('#voice-start').disabled);
   }
   // Controlled transcript response exercises editing and existing-draft insertion on each layout.
   await page.locator('#voice-cancel').click();await page.locator('#command-input').fill('My draft:');await page.locator('#command-input').evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));await page.locator('#voice-open').click();await page.waitForFunction(()=>!document.querySelector('#voice-start').disabled);await page.locator('#voice-text').fill('Explain this event.');await page.locator('#voice-insert').click();assert.equal(await page.locator('#command-input').inputValue(),'My draft: Explain this event.');await page.locator('#voice-open').click();await page.waitForFunction(()=>!document.querySelector('#voice-start').disabled);
  }
  const layout=await page.evaluate(()=>{const d=document.querySelector('#voice-dialog'),b=document.querySelector('#voice-open');return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,dialogWidth:d.clientWidth,dialogScroll:d.scrollWidth,microphone:{width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height},controls:[...d.querySelectorAll('button,select,textarea')].filter(x=>!x.hidden&&x.getClientRects().length).map(x=>({id:x.id,height:x.getBoundingClientRect().height}))};});assert.ok(layout.documentWidth<=width+1,JSON.stringify(layout));assert.ok(layout.dialogScroll<=layout.dialogWidth+1);assert.ok(layout.microphone.width>=44&&layout.microphone.height>=44);for(const c of layout.controls)assert.ok(c.height>=44,JSON.stringify(c));
  await page.screenshot({path:`artifacts/${engine}-voice-${width}.png`});await page.locator('#voice-cancel').click();assert.deepEqual(errors,[]);reports.push({engine,width,height,supported,layout,errors});await page.close();
 }}finally{await browser.close();}
}
writeFileSync('artifacts/voice-input-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
