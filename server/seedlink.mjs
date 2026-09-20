import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {hash} from './store.mjs';
import {waveformSummary} from './instruments.mjs';
import {waveformPaths} from '../public/waveform-geometry.js';
const URL='tls://rtserve.earthscope.org:18500',MAX_SAMPLES=250000,SPAN_US=15*60*1e6;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');

// ponytail: one explicitly started station per host; expand only with provider connection limits and per-stream controls.
export class SeedLink{
 constructor(instruments){this.instruments=instruments;this.state='stopped';this.packets=[];this.identities=new Set();this.samples=0;this.totalPackets=0;this.duplicates=0;this.evictedPackets=0;this.reconnects=0;this.active=false;}
 start(input){
  if(this.active||this.child)throw new Error('Stop the current station stream before starting another');
  const record=this.instruments.get(input.stationRecordId,'stations'),channel=record.channels.find(c=>c.id===input.channelId),now=Date.now();
  if(!channel)throw new Error('Select a channel from saved station metadata');
  if(channel.network.length>2||channel.station.length>5)throw new Error('This SeedLink v3 client supports network codes up to two characters and station codes up to five');
  if(channel.startUs===null||channel.startUs>now*1000||channel.endUs!==null&&channel.endUs<=now*1000)throw new Error('Load station metadata with a channel epoch valid now before starting live acquisition');
  this.channel=channel;this.stationRecordId=record.id;this.startedAt=now;this.stoppedAt=null;this.lastReceipt=null;this.latestSourceUs=null;this.sequence=null;this.error=null;this.packets=[];this.identities.clear();this.samples=0;this.totalPackets=0;this.duplicates=0;this.evictedPackets=0;this.reconnects=0;this.attempt=0;this.active=true;this.connect();return this.status();
 }
 connect(){
  if(!this.active)return;
  this.state=this.reconnects?'reconnecting':'connecting';this.retryAt=null;
  const child=spawn(path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-u',path.resolve('model/seedlink.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;let pending='',errors='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{pending+=chunk;if(pending.length>1000000){this.error='Decoder output exceeded packet limit';this.terminate();return;}let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!this.active)continue;try{const item=JSON.parse(line);if(item.type==='packet')this.accept(item);else if(item.type==='connected'){this.state='waiting';this.greeting=item.greeting;}else if(item.type==='error')this.error=item.error;}catch(error){this.error=error.message;this.terminate();return;}}});
  child.stderr.on('data',chunk=>errors=(errors+chunk).slice(-2000));child.once('error',error=>this.error=error.code==='ENOENT'?'Run scripts/setup-instruments.ps1 to install the station decoder.':error.message);
  child.once('close',()=>{if(this.child!==child)return;this.child=null;if(!this.active){this.state='stopped';return;}this.error=this.error||errors.trim()||'SeedLink connection ended; reconnecting with the last accepted sequence';this.state='reconnecting';this.reconnects++;const delay=Math.min(60000,5000*2**Math.min(this.attempt++,4));this.retryAt=Date.now()+delay;this.timer=setTimeout(()=>this.connect(),delay);this.timer.unref();});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({channel:this.channel,sequence:this.sequence===null?null:(this.sequence+1)&0xffffff})+'\n');
 }
 terminate(){if(!this.child?.pid)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true},()=>{});else this.child.kill();}
 stop(){this.active=false;clearTimeout(this.timer);this.retryAt=null;this.stoppedAt=Date.now();this.state=this.child?'stopping':'stopped';this.terminate();return this.status();}
 close(){this.stop();return this.child?new Promise(resolve=>this.child.once('close',resolve)):Promise.resolve();}
 accept(item){
  const raw=Buffer.from(item.raw??'','base64'),s=item.segment;
  if(raw.length!==520||!/^SL[0-9A-Fa-f]{6}$/.test(raw.subarray(0,8).toString('ascii'))||parseInt(raw.subarray(2,8).toString('ascii'),16)!==item.sequence||!Number.isFinite(item.receivedAt)||!s||!Number.isFinite(s.sampleRateHz)||s.sampleRateHz<=0||s.sampleRateHz>1e6||!Array.isArray(s.samples)||!s.samples.length||s.samples.length>10000||s.metadata?.SID!==[this.channel.network,this.channel.station,this.channel.location,this.channel.channel].join('.'))throw new Error('Invalid decoded station packet');
  for(let i=0;i<s.samples.length;i++){const [t,v]=s.samples[i];if(!Number.isSafeInteger(t)||!Number.isFinite(v)||i&&t<=s.samples[i-1][0])throw new Error('Invalid packet sample timing or values');}
  if(s.samples[0][0]<this.channel.startUs||this.channel.endUs!==null&&s.samples.at(-1)[0]>=this.channel.endUs)throw new Error('Received data crosses the selected metadata epoch; load current channel metadata');
  const identity=sha(raw);this.lastReceipt=item.receivedAt;this.state='receiving';this.error=null;this.attempt=0;
  if(this.identities.has(identity)){this.duplicates++;return;}
  this.sequence=item.sequence;this.latestSourceUs=Math.max(this.latestSourceUs??-Infinity,s.samples.at(-1)[0]);this.totalPackets++;
  this.packets.push({...item,sha256:identity});this.identities.add(identity);this.samples+=s.samples.length;
  // Evict entire packets: capture always retains the exact binary source of every included sample.
  this.packets=this.packets.filter(p=>{if(p.segment.samples[0][0]>=this.latestSourceUs-SPAN_US)return true;this.samples-=p.segment.samples.length;this.identities.delete(p.sha256);this.evictedPackets++;return false;});
  while(this.packets.length&&(this.samples>MAX_SAMPLES||this.packets.length>10000)){const p=this.packets.shift();this.samples-=p.segment.samples.length;this.identities.delete(p.sha256);this.evictedPackets++;}
 }
 status(preview=false){
  let count=0;const segments=[];if(preview)for(const p of this.packets.slice(-120).reverse()){if(count+p.segment.samples.length>20000)break;segments.unshift(p.segment);count+=p.segment.samples.length;}
  const now=Date.now(),first=segments.reduce((t,s)=>Math.min(t,s.samples[0][0]),Infinity),last=segments.reduce((t,s)=>Math.max(t,s.samples.at(-1)[0]),-Infinity),receiptAge=this.lastReceipt==null?null:(now-this.lastReceipt)/1000,sourceAge=this.latestSourceUs==null?null:now/1000-this.latestSourceUs/1e6;
  return {state:this.state,active:this.active,channel:this.channel??null,stationRecordId:this.stationRecordId??null,startedAt:this.startedAt??null,stoppedAt:this.stoppedAt??null,lastReceipt:this.lastReceipt??null,receiptAgeSeconds:receiptAge,sourceAgeSeconds:sourceAge,stale:this.active&&(receiptAge===null?now-this.startedAt>60000:receiptAge>60)||this.active&&sourceAge>60,sourceClockAhead:sourceAge!==null&&sourceAge< -1,packets:this.packets.length,samples:this.samples,totalPackets:this.totalPackets,duplicates:this.duplicates,evictedPackets:this.evictedPackets,reconnects:this.reconnects,retryAt:this.retryAt??null,error:this.error??null,source:URL,limits:{minutes:15,samples:MAX_SAMPLES,packets:10000},...(preview&&segments.length?{preview:{startUs:first,endUs:last,summary:waveformSummary(segments),paths:waveformPaths(segments,first,last,700)}}:{})};
 }
 capture(){
  if(!this.packets.length)throw new Error('No retained stream samples to capture');
  const packets=this.packets,query={stationRecordId:this.stationRecordId,channelId:this.channel.id,network:this.channel.network,station:this.channel.station,location:this.channel.location,channel:this.channel.channel,start:Math.min(...packets.map(p=>p.segment.samples[0][0]))/1000,end:Math.max(...packets.map(p=>p.segment.samples.at(-1)[0]))/1000,acquisition:'SeedLink v3 over TLS',packetHashes:packets.map(p=>p.sha256)},key=hash(query),db=this.instruments.store.db,old=db.prepare('SELECT body FROM instrument_records WHERE kind=? AND query_hash=?').get('waveform',key);
  if(old)return {...JSON.parse(old.body),reused:true};
  const raw=Buffer.concat(packets.map(p=>Buffer.from(p.raw,'base64'))),segments=packets.map(p=>p.segment),body={kind:'waveform',version:'seedlink-capture-0.1.0',query,station:this.channel,segments,summary:waveformSummary(segments),raw:raw.toString('base64'),rawEncoding:'base64',rawFormat:'SeedLink v3: 8-byte header + 512-byte MiniSEED per packet',receipt:{url:URL,fetchedAt:packets.at(-1).receivedAt,firstReceivedAt:packets[0].receivedAt,bytes:raw.length,sha256:sha(raw),packets:packets.map(p=>({sequence:p.sequence,receivedAt:p.receivedAt,sha256:p.sha256}))},createdAt:Date.now(),provenance:{provider:'EarthScope NSF National Geophysical Facility',policy:'Captured from a continuous TLS stream. Source times and local reception times are distinct. Original SeedLink packets retained; exact duplicate packets omitted within the ring. Sequence skips do not establish sample gaps. Packet boundaries are preserved; no gap filling or response correction.',decoder:'ObsPy 1.5.1',acquisitionStartedAt:this.startedAt,evictedBeforeCapture:this.evictedPackets,reconnectsBeforeCapture:this.reconnects}},id=hash(body);
  db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(id,'waveform',body.createdAt,key,JSON.stringify({...body,id}));return {...body,id};
 }
}
