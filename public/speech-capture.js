let activeCapture=null;
export function cancelSpeechCapture(message=''){activeCapture?.cancel(message);}
export function speechWav(samples){
 if(samples.length<3200||samples.length>480000)throw new Error('Record between 0.2 and 30 seconds.');
 const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer),label=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
 label(0,'RIFF');view.setUint32(4,bytes.length-8,true);label(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const sample=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);}
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export async function speechSamples(chunks,length,rate){
 const samples=new Float32Array(length);let at=0;for(const chunk of chunks){samples.set(chunk,at);at+=chunk.length;}
 if(rate===16000)return samples;
 const offline=new OfflineAudioContext(1,Math.min(480000,Math.round(length*16000/rate)),16000),buffer=offline.createBuffer(1,length,rate);buffer.copyToChannel(samples,0);
 const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();return (await offline.startRendering()).getChannelData(0);
}
export function createSpeechCapture({api,onChange=()=>{},onTranscript=()=>{}}){
 const supported=!!(navigator.mediaDevices?.getUserMedia&&window.AudioContext&&window.AudioWorkletNode&&window.OfflineAudioContext&&isSecureContext);let serial=0,active=null,phase='idle';
 function report(next,message){phase=next;onChange({phase,busy:phase!=='idle',recording:phase==='recording',message});}
 function release(record){if(!record)return;clearInterval(record.timer);clearTimeout(record.deadline);record.recording=false;record.node?.port.close();record.source?.disconnect();record.node?.disconnect();record.stream?.getTracks().forEach(t=>t.stop());if(record.context?.state!=='closed')record.context?.close().catch(()=>{});}
 function cancel(message=''){serial++;release(active);active=null;if(activeCapture===capture)activeCapture=null;report('idle',message);}
 function failure(error){return error.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser settings, or type your question.':error.name==='NotFoundError'?'No microphone was found. Connect one, or type your question.':error.message;}
 async function finish(){
  const record=active;if(!record?.recording)return;release(record);active=null;report('transcribing','Transcribing on your SeismoSphere PC…');
  try{if(record.length/record.rate<0.2)throw new Error('That recording was too short. Try speaking for a few seconds.');const samples=await speechSamples(record.chunks,record.length,record.rate);if(record.token!==serial)return;const result=await api('transcribe',{audio:speechWav(samples),language:record.language});if(record.token!==serial)return;report('idle','');onTranscript(result);}
  catch(error){if(record.token===serial)report('idle',failure(error));}
  finally{record.chunks.length=0;if(record.token===serial&&activeCapture===capture)activeCapture=null;}
 }
 async function start(language){
  if(phase!=='idle')return;if(!supported){report('idle','Voice capture is unavailable in this browser. Use microphone and Web Audio support over HTTPS or localhost.');return;}
  if(activeCapture&&activeCapture!==capture)activeCapture.cancel('Microphone moved to the other question composer.');activeCapture=capture;
  const record={token:++serial,chunks:[],length:0,language,recording:false};active=record;report('preparing','Waiting for microphone permission…');
  try{
   record.context=new AudioContext();await record.context.resume();if(record.token!==serial){release(record);return;}
   record.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});if(record.token!==serial){release(record);return;}
   await record.context.audioWorklet.addModule('/voice-capture-worklet.js');if(record.token!==serial){release(record);return;}
   record.rate=record.context.sampleRate;record.source=record.context.createMediaStreamSource(record.stream);record.node=new AudioWorkletNode(record.context,'seismo-voice-capture',{channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]});record.recording=true;
   record.node.port.onmessage=event=>{if(!record.recording||record.token!==serial)return;const remaining=Math.floor(record.rate*30)-record.length,chunk=event.data.subarray(0,remaining);record.chunks.push(chunk);record.length+=chunk.length;if(record.length>=record.rate*30)void finish();};
   record.node.onprocessorerror=()=>{if(record.token===serial)cancel('Microphone processing stopped. Try again.');};
   for(const track of record.stream.getTracks())track.onended=()=>{if(record.recording&&record.token===serial)cancel('The microphone disconnected. Please try again.');};
   record.source.connect(record.node);record.node.connect(record.context.destination);record.started=performance.now();report('recording','Recording · 0 / 30 seconds');record.timer=setInterval(()=>report('recording',`Recording · ${Math.min(30,Math.floor((performance.now()-record.started)/1000))} / 30 seconds`),1000);record.deadline=setTimeout(finish,30000);
  }catch(error){release(record);if(record.token===serial){active=null;if(activeCapture===capture)activeCapture=null;report('idle',failure(error));}}
 }
 const capture={supported,get busy(){return phase!=='idle';},get recording(){return phase==='recording';},start,finish,cancel};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture.busy)cancel('Voice input stopped because the page was hidden. Start again when ready.');});window.addEventListener('pagehide',()=>cancel());return capture;
}
