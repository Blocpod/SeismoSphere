import {waveformUtc} from '../public/waveform-geometry.js';
import {hash} from './store.mjs';
import {createHash} from 'node:crypto';
import {spectrumWindow,windowSelection,sliceSources} from '../public/spectrum-data.js';
import {calculateSpectrum} from './spectrum.mjs';
import {instrumentResponse} from './response.mjs';
const ROOT='https://service.earthscope.org/fdsnws',MAX_BYTES=16000000;
export function utcMicroseconds(value){
  const match=typeof value==='string'?/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z?$/.exec(value.trim()):null;
  if(!match)throw new Error('Invalid UTC sample or epoch timestamp');const ms=Date.parse(match[1]+'Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==match[1])throw new Error('Invalid UTC calendar date');
  const us=ms*1000+Number((match[2]??'').padEnd(6,'0'));if(!Number.isSafeInteger(us))throw new Error('Timestamp exceeds exact microsecond range');return us;
}
const number=(s,optional=false)=>{if(s===''){if(optional)return null;throw new Error('Missing numeric station metadata');}const n=Number(s);if(!Number.isFinite(n))throw new Error('Invalid numeric station metadata');return n;};
export function parseStations(text){
  const lines=text.trim().split(/\r?\n/),header=lines.shift()?.replace(/^#/,'').split('|').map(s=>s.trim());
  const expected='Network|Station|Location|Channel|Latitude|Longitude|Elevation|Depth|Azimuth|Dip|SensorDescription|Scale|ScaleFreq|ScaleUnits|SampleRate|StartTime|EndTime'.split('|');
  if(JSON.stringify(header)!==JSON.stringify(expected))throw new Error('Unrecognized FDSN channel metadata header');
  const channels=lines.filter(s=>s.trim()&&!s.startsWith('#')).map(line=>{
    const cells=line.split('|').map(s=>s.trim());if(cells.length!==expected.length)throw new Error('Invalid FDSN channel row');const p=Object.fromEntries(expected.map((key,i)=>[key,cells[i]]));
    if(!/^[A-Z0-9]{1,8}$/.test(p.Network)||!/^[A-Z0-9]{1,8}$/.test(p.Station)||!/^[A-Z0-9]{0,2}$/.test(p.Location)||!/^[A-Z0-9]{3}$/.test(p.Channel))throw new Error('Invalid FDSN source identifier');
    const c={id:[p.Network,p.Station,p.Location,p.Channel,p.StartTime].join('.'),network:p.Network,station:p.Station,location:p.Location,channel:p.Channel,lat:number(p.Latitude),lon:number(p.Longitude),elevationM:number(p.Elevation,true),depthM:number(p.Depth,true),azimuth:number(p.Azimuth,true),dip:number(p.Dip,true),sensor:p.SensorDescription||null,sensitivity:number(p.Scale,true),sensitivityFrequencyHz:number(p.ScaleFreq,true),sensitivityInputUnits:p.ScaleUnits||null,sampleRateHz:number(p.SampleRate,true),startUs:p.StartTime?utcMicroseconds(p.StartTime):null,endUs:p.EndTime?utcMicroseconds(p.EndTime):null,sourceFields:p};
    if(Math.abs(c.lat)>90||Math.abs(c.lon)>180||c.sampleRateHz!==null&&c.sampleRateHz<=0||c.dip!==null&&Math.abs(c.dip)>90||c.azimuth!==null&&(c.azimuth<0||c.azimuth>360)||c.startUs!==null&&c.endUs!==null&&c.startUs>=c.endUs)throw new Error('Invalid channel coordinates, orientation, rate or epoch');return c;
  });
  if(channels.length>4000)throw new Error('More than 4,000 channel epochs; narrow the network/channel selection');
  if(new Set(channels.map(c=>c.id)).size!==channels.length)throw new Error('Duplicate channel epochs need provider reconciliation');return channels;
}
export function parseWaveform(text,query){
  const segments=[];let current=null,reading=false,total=0;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    if(line.startsWith('# dataset:')){current={metadata:{},samples:[]};segments.push(current);reading=false;}
    if(!current)throw new Error('Missing GeoCSV dataset header');
    if(line.startsWith('#')){const colon=line.indexOf(':');if(colon<0)throw new Error('Invalid GeoCSV header');current.metadata[line.slice(1,colon).trim()]=line.slice(colon+1).trim();continue;}
    if(line==='Time, Sample'||line==='Time,Sample'){reading=true;continue;}
    if(!reading)throw new Error('Missing GeoCSV time/sample columns');const fields=line.split(',').map(s=>s.trim());if(fields.length!==2||!fields[1])throw new Error('Invalid GeoCSV sample');
    const timeUs=utcMicroseconds(fields[0]),value=Number(fields[1]);if(!Number.isFinite(value)||timeUs<query.start*1000||timeUs>query.end*1000)throw new Error('Invalid or out-of-window waveform sample');
    if(current.samples.length&&timeUs<=current.samples.at(-1)[0])throw new Error('Non-increasing sample timestamps within a segment');
    current.samples.push([timeUs,value]);if(++total>250000)throw new Error('Waveform exceeds 250,000 samples; shorten the interval');
  }
  if(!segments.length)throw new Error('Missing GeoCSV dataset header');
  const sid=[query.network,query.station,query.location,query.channel].join('_');
  for(const s of segments){const m=s.metadata;s.sampleRateHz=Number(m.sample_rate_hz);
    if(m.dataset!=='GeoCSV 2.0'||m.delimiter!==','||m.SID!==sid||Number(m.sample_count)!==s.samples.length||!Number.isFinite(s.sampleRateHz)||s.sampleRateHz<=0||m.field_unit?.replaceAll(' ','')!=='UTC,Counts')throw new Error('GeoCSV identity, sample count, rate or raw-count units failed validation');
    if(s.samples.length&&utcMicroseconds(m.start_time)!==s.samples[0][0])throw new Error('GeoCSV start timestamp does not match its first sample');
  }
  return {segments,summary:waveformSummary(segments)};
}
export function waveformSummary(segments){
  let min=null,max=null,mean=0,m2=0,n=0,gaps=0,overlaps=0,previous=null;
  for(const s of [...segments].sort((a,b)=>(a.samples[0]?.[0]??0)-(b.samples[0]?.[0]??0)))for(const [time,value]of s.samples){
    const period=1e6/s.sampleRateHz;if(previous){if(time<=previous.time)overlaps++;else if(time-previous.time>Math.max(period,previous.period)*1.5)gaps++;}
    previous={time,period};min=min===null?value:Math.min(min,value);max=max===null?value:Math.max(max,value);n++;const delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);
  }
  return {samples:n,segments:segments.length,min,max,mean:n?mean:null,rmsAboutMean:n?Math.sqrt(m2/n):null,gapTransitions:gaps,overlapTransitions:overlaps,units:'digital counts',processing:'No response removal, sensitivity scaling, filtering or resampling. Separate source segments are preserved.'};
}
export const instrumentSourceValid=record=>(record.rawEncoding==='base64'?createHash('sha256').update(Buffer.from(record.raw,'base64')).digest('hex'):hash(record.raw))===record.receipt.sha256;
const joiningText=record=>record.query.joinSegments?`The selected window uses ${record.selection.sourceSlices.length} original source slices across ${record.selection.joinedBoundaries} joined boundaries. Maximum deviation from nominal sample timing is ${record.selection.maxTimingErrorUs} microseconds. No samples were interpolated or resampled.`:'Source blocks were analyzed separately.';
const selectionContext=s=>s.sourceSlices?{...s,sourceSliceCount:s.sourceSlices.length,sourceSlices:s.sourceSlices.slice(0,20),omittedSourceSlices:Math.max(0,s.sourceSlices.length-20)}:s;
export function rawSampleMapping(record,source){
  if(source?.kind!=='correction')return null;
  const originals=source.selection.sourceSlices??[{segmentIndex:source.selection.segmentIndex,startIndex:source.selection.startIndex+source.query.startIndex,samples:source.query.samples}],slices=sliceSources(originals,record.selection.startIndex+record.query.startIndex,record.query.samples),blocks=new Set(slices.map(s=>s.segmentIndex)).size,boundaries=slices.reduce((n,s,i)=>n+(i>0&&s.segmentIndex!==slices[i-1].segmentIndex?1:0),0);
  return {sourceSlices:slices,rawBlocks:blocks,rawBlockBoundaries:boundaries,text:`The selected corrected samples map by timestamp/index to ${blocks} original raw blocks across ${boundaries} raw block boundaries. A single corrected output block does not remove those original joins. Response deconvolution used the entire correction input window, so this mapping does not isolate all samples that influenced the result.`};
}
export function instrumentContext(record,asOf,mode='catalog-replay',source=null,response=null,rawSource=null){
  if(record.kind==='correction'){
    if(!source||source.id!==record.query.waveformId||!response||response.id!==record.query.responseId||response.query.waveformId!==source.id)throw new Error('Corrected recording sources do not match');
    const evidence=instrumentContext(source,asOf,mode);
    if(mode==='strict'&&(record.createdAt>asOf||response.createdAt>asOf))throw new Error('This corrected recording or instrument response was unavailable at the strict cutoff');
    const [f1,f2,f3,f4]=record.query.preFilterHz,frequencyTaperText=`The frequency taper is one from ${f2} to ${f3} Hz, zero below ${f1} and above ${f4} Hz, with cosine transitions from ${f1} to ${f2} Hz and from ${f3} to ${f4} Hz.`;
    return {id:record.id,source:evidence,correction:{frequencyTaperText,joiningText:joiningText(record),query:record.query,selection:selectionContext(record.selection),summary:record.summary,implementation:record.implementation,warnings:record.warnings,createdAt:record.createdAt,response:{id:response.id,metadata:response.response,receipt:response.receipt,createdAt:response.createdAt}},limitations:record.limitations};
  }
  if(record.kind==='spectrum'){
    if(!source||source.id!==record.query.waveformId)throw new Error('Spectrum source recording does not match');
    const evidence=source.kind==='correction'?instrumentContext(source,asOf,mode,rawSource,response):instrumentContext(source,asOf,mode);
    if(mode==='strict'&&record.createdAt>asOf)throw new Error('This spectrum was unavailable at the strict observation cutoff');
    return {id:record.id,source:evidence,spectrum:{...(source.kind==='correction'?{rawSampleMapping:selectionContext(rawSampleMapping(record,source))}:{}),joiningText:source.kind==='correction'?'Corrected-output slicing: '+joiningText(record).replace('original source slices','corrected-record slices'):joiningText(record),query:record.query,selection:selectionContext(record.selection),summary:record.summary,implementation:record.implementation,createdAt:record.createdAt,...(record.spectrogram?{timeFrequency:record.spectrogram.summary}:{})},limitations:[source.kind==='correction'?'This spectrum describes a saved band-limited physical-motion estimate along the sensor orientation. Response correction and its frequency/time tapers were already applied; this spectrum adds its own detrending and spectral taper.':'This is a single-window periodogram of instrument-dependent digital counts, not ground-motion or earthquake magnitude.',source.kind==='correction'?'Use the retained correction settings and edge limitations. Spectral power outside the retained response-correction band is not reliable ground-motion evidence. No second response correction was performed.':'Only detrending and spectral tapering were performed; no response removal, bandpass filtering, phase picking or event association.','Bin spacing is not peak uncertainty or a confidence interval. A spectral peak does not identify its cause.','The copilot receives saved numerical summaries and source metadata, not sample vectors or individual spectral bins.']};
  }
  if(record.kind!=='waveform')throw new Error('Select a saved waveform recording to explain');
  if(!Number.isFinite(asOf)||record.query.end>asOf)throw new Error('This waveform ends after the analysis cutoff');
  if(!['strict','catalog-replay'].includes(mode)||mode==='strict'&&record.createdAt>asOf)throw new Error('This waveform was unavailable at the strict observation cutoff');
  const {packetHashes,...query}=record.query,{packets,...receipt}=record.receipt,segments=record.segments.length>80?[...record.segments.slice(0,40),...record.segments.slice(-40)]:record.segments;
  const isoMs=ms=>Number.isFinite(ms)?new Date(ms).toISOString():null,firstUs=record.segments.reduce((v,s)=>Math.min(v,s.samples[0]?.[0]??Infinity),Infinity),lastUs=record.segments.reduce((v,s)=>Math.max(v,s.samples.at(-1)?.[0]??-Infinity),-Infinity);
  const acquisition=record.query.acquisition==='SeedLink v3 over TLS'?'Captured from a continuous EarthScope SeedLink v3 stream over TLS and saved locally.':'Retrieved on demand from the EarthScope waveform archive and saved locally.',timing={firstSampleUtc:waveformUtc(firstUs),lastSampleUtc:waveformUtc(lastUs),firstReceivedUtc:isoMs(record.receipt.firstReceivedAt??record.receipt.fetchedAt),lastReceivedUtc:isoMs(record.receipt.fetchedAt),savedUtc:isoMs(record.createdAt)};
  return structuredClone({id:record.id,createdAt:record.createdAt,acquisition,timing,query:{...query,...(packetHashes?{packetCount:packetHashes.length}:{})},station:record.station,summary:record.summary,continuityAssessment:record.summary.samples?`${record.summary.segments} source segments; ${record.summary.gapTransitions} detected gap transitions; ${record.summary.overlapTransitions} overlap transitions. ${record.summary.gapTransitions===0?'No missing-data gap was detected in this window. Separate source segments alone do not imply a gap.':'Detected gap transitions remain unfilled.'}`:'No samples returned; continuity cannot be assessed.',omittedSegmentDetails:record.segments.length-segments.length,segments:segments.map(s=>({metadata:s.metadata,sampleRateHz:s.sampleRateHz,firstSampleUs:s.samples[0]?.[0]??null,lastSampleUs:s.samples.at(-1)?.[0]??null})),receipt:{...receipt,...(packets?{packetCount:packets.length}:{})},provenance:record.provenance,limitations:['Digital counts are instrument-dependent, not ground displacement, velocity, acceleration or earthquake magnitude.','No full response removal, filtering, phase picking, arrival prediction or causal earthquake assignment was performed.','Per-segment sample ranges and gaps describe only this saved recording window; missing data is not zero motion.','The language model receives metadata and computed sample summaries, not the individual waveform samples.']});
}
export async function retrieveSource(url,label='EarthScope',{signal,binary=false}={}){
  const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),headers:{'User-Agent':'SeismoSphere/0.2 (local scientific research)'}}),parts=[];let bytes=0;
  if(response.body){const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES){await reader.cancel();throw new Error(`${label} response exceeds 16 MB; narrow the query`);}parts.push(value);}}
  const buffer=Buffer.concat(parts),raw=binary?buffer:buffer.toString('utf8'),receipt={url,fetchedAt:Date.now(),httpStatus:response.status,bytes,sha256:binary?createHash('sha256').update(buffer).digest('hex'):hash(raw)};
  if(!response.ok)throw new Error(`${label} HTTP ${response.status}: ${buffer.toString('utf8',0,200).replace(/\s+/g,' ')}`);return {raw,receipt};
}
export class Instruments{
  constructor(store){this.store=store;this.busy=false;store.db.exec(`CREATE TABLE IF NOT EXISTS instrument_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,created_at INTEGER,query_hash TEXT NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS instrument_queries ON instrument_records(kind,query_hash);
    CREATE TRIGGER IF NOT EXISTS frozen_instrument_update BEFORE UPDATE ON instrument_records BEGIN SELECT RAISE(ABORT,'Instrument records are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS frozen_instrument_delete BEFORE DELETE ON instrument_records BEGIN SELECT RAISE(ABORT,'Instrument records are immutable'); END;`);}
  get(id,kind){const row=this.store.db.prepare('SELECT body,kind FROM instrument_records WHERE id=?').get(String(id));if(!row||kind&&row.kind!==kind)throw new Error('Saved instrument record not found');return JSON.parse(row.body);}
  sources(record){
    const source=['spectrum','correction','phase'].includes(record.kind)?this.get(record.query.waveformId):null,correction=record.kind==='correction'?record:source?.kind==='correction'?source:null;
    return {source,response:correction?this.get(correction.query.responseId,'response'):null,rawSource:['spectrum','phase'].includes(record.kind)&&correction?this.get(correction.query.waveformId,'waveform'):null};
  }
  context(record,asOf,mode){const {source,response,rawSource}=this.sources(record);return instrumentContext(record,asOf,mode,source,response,rawSource);}
  // ponytail: show the latest 40 of each kind; add pagination when older saved-query browsing is needed.
  list(){return this.store.db.prepare('SELECT id,kind,created_at,body FROM (SELECT *,row_number() OVER (PARTITION BY kind ORDER BY created_at DESC,id) AS position FROM instrument_records) WHERE position<=40 ORDER BY created_at DESC,id').all().map(r=>{const v=JSON.parse(r.body);return {id:r.id,kind:r.kind,createdAt:r.created_at,query:v.query,count:v.channels?.length??v.summary?.samples};});}
  async save(kind,query,url,parse,{binary=false}={}){
    const key=hash(query),old=this.store.db.prepare('SELECT body FROM instrument_records WHERE kind=? AND query_hash=? ORDER BY created_at DESC LIMIT 1').get(kind,key);if(old)return {...JSON.parse(old.body),reused:true};
    if(this.busy)throw new Error('An EarthScope request is already running');this.busy=true;
    try{const source=await retrieveSource(url,'EarthScope',{binary}),data=await parse(source.raw,source.receipt),body={kind,version:'earthscope-instruments-0.1.0',query,...data,...source,...(binary?{raw:source.raw.toString('base64'),rawEncoding:'base64'}:{}),createdAt:source.receipt.fetchedAt,provenance:{provider:'EarthScope NSF National Geophysical Facility',stationService:ROOT+'/station/1/',waveformService:ROOT+'/dataselect/1/',policy:'Revised archived metadata and samples. Reception times are from this installation. Station metadata does not establish waveform availability; missing intervals are not zero amplitude.'}},id=hash(body);this.store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(id,kind,body.createdAt,key,JSON.stringify({...body,id}));return {...body,id};}finally{this.busy=false;}
  }
  async stations(input){
    const at=typeof input.at==='number'?input.at:Date.parse(input.at),networks=String(input.networks??'IU,II').toUpperCase(),channel=String(input.channel??'BHZ').toUpperCase();
    if(!Number.isFinite(at)||at<Date.UTC(1900,0,1)||at>Date.now()||!/^([A-Z0-9]{1,8},){0,4}[A-Z0-9]{1,8}$/.test(networks)||!/^[A-Z0-9?]{3}$/.test(channel))throw new Error('Choose an elapsed UTC date, up to five exact network codes, and a three-character channel pattern');
    const query={at,networks,channel},params=new URLSearchParams({net:networks,cha:channel,starttime:new Date(at).toISOString(),endtime:new Date(at).toISOString(),level:'channel',format:'text',includerestricted:'false'});
    return this.save('stations',query,ROOT+'/station/1/query?'+params,(raw,receipt)=>({channels:receipt.httpStatus===204?[]:parseStations(raw)}));
  }
  async waveform(input){
    const record=this.get(input.stationRecordId,'stations'),station=record.channels.find(c=>c.id===input.channelId);if(!station)throw new Error('Select a channel from saved station metadata');
    const start=typeof input.start==='number'?input.start:Date.parse(input.start),end=typeof input.end==='number'?input.end:Date.parse(input.end),asOf=Number(input.asOf??Date.now()),mode=input.mode??'catalog-replay';
    if(![start,end,asOf].every(Number.isFinite)||start<Date.UTC(1900,0,1)||start>=end||end-start>15*60000||end>asOf||asOf>Date.now()+1000||!['strict','catalog-replay'].includes(mode))throw new Error('Choose an elapsed interval of at most 15 minutes, ending no later than the analysis cutoff');
    if(station.startUs!==null&&start*1000<station.startUs||station.endUs!==null&&end*1000>=station.endUs)throw new Error('The requested interval crosses the selected channel metadata epoch; load metadata for that interval');
    const query={stationRecordId:record.id,channelId:station.id,network:station.network,station:station.station,location:station.location,channel:station.channel,start,end},key=hash(query),existing=this.store.db.prepare('SELECT id,created_at FROM instrument_records WHERE kind=? AND query_hash=? ORDER BY created_at DESC LIMIT 1').get('waveform',key);
    if(mode==='strict'&&(record.createdAt>asOf||!existing||existing.created_at>asOf))throw new Error('This metadata or waveform was unavailable at the strict observation cutoff; use revised-catalog inspection');
    const params=new URLSearchParams({net:station.network,sta:station.station,loc:station.location||'--',cha:station.channel,starttime:new Date(start).toISOString(),endtime:new Date(end).toISOString(),format:'geocsv'});
    return this.save('waveform',query,ROOT+'/dataselect/1/query?'+params,(raw,receipt)=>({station,...(receipt.httpStatus===204?{segments:[],summary:{samples:0,segments:0,units:'digital counts',processing:'No samples returned; no zero amplitudes inferred'}}:parseWaveform(raw,query))}));
  }
  async spectrum(input){
    const source=this.get(input.waveformId),asOf=Number(input.asOf),mode=input.mode??'catalog-replay';if(!['waveform','correction'].includes(source.kind))throw new Error('Choose a raw or response-corrected recording');this.context(source,asOf,mode);
    if(asOf>Date.now()+1000)throw new Error('Choose an elapsed analysis cutoff');
    const query={waveformId:source.id,...(input.joinSegments!==undefined?{joinSegments:input.joinSegments}:{}),runIndex:input.runIndex,startIndex:input.startIndex,samples:input.samples,window:input.window,detrend:input.detrend,...(input.timeFrequency!==undefined?{timeFrequency:{frameSamples:input.timeFrequency?.frameSamples,hopSamples:input.timeFrequency?.hopSamples}}:{})},selected=spectrumWindow(source,query),version=(input.timeFrequency?'waveform-spectrogram-':'waveform-periodogram-')+(source.kind==='correction'?'0.3.0':input.joinSegments?'0.2.0':'0.1.0'),key=hash({query,version}),old=this.store.db.prepare('SELECT body FROM instrument_records WHERE kind=? AND query_hash=?').get('spectrum',key);
    if(old){const record=JSON.parse(old.body);if(mode==='strict'&&record.createdAt>asOf)throw new Error('This spectrum was unavailable at the strict observation cutoff');return {...record,reused:true};}
    if(this.busy)throw new Error('An instrument request is already running');this.busy=true;
    try{const computed=await calculateSpectrum({values:selected.values,...(source.kind==='correction'?{sampleUnits:source.summary.units}:{}),sampleRateHz:selected.run.sampleRateHz,window:query.window,detrend:query.detrend,...(query.timeFrequency?{timeFrequency:query.timeFrequency}:{})}),body={kind:'spectrum',version,query,createdAt:Date.now(),selection:windowSelection(selected),source:source.kind==='correction'?{id:source.id,kind:source.kind,station:source.station,query:source.query,summary:source.summary}: {id:source.id,receipt:source.receipt,station:source.station},...computed},id=hash(body);this.store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(id,'spectrum',body.createdAt,key,JSON.stringify({...body,id}));return {...body,id};}finally{this.busy=false;}
  }
  async response(input){
    const source=this.get(input.waveformId,'waveform'),asOf=Number(input.asOf),mode=input.mode??'catalog-replay';instrumentContext(source,asOf,mode);if(asOf>Date.now()+1000)throw new Error('Choose an elapsed analysis cutoff');
    const query={waveformId:source.id,validator:'stationxml-response-0.1.0'},old=this.store.db.prepare('SELECT body,created_at FROM instrument_records WHERE kind=? AND query_hash=?').get('response',hash(query));
    if(mode==='strict'&&(!old||old.created_at>asOf))throw new Error('Response metadata was unavailable at this strict cutoff; use revised-catalog inspection');
    const q=source.query,params=new URLSearchParams({net:q.network,sta:q.station,loc:q.location||'--',cha:q.channel,starttime:waveformUtc(q.start*1000),endtime:waveformUtc(q.end*1000),level:'response',format:'xml'});
    return this.save('response',query,ROOT+'/station/1/query?'+params,async(raw,receipt)=>{if(receipt.httpStatus===204)throw new Error('No full instrument response is available for this saved waveform interval');return {...await instrumentResponse({operation:'metadata',xmlBase64:raw.toString('base64'),station:source.station,startUtc:waveformUtc(q.start*1000),endUtc:waveformUtc(q.end*1000)}),rawFormat:'StationXML'};},{binary:true});
  }
  async correct(input){
    const source=this.get(input.waveformId,'waveform'),response=this.get(input.responseId,'response'),asOf=Number(input.asOf),mode=input.mode??'catalog-replay';instrumentContext(source,asOf,mode);
    if(asOf>Date.now()+1000||response.query.waveformId!==source.id)throw new Error('Choose the matching response and an elapsed cutoff');if(mode==='strict'&&response.createdAt>asOf)throw new Error('Instrument response was unavailable at the strict cutoff');
    const query={waveformId:source.id,responseId:response.id,...(input.joinSegments!==undefined?{joinSegments:input.joinSegments}:{}),runIndex:input.runIndex,startIndex:input.startIndex,samples:input.samples,output:input.output,detrend:input.detrend,preFilterHz:input.preFilterHz,waterLevelDb:input.waterLevelDb,taperFraction:input.taperFraction},selected=spectrumWindow(source,{...query,window:'boxcar'}),version=input.joinSegments?'response-correction-0.2.0':'response-correction-0.1.0';
    if(query.samples<64||!['DISP','VEL','ACC'].includes(query.output)||!Array.isArray(query.preFilterHz)||query.preFilterHz.length!==4||!query.preFilterHz.every((f,i,a)=>Number.isFinite(f)&&f>0&&f<selected.run.sampleRateHz/2&&(!i||f>a[i-1]))||!(query.waterLevelDb===null||Number.isFinite(query.waterLevelDb)&&query.waterLevelDb>=20&&query.waterLevelDb<=120)||!Number.isFinite(query.taperFraction)||query.taperFraction<.01||query.taperFraction>.2)throw new Error('Choose at least 64 samples, supported physical units, four increasing corners below Nyquist, a 1–20% taper and disabled or 20–120 dB water level');
    const key=hash({query,version}),old=this.store.db.prepare('SELECT body,created_at FROM instrument_records WHERE kind=? AND query_hash=?').get('correction',key);if(old){if(mode==='strict'&&old.created_at>asOf)throw new Error('Corrected recording was unavailable at the strict cutoff');return {...JSON.parse(old.body),reused:true};}
    if(this.busy)throw new Error('An instrument request is already running');this.busy=true;
    try{const computed=await instrumentResponse({operation:'correct',xmlBase64:response.raw,station:source.station,startUtc:waveformUtc(source.query.start*1000),endUtc:waveformUtc(source.query.end*1000),selectionStartUtc:waveformUtc(selected.firstSampleUs),values:selected.values,sampleRateHz:selected.run.sampleRateHz,options:query}),{values,...processing}=computed,segments=[{sampleRateHz:selected.run.sampleRateHz,metadata:selected.sourceSlices?{sourceSlices:selected.sourceSlices,joining:'Same rate; increasing timestamps; no interpolation or overlap resolution'}:{sourceSegment:selected.run.segmentIndex},samples:selected.sampleTimesUs.map((t,i)=>[t,values[i]])}];
      if(values.length!==query.samples||!values.every(Number.isFinite))throw new Error('Corrected output failed sample validation');
      const summary={...waveformSummary(segments),units:computed.units,processing:'Detrending, time taper, four-corner frequency taper and full instrument-response deconvolution; no interpolation or event association'},body={kind:'correction',version,query,createdAt:Date.now(),station:source.station,selection:windowSelection(selected),segments,summary,...processing},id=hash(body);this.store.db.prepare('INSERT INTO instrument_records VALUES(?,?,?,?,?)').run(id,'correction',body.createdAt,key,JSON.stringify({...body,id}));return {...body,id};
    }finally{this.busy=false;}
  }
}
