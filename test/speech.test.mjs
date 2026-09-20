import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {speechAudio,Speech} from '../server/speech.mjs';
import {speechWav} from '../public/voice-input.js';

test('speech upload admits bounded mono PCM and rejects malformed headers, data, language and duration',()=>{
 const request={language:'en-US',audio:speechWav(new Float32Array(3200))};assert.deepEqual(speechAudio(request),request);
 const maximum={...request,audio:speechWav(new Float32Array(480000))};assert.equal(Buffer.from(maximum.audio,'base64').length,960044);assert.deepEqual(speechAudio(maximum),maximum);
 for(const change of [{audio:''},{audio:'!'.repeat(100)},{audio:'A'.repeat(1280064)},{language:'en-US;whoami'},{language:null}])assert.throws(()=>speechAudio({...request,...change}));
 for(const offset of [0,4,8,12,16,20,22,24,28,32,34,36,40]){const bytes=Buffer.from(request.audio,'base64');bytes[offset]^=255;assert.throws(()=>speechAudio({...request,audio:bytes.toString('base64')}),undefined,'header offset '+offset);}
 assert.throws(()=>speechWav(new Float32Array(3199)));assert.throws(()=>speechWav(new Float32Array(480001)));
 const samples=new Float32Array(3200);samples.set([-2,-1,-.5,0,.5,1,2,NaN]);const bytes=Buffer.from(speechWav(samples),'base64');assert.deepEqual(Array.from({length:8},(_,i)=>bytes.readInt16LE(44+i*2)),[-32768,-32768,-16384,0,16384,32767,32767,0]);
});

test('native offline transcription recognizes synthesized questions through HTTP without storing audio or issuing forecasts',{skip:process.platform!=='win32',timeout:90000},async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'seismo-speech-')),wav=path.join(directory,'question.wav'),speech=new Speech();let child;
 try{
  const capabilities=await speech.status();assert.equal(capabilities.available,true);assert.ok(capabilities.recognizers.some(r=>r.language==='en-US'));
  // Synthetic input verifies the transport and engine, not real microphone/accent quality.
  execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File','scripts/speech-fixture.ps1','-OutputFile',wav],{windowsHide:true});
  const file=readFileSync(wav);let at=12,data;while(at+8<=file.length){const n=file.readUInt32LE(at+4);if(file.toString('ascii',at,at+4)==='data'){data=file.subarray(at+8,at+8+n);break;}at+=8+n+(n%2);}assert.ok(data);const samples=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768),audio=speechWav(samples);
  const port=14344,root=`http://127.0.0.1:${port}`;child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),SEISMO_TEST_MODE:'1',SEISMO_DB:path.join(directory,'test.sqlite')},windowsHide:true,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Speech test server did not start')),10000);child.stdout.on('data',x=>{if(String(x).includes('SeismoSphere running')){clearTimeout(t);resolve();}});child.on('error',reject);});
  const post=(body,headers={})=>fetch(root+'/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await(await fetch(root+'/api/speech')).json()).available,true);
  assert.equal((await post({audio,language:'en-US'},{Origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await post({audio,language:'xx-XX'})).status,400);
  const native=await speech.run('transcribe',{audio,language:'en-US'});assert.match(native.text,/300 km.*72 hours/i);assert.equal(native.provider,'Windows offline speech');
  const response=await post({audio,language:'en-US'});assert.equal(response.status,200);const result=await response.json();assert.match(result.text,/earthquake/i);assert.match(result.text,/300 (?:km|kilometers)/i);assert.match(result.text,/72 hours/i);assert.match(result.text,/evidence.*forecast/i);assert.equal(result.provider,capabilities.whisper?'Local Whisper small.en':'Windows offline speech');assert.ok(!result.audio);assert.ok(!result.actions);
  // Maximum payload exercises the endpoint's larger limit; a silent recording must stay empty.
  const silent=await post({audio:speechWav(new Float32Array(480000)),language:'en-US'});assert.equal(silent.status,200);assert.equal((await silent.json()).text,'');
  assert.equal((await post({audio:'A'.repeat(1500001),language:'en-US'})).status,400);
  assert.equal((await(await fetch(root+'/api/ledger')).json()).forecasts.length,0);
  assert.equal((await(await fetch(root+'/api/status')).json()).speechBusy,false);
 }finally{speech.close();child?.kill();}
});
