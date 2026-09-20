import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

export function speechAudio(body){
 if(typeof body.audio!=='string'||body.audio.length>1280060||!body.audio.length||body.audio.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio))throw new Error('Provide at most 30 seconds of PCM speech audio');
 const bytes=Buffer.from(body.audio,'base64');
 if(bytes.length<6444||bytes.toString('ascii',0,4)!=='RIFF'||bytes.readUInt32LE(4)!==bytes.length-8||bytes.toString('ascii',8,16)!=='WAVEfmt '||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||bytes.readUInt32LE(28)!==32000||bytes.readUInt16LE(32)!==2||bytes.readUInt16LE(34)!==16||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||(bytes.length-44)%2||(bytes.length-44)>960000)throw new Error('Speech must be a canonical mono 16 kHz, 16-bit PCM WAV, between 0.2 and 30 seconds');
 if(typeof body.language!=='string'||!/^[a-z]{2,3}-[A-Za-z]{2,8}$/.test(body.language))throw new Error('Choose an installed speech language');
 return {audio:body.audio,language:body.language};
}

export class Speech {
 constructor(){this.busy=false;this.capabilities=null;this.children=new Set();this.python=path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');}
 run(mode,input=null){
  const whisper=mode.startsWith('whisper');
  if(!whisper&&process.platform!=='win32')return Promise.reject(new Error('Local Windows speech recognition is unavailable on this host'));
  return new Promise((resolve,reject)=>{
   const child=spawn(whisper?this.python:path.join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),whisper?[path.resolve('model/transcribe.py'),mode==='whisper-status'?'status':'transcribe']:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/local-speech.ps1'),'-Mode',mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.children.add(child);let out='',error='',timedOut=false;
   const timeout=setTimeout(()=>{timedOut=true;child.kill();},45000);child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
   child.stdout.on('data',chunk=>{out+=chunk;if(out.length>100000)child.kill();});child.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000);});child.stdin.on('error',()=>{});
   child.once('error',err=>{clearTimeout(timeout);this.children.delete(child);reject(err);});
   child.once('close',code=>{clearTimeout(timeout);this.children.delete(child);try{if(timedOut)throw new Error('Local transcription exceeded 45 seconds. Try a shorter recording.');const result=JSON.parse(out.trim());if(code||result.error)throw new Error(result.error??error??'Speech recognition failed');resolve(result);}catch(err){reject(err);}});
   child.stdin.end(input?JSON.stringify(input):'');
  });
 }
 async status(){
  if(!this.capabilities)this.capabilities=(async()=>{
   const [native,whisper]=await Promise.all([this.run('status').catch(error=>({available:false,recognizers:[],error:error.message})),existsSync(this.python)?this.run('whisper-status').catch(error=>({available:false,error:error.message})):{available:false}]);
   const recognizers=[...(whisper.recognizers??[]),...(native.recognizers??[]).filter(r=>!whisper.available||r.language!=='en-US').map(r=>({...r,name:'Windows offline speech'}))];return {available:recognizers.length>0,recognizers,whisper:!!whisper.available,...(!recognizers.length?{error:'No local speech recognizer is ready. Run scripts/setup-speech.ps1 on the host PC and restart the app.'}:{})};
  })();
  return {...await this.capabilities,busy:this.busy,maxSeconds:30,audioRetention:'Audio is processed in memory and is not saved by the application.'};
 }
 async transcribe(body){
  const input=speechAudio(body);if(this.busy)throw new Error('Another recording is being transcribed. Try again shortly.');
  const capabilities=await this.status();if(!capabilities.available)throw new Error(capabilities.error??'No offline speech recognizer is installed');if(!capabilities.recognizers.some(r=>r.language===input.language))throw new Error('The selected speech language is not installed');
  if(this.busy)throw new Error('Another recording is being transcribed. Try again shortly.');this.busy=true;
  try{return await this.run(capabilities.whisper&&input.language==='en-US'?'whisper-transcribe':'transcribe',input);}finally{this.busy=false;}
 }
 close(){for(const child of this.children)child.kill();}
}
