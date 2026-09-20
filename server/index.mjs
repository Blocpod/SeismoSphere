import {RouteHistory,validateRoutes} from './routes.mjs';
import {PhaseAnalysis} from './phase.mjs';
import {closeResponseWorkers} from './response.mjs';
import {ProspectiveExperiments,prospectiveContext} from './prospective.mjs';
import {Speech} from './speech.mjs';
import {spatialQuestion} from './spatial-question.mjs';
import {ResolutionReviews,resolutionReviewEvidence} from './resolution-reviews.mjs';
import {WeeklyVolcanoes,weeklyVolcanoEvidence} from './weekly-volcanoes.mjs';
import {VolcanoStatus,volcanoStatusEvidence} from './volcano-status.mjs';
import {slabSurfaces,slabSource,slabSample} from './slab-surfaces.mjs';
import http from 'node:http';
import {readFileSync,existsSync,createReadStream,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {ETAS_VERSION} from './etas.mjs';
import {SPATIAL_ETAS_VERSION} from './spatial-etas.mjs';
import {Access} from './access.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Store,hash} from './store.mjs';
import {liveCatalog,deletedCatalog} from './catalog.mjs';
import {ImportJobs,coverageComplete} from './import-jobs.mjs';
import {generate,baselines,scoreForecast,leaderboard,validateConfig,backtest,analogues} from './engine.mjs';
import {providers,chat,responseSchema,commandEventView} from './ai.mjs';
import {neuralAnalogues} from './neural.mjs';
import {faultContext} from './fault-context.mjs';
import {statisticalContext} from './statistical-context.mjs';
import {LearnedModel,learnedContext} from './learned.mjs';
import {COMPLETENESS_VERSION,completenessOptions,completenessContext} from './completeness.mjs';
import {RandomizationJobs} from './randomization-jobs.mjs';
import {randomizationOptions,randomizationContext} from './randomization.mjs';
import {Instruments,instrumentContext,instrumentSourceValid,rawSampleMapping} from './instruments.mjs';
import {SeedLink} from './seedlink.mjs';
import {Mechanisms,mechanismContext} from './mechanisms.mjs';
import {volcanoDataset,volcanoEvidence} from './volcano-context.mjs';
import {cratonDataset,cratonEvidence} from './cratons.mjs';
import {GNSS,gnssEvidence} from './gnss.mjs';
import {reliefDataset,reliefSource,reliefEvidence} from './relief.mjs';
import {DAY,distance,midpoint,pathMidpoint,circleBounds,validateBounds,insideBounds} from './geo.mjs';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const defaults=JSON.parse(readFileSync('config/default.json','utf8'));
let routes=JSON.parse(readFileSync('config/routes.json','utf8'));
const store=new Store(process.env.SEISMO_DB??'data/seismosphere.sqlite');
const routeHistory=new RouteHistory(store,routes);routes=routeHistory.current();
const learned=new LearnedModel(store);
const speech=new Speech();
const instruments=new Instruments(store),seedlink=new SeedLink(instruments),phases=new PhaseAnalysis(instruments);
const mechanisms=new Mechanisms(store);
const gnss=new GNSS(store);
const volcanoStatus=new VolcanoStatus(store);
const weeklyVolcanoes=new WeeklyVolcanoes(store);
const resolutionReviews=new ResolutionReviews(store);
const prospective=new ProspectiveExperiments(store);
let config={catalogProvider:'USGS',...store.get('config',defaults),rules:{swarm:true,...store.get('config',defaults).rules}},feed=store.get('feed',{status:'empty'}),refreshing=false,aiBusy=false;
const researchEvents=options=>store.events({provider:config.catalogProvider,...options});
let fittingETAS=false;
function runStatistical(data,kind='etas'){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(`./${kind}-worker.mjs`,import.meta.url),{workerData:data});
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Analysis exceeded 90 seconds. Reduce the catalog interval or increase the magnitude threshold.'));},90000);
    worker.once('message',message=>{clearTimeout(timeout);if(message.error)reject(new Error(message.error));else resolve(message);});
    worker.once('error',error=>{clearTimeout(timeout);reject(error);});
    worker.once('exit',code=>{clearTimeout(timeout);if(code!==0)reject(new Error(`Statistical worker exited (${code})`));});
  });
}
const port=Number(process.env.PORT??4318);
const access=new Access(store,{localPort:port,test:!!process.env.SEISMO_TEST_MODE,directory:process.env.SEISMO_TLS_DIR??'data/private/tls'});
const startedAt=Date.now();
async function startupSetting(mode='Status'){
  if(process.platform!=='win32')return {enabled:false,supported:false};
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('Set-SeismoSphereStartup.ps1'),'-Mode',mode],{windowsHide:true,timeout:10000,maxBuffer:4000});return JSON.parse(stdout);
}
let boundaries=[];
if(existsSync('public/assets/plates.json')){const data=JSON.parse(readFileSync('public/assets/plates.json','utf8'));for(const f of data.features){const lines=f.geometry.type==='MultiLineString'?f.geometry.coordinates:[f.geometry.coordinates];for(const line of lines)for(let i=0;i<line.length;i+=3)boundaries.push({lon:line[i][0],lat:line[i][1]});}}
writeFileSync('config/ai-response.schema.json',JSON.stringify(responseSchema,null,2));
const clients=new Set();const broadcast=data=>{for(const client of clients)if(!client.writableEnded&&!client.destroyed)client.write(`data: ${JSON.stringify(data)}\n\n`);};
let reviewTimer=null;function scheduleResolutionReview(){clearTimeout(reviewTimer);reviewTimer=setTimeout(()=>{try{resolveExpired();store.set('resolution-review-error',null);}catch(e){store.set('resolution-review-error',e.message);broadcast({type:'ledger'});}},1000);reviewTimer.unref();}
let cache=null;const drafts=new Map();
const importJobs=new ImportJobs(store,{onChange:job=>{broadcast({type:'import',job});if(job.status==='completed')broadcast({type:'catalog',feed});},onCatalog:()=>{cache=null;scheduleResolutionReview();}});
const randomizations=new RandomizationJobs(store,{onChange:job=>broadcast({type:'randomization',id:job.id,status:job.status,completed:job.completed})});
function analysisAt(asOf=Date.now(),mode='catalog-replay'){
  const strict=mode==='strict';
  const events=researchEvents({asOf,strict});
  const key=hash({asOf:Math.floor(asOf/60000),mode,config,routeVersion:routes.version,last:feed.fetchedAt,count:events.length});
  if(cache?.key===key)return cache.value;
  const value=generate(events,asOf,config,routes,boundaries);value.analysisId=hash({key,asOf,config,routeVersion:routes.version});
  drafts.set(value.analysisId,{analysis:value,events,config:structuredClone(config),routes:structuredClone(routes),mode});
  while(drafts.size>16)drafts.delete(drafts.keys().next().value);
  cache={key,value};return value;
}
function resolveExpired(forecastId=null){const result=resolutionReviews.review(forecastId);if(result.reviewed)broadcast({type:'ledger',count:0,reviews:result.reviewed});return result;}
function issueAnalysis(analysis,mode='prospective',includeBaselines=true,keys=null){
  if(mode==='prospective'&&Date.now()-analysis.asOf>3600000)throw new Error('This preview is over an hour old. Refresh before issuing a live forecast.');
  const draft=drafts.get(analysis.analysisId);if(!draft)throw new Error('Preview expired. Refresh the analysis before issuing.');
  if(mode==='prospective'&&draft.mode!=='strict')throw new Error('Prospective issuance requires a live observation-history preview');
  const events=draft.events;
  const snapshotId=store.snapshot(events,analysis.asOf,mode);
  let targets=analysis.candidates.filter(c=>!keys||keys.includes(c.key));
  if(!targets.length)throw new Error('No matching candidates to issue');
  if(includeBaselines)targets=[...targets,...baselines({...analysis,candidates:targets},events)];
  const existing=store.ledger();
  targets=targets.filter(c=>!existing.some(f=>f.mode===mode&&f.engine===c.engine&&f.key===c.key));
  const issuedAt=Date.now();
  if(mode==='prospective')targets=targets.map(c=>({...c,validFrom:issuedAt,validUntil:issuedAt+draft.config.windowDays*DAY}));
  const result=store.issue(targets,{snapshotId,config:draft.config,routeConfig:draft.routes,mode,issuedAt,status:'ISSUED'});broadcast({type:'ledger',count:result.length});return result;
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  if(Date.now()-(store.get('deletionSync',{}).checkedAt??0)>3600000)await syncDeletions();
  try{const data=await liveCatalog();store.ingest(data.events,data.fetchedAt);feed={status:'live',count:data.events.length,...data,events:undefined};store.set('feed',feed);const coverage=store.get('coverage',[]);coverage.push({provider:'USGS',start:data.generated-30*DAY,end:data.generated,minMagnitude:-3,source:data.url});store.set('coverage',[...coverage.filter(c=>c.importJobId||c.sources),...coverage.filter(c=>!c.importJobId&&!c.sources).slice(-500)]);cache=null;resolveExpired();if(config.autoForecast){const last=store.get('autoIssuedAt',0);if(Date.now()-last>DAY){const a=analysisAt(Date.now(),'strict');if(a.candidates.length){issueAnalysis(a);store.set('autoIssuedAt',Date.now());}}}broadcast({type:'catalog',feed});}
  catch(e){feed={...feed,status:'stale',error:e.message};store.set('feed',feed);broadcast({type:'catalog',feed});}
  finally{refreshing=false;}
}
let syncingDeletions=false;
async function syncDeletions(){
  if(syncingDeletions)return;syncingDeletions=true;
  const previous=store.get('deletionSync',{}),startedAt=Date.now();
  try{
    const data=await deletedCatalog((previous.cursor??startedAt-31*DAY)-60000);
    const inserted=store.ingest(data.events,data.fetchedAt);
    const quarantined=store.get('deletionQuarantine',{});
    for(const entry of data.quarantined)quarantined[hash(entry.feature)]={...entry,receivedAt:quarantined[hash(entry.feature)]?.receivedAt??data.fetchedAt};
    store.set('deletionQuarantine',quarantined);
    store.set('deletionSync',{status:Object.keys(quarantined).length?'synced-with-unidentified-records':'synced',cursor:startedAt,checkedAt:data.fetchedAt,received:data.events.length,newRevisions:inserted,unidentifiedRecords:Object.keys(quarantined).length,source:data.url});cache=null;
    if(inserted){broadcast({type:'catalog',feed});scheduleResolutionReview();}
  }catch(e){store.set('deletionSync',{...previous,status:'stale',error:e.message,attemptedAt:startedAt});}
  finally{syncingDeletions=false;}
}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=1000000){req.setEncoding('utf8');let b='';for await(const x of req){b+=x;if(b.length>limit)throw new Error('Request too large');}return b?JSON.parse(b):{};}
function numberParam(params,key,fallback){const raw=params.get(key);if(raw===null)return fallback;const n=Number(raw);if(!Number.isFinite(n))throw new Error(`Invalid ${key}`);return n;}
const handler=async(req,res)=>{
  try{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const url=new URL(req.url,`http://127.0.0.1:${port}`),p=url.pathname,q=url.searchParams;
    if(!await access.guard(req,res,p))return;
    if(p==='/api/access')return send(res,200,{authenticated:true,local:true,session:{role:'owner',name:'This PC'}});
    if(p==='/api/system/health')return send(res,200,{appId:'seismosphere',version:'0.2.0',pid:process.pid,projectRoot:process.cwd(),startedAt,uptimeSeconds:Math.floor(process.uptime())});
    if(p==='/api/system/startup')return send(res,200,await startupSetting());
    if(p==='/api/sharing/status')return send(res,200,access.info());
    if(p.startsWith('/api/')&&!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'});
    if(req.method==='POST'&&req.headers['content-type']!=='application/json')return send(res,415,{error:'JSON required'});
    if(p==='/api/stream'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    if(p==='/api/gnss-runs')return send(res,200,{busy:gnss.busy,runs:gnss.list()});
    if(p==='/api/gnss-field'){const record=gnss.get(q.get('id'));return send(res,200,{...gnss.summary(record.id),columns:['id','lat','lon','eastMyr','northMyr','upMyr','eastUncertaintyMyr','northUncertaintyMyr','upUncertaintyMyr','firstEpoch','lastEpoch','durationYears','validFitInterval'],stations:record.stations.map(s=>[s.id,s.lat,s.lon,s.velocityMyr.east,s.velocityMyr.north,s.velocityMyr.up,s.uncertaintyMyr.east,s.uncertaintyMyr.north,s.uncertaintyMyr.up,s.firstEpoch,s.lastEpoch,s.durationYears,s.validFitInterval])});}
    if(p==='/api/gnss-station'){const record=gnss.get(q.get('id')),station=record.stations.find(s=>s.id===q.get('station'));if(!station)throw new Error('GNSS station not present in this saved solution.');return send(res,200,{...gnss.summary(record.id),station});}
    if(p==='/api/gnss-export'){const record=gnss.get(q.get('id'));res.setHeader('Content-Disposition','attachment; filename="seismosphere-gnss.'+(q.has('raw')?'txt':'json')+'"');if(q.has('raw')){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(record.raw);}return send(res,200,record);}
    if(p==='/api/relief')return send(res,200,(await reliefDataset()).metadata);
    if(p==='/api/relief-export'){const raw=await reliefSource();res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename=etopo-2022-surface-9arcmin.dods'});return res.end(raw);}
    if(p==='/api/cratons')return send(res,200,await cratonDataset());
    if(p==='/api/weekly-volcanoes'){const cutoff=q.has('asOf')?Number(q.get('asOf')):Date.now();if(q.has('asOf')&&!q.get('asOf').trim())throw new Error('Provide a weekly report cutoff');return send(res,200,weeklyVolcanoes.view(cutoff,q.get('id')));}
    if(p==='/api/weekly-volcanoes-export'){const record=weeklyVolcanoes.get(q.get('id'));res.setHeader('Content-Disposition','attachment; filename=smithsonian-weekly.'+(q.has('raw')?'xml':'json'));if(q.has('raw')){res.writeHead(200,{'Content-Type':'application/xml'});return res.end(Buffer.from(record.rawBase64,'base64'));}return send(res,200,record);}
    if(p==='/api/volcano-status'){const cutoff=q.has('asOf')?Number(q.get('asOf')):Date.now();if(q.has('asOf')&&!q.get('asOf').trim())throw new Error('Provide a volcano status cutoff');return send(res,200,volcanoStatus.view(cutoff,q.get('id')));}
    if(p==='/api/volcano-status-export'){const record=volcanoStatus.get(q.get('id'));res.setHeader('Content-Disposition','attachment; filename=usgs-volcano-status.'+(q.has('raw')?'geojson':'json'));if(q.has('raw')){res.writeHead(200,{'Content-Type':'application/geo+json; charset=utf-8'});return res.end(record.raw);}return send(res,200,record);}
    if(p==='/api/speech'&&req.method==='GET')return send(res,200,await speech.status());
    if(p==='/api/routes')return send(res,200,{network:q.get('version')?routeHistory.get(q.get('version')):routes,versions:routeHistory.list()});
    if(p==='/api/status')return send(res,200,{feed,refreshing,speechBusy:speech.busy,volcanoStatusBusy:!!volcanoStatus.pending,weeklyVolcanoBusy:!!weeklyVolcanoes.pending,gnssBusy:gnss.busy,importing:!!importJobs.active,aiBusy,config,routes,integrity:store.verify(),coverage:store.get('coverage',[]),catalogCount:researchEvents().length,deletionSync:store.get('deletionSync',{}),catalogPolicy:'One provider per research run; authoritative aliases associated within that provider'});
    if(p==='/api/randomizations')return send(res,200,{activeId:randomizations.active?.id??null,jobs:randomizations.list()});
    if(p==='/api/randomization-job')return send(res,200,randomizations.get(q.get('id')));
    if(p==='/api/randomization-export'){res.setHeader('Content-Disposition','attachment; filename="seismosphere-randomization.json"');return send(res,200,randomizations.export(q.get('id')));}
    if(p==='/api/import-jobs')return send(res,200,{activeId:importJobs.active?.id??null,jobs:importJobs.summaries()});
    if(p==='/api/import-export'){const id=q.get('id');res.setHeader('Content-Disposition','attachment; filename="seismosphere-import.json"');return send(res,200,{job:importJobs.summary(importJobs.get(id)),receipts:importJobs.receipts(id),policy:'Query coverage records successful catalog retrieval, not earthquake detection completeness. Historical data contains later revisions; receipt times are from this installation.'});}
    if(p==='/api/events'){const asOf=numberParam(q,'asOf',Date.now());const mode=q.get('mode')??'catalog-replay';const events=researchEvents({asOf,start:numberParam(q,'start',asOf-30*DAY),strict:mode==='strict'});return send(res,200,{events,asOf,mode,feed,catalogProvider:config.catalogProvider});}
    if(p==='/api/analysis')return send(res,200,analysisAt(numberParam(q,'asOf',Date.now()),q.get('mode')??'catalog-replay'));
    if(p==='/api/providers')return send(res,200,await providers());
    if(p==='/api/learned-runs')return send(res,200,learned.list());
    if(p==='/api/catalog-diagnostics')return send(res,200,{fitting:fittingETAS,runs:store.db.prepare('SELECT body FROM catalog_diagnostics ORDER BY created_at DESC LIMIT 20').all().map(r=>JSON.parse(r.body))});
    if(p==='/api/station-stream'&&req.method==='GET')return send(res,200,seedlink.status(q.get('preview')==='1'));
    if(p==='/api/instruments')return send(res,200,{busy:instruments.busy,records:instruments.list()});
    if(p==='/api/volcano-export'){
      const {data,sha256}=await volcanoDataset(),volcano=data.volcanoes.find(v=>v.id===q.get('id'));if(!volcano)throw new Error('Unknown volcano source identity');
      res.setHeader('Content-Disposition','attachment; filename="seismosphere-volcano.json"');return send(res,200,{volcano,provenance:data.provenance,datasetSha256:sha256});
    }
    if(p==='/api/slab-surfaces')return send(res,200,await slabSurfaces());
    if(p==='/api/slab-sample'){if(!q.has('lat')||!q.has('lon')||!q.get('lat').trim()||!q.get('lon').trim())throw new Error('Provide latitude and longitude.');return send(res,200,await slabSample(q.get('id'),{lat:Number(q.get('lat')),lon:Number(q.get('lon'))},Date.now()));}
    if(p==='/api/slab-source'){const source=await slabSource(q.get('id'),q.get('field'));res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${source.name}"`});return res.end(source.bytes);}
    if(p==='/api/mechanisms')return send(res,200,{busy:mechanisms.busy,records:mechanisms.list()});
    if(p==='/api/mechanism-export'){
      const record=mechanisms.get(q.get('id')),{id,...body}=record;
      res.setHeader('Content-Disposition','attachment; filename="seismosphere-mechanism.json"');
      if(q.get('raw')==='1'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(record.raw);}
      return send(res,200,{record,integrity:{recordValid:hash(body)===id,sourceValid:hash(record.raw)===record.receipt.sha256}});
    }
    if(p==='/api/phase-events')return send(res,200,phases.events(Object.fromEntries(q)));
    if(p==='/api/instrument-export'){
      const record=instruments.get(q.get('id')),{id,...body}=record;
      if(record.kind==='correction'){if(q.get('raw')==='1')throw new Error('Use the linked raw recording or StationXML export');const source=instruments.get(record.query.waveformId,'waveform'),response=instruments.get(record.query.responseId,'response'),{id:sourceId,...sourceBody}=source,{id:responseId,...responseBody}=response;res.setHeader('Content-Disposition','attachment; filename="seismosphere-corrected-waveform.json"');return send(res,200,{record,source,response,integrity:{recordValid:hash(body)===id,sourceRecordValid:hash(sourceBody)===sourceId,sourceValid:instrumentSourceValid(source),responseRecordValid:hash(responseBody)===responseId,responseSourceValid:instrumentSourceValid(response)}});}
      if(['spectrum','phase'].includes(record.kind)){if(q.get('raw')==='1')throw new Error('Use the linked original source export');const {source,response,rawSource}=instruments.sources(record),valid=r=>{const {id,...body}=r;return hash(body)===id;};res.setHeader('Content-Disposition',`attachment; filename="seismosphere-${record.kind}.json"`);return send(res,200,{record,source,...(record.kind==='phase'?{parents:phases.history(record)}:{}),...(rawSource?{rawSource,response,...(record.kind==='spectrum'?{rawSampleMapping:rawSampleMapping(record,source)}:{})}:{}),integrity:{recordValid:valid(record),sourceRecordValid:valid(source),sourceValid:rawSource?valid(source):instrumentSourceValid(source),...(rawSource?{rawSourceRecordValid:valid(rawSource),rawSourceValid:instrumentSourceValid(rawSource),responseRecordValid:valid(response),responseSourceValid:instrumentSourceValid(response)}:{})}});}
      if(q.get('raw')==='1'){const binary=record.rawEncoding==='base64';res.writeHead(200,{'Content-Type':binary?(record.kind==='response'?'application/xml':'application/octet-stream'):'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="seismosphere-${record.kind}-${id.slice(0,12)}.${binary?(record.kind==='response'?'xml':'seedlink'):'txt'}"`});return res.end(binary?Buffer.from(record.raw,'base64'):record.raw);}
      res.setHeader('Content-Disposition','attachment; filename="seismosphere-instrument.json"');return send(res,200,{record,integrity:{recordValid:hash(body)===id,sourceValid:instrumentSourceValid(record)}});
    }
    if(p==='/api/diagnostic-export'){const row=store.db.prepare('SELECT body FROM catalog_diagnostics WHERE id=?').get(q.get('id'));if(!row)return send(res,404,{error:'Saved catalog diagnostic not found'});const report=JSON.parse(row.body),snapshot=JSON.parse(store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(report.inputSnapshotId).body);res.setHeader('Content-Disposition','attachment; filename="seismosphere-catalog-diagnostic.json"');return send(res,200,{report,snapshot:{id:report.inputSnapshotId,...snapshot},snapshotValid:hash(snapshot)===report.inputSnapshotId});}
    if(p==='/api/learned-export'){res.setHeader('Content-Disposition','attachment; filename="seismosphere-learned-model.json"');return send(res,200,learned.export(q.get('id')));}
    if(p==='/api/ledger'){const basis=q.get('basis')??'latest';if(!['original','latest'].includes(basis))throw new Error('Choose original or latest assessments');const forecasts=resolutionReviews.attach(store.ledger());return send(res,200,{forecasts,integrity:store.verify(),reviewIntegrity:resolutionReviews.verify(),reviewError:store.get('resolution-review-error',null),basis,leaderboard:leaderboard(forecasts.map(f=>({...f,resolution:basis==='latest'?f.latestResolution:f.resolution})))});}
    if(p==='/api/resolution-history')return send(res,200,{...resolutionReviews.history(q.get('forecastId')),integrity:resolutionReviews.verify(q.get('forecastId'))});
    if(p==='/api/resolution-review-export'){const payload=resolutionReviews.export(q.get('id'));res.setHeader('Content-Disposition','attachment; filename=seismosphere-resolution-review.json');return send(res,200,payload);}
    if(p==='/api/resolution-reproduce')return send(res,200,resolutionReviews.reproduce(q.get('id')));
    if(p==='/api/protocols')return send(res,200,{protocols:prospective.list(),runtimeError:prospective.lastError});
    if(p==='/api/protocol')return send(res,200,prospective.view(q.get('id')));
    if(p==='/api/protocol-export'){res.setHeader('Content-Disposition','attachment; filename=seismosphere-prospective-experiment.json');return send(res,200,prospective.export(q.get('id')));}
    if(p==='/api/experiments')return send(res,200,{experiments:store.experiments()});
    if(p==='/api/catalog-quarantine')return send(res,200,{records:Object.values(store.get('deletionQuarantine',{})),policy:'No event is deleted based on an unidentified provider record. Manual/provider reconciliation is required.'});
    if(p==='/api/statistical-runs'){const family=q.get('family'),pattern=family==='spatial'?'rectangular-gaussian-spatial-etas-%':family==='temporal'?'regional-temporal-etas-%':'%';return send(res,200,{fitting:fittingETAS,runs:store.db.prepare("SELECT body FROM statistical_runs WHERE json_extract(body,'$.fit.version') LIKE ? ORDER BY created_at DESC LIMIT 20").all(pattern).map(r=>JSON.parse(r.body))});}
    if(p==='/api/statistical-export'){
      const row=store.db.prepare('SELECT body FROM statistical_runs WHERE id=?').get(q.get('id'));if(!row)return send(res,404,{error:'Saved statistical run not found'});
      const run=JSON.parse(row.body),snapshots=[run.trainingSnapshotId,run.outcomeSnapshotId].filter(Boolean).map(id=>({id,...JSON.parse(store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(id).body)}));
      res.setHeader('Content-Disposition','attachment; filename="seismosphere-etas-'+run.id.slice(0,12)+'.json"');return send(res,200,{run,snapshots});
    }
    if(p==='/api/export'){const payload={exportedAt:new Date().toISOString(),forecasts:resolutionReviews.attach(store.ledger()),integrity:store.verify(),resolutionReviews:store.db.prepare('SELECT id,body FROM resolution_reviews ORDER BY seq').all().map(r=>({id:r.id,...JSON.parse(r.body)})),reviewIntegrity:resolutionReviews.verify(),snapshots:store.db.prepare('SELECT id,body FROM snapshots').all().map(s=>({id:s.id,...JSON.parse(s.body)})),config,routes};res.setHeader('Content-Disposition','attachment; filename="seismosphere-ledger.json"');return send(res,200,payload);}
    if(p==='/api/snapshot'){const record=store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(q.get('id'));return record?send(res,200,JSON.parse(record.body)):send(res,404,{error:'Snapshot not found'});}
    if(req.method==='POST'){
      if(p==='/api/transcribe')return send(res,200,await speech.transcribe(await body(req,1500000)));
      if(p==='/api/weekly-volcanoes-refresh'){await body(req);const result=await weeklyVolcanoes.refresh({force:true});broadcast({type:'weekly-volcanoes'});return send(res,200,result);}
      if(p==='/api/volcano-status-refresh'){await body(req);const result=await volcanoStatus.refresh({force:true});broadcast({type:'volcano-status'});return send(res,200,result);}
      const b=await body(req);
      if(p==='/api/routes-preview')return send(res,200,{network:validateRoutes(b.network)});
      if(p==='/api/routes-save'){routes=routeHistory.save(b);cache=null;broadcast({type:'routes'});return send(res,200,{network:routes,versions:routeHistory.list()});}
      if(p==='/api/protocol-preview')return send(res,200,prospective.preview(b,config,routes,boundaries));
      if(p==='/api/protocol-register'){const result=prospective.register(b,config,routes,boundaries);broadcast({type:'protocol'});return send(res,200,result);}
      if(p==='/api/protocol-stop'){const result=prospective.stop(b.id);broadcast({type:'protocol'});return send(res,200,result);}
      if(p==='/api/protocol-check'){const result=prospective.tick(feed);if(result.changes)broadcast({type:'protocol'});return send(res,200,result);}
      if(p==='/api/completeness'){
        if(fittingETAS)return send(res,409,{error:'A statistical analysis is already running'});
        const options=completenessOptions({...b,provider:b.provider??config.catalogProvider});
        if(!coverageComplete(store.get('coverage',[]),options))throw new Error('Import the complete date range and region at the chosen retrieval floor before assessing completeness');
        const events=store.events({provider:options.provider,start:options.start,asOf:options.end}).filter(e=>e.time<options.end&&e.type==='earthquake'&&e.mag>=options.minMagnitude&&insideBounds(e,options.bounds)),id=hash({version:COMPLETENESS_VERSION,options,events});
        const existing=store.db.prepare('SELECT body FROM catalog_diagnostics WHERE id=?').get(id);if(existing)return send(res,200,{...JSON.parse(existing.body),reused:true});
        fittingETAS=true;try{const result=await runStatistical({events,options},'completeness'),inputSnapshotId=store.snapshot(events,options.end,'catalog-completeness-revised'),report={...result,id,createdAt:Date.now(),inputSnapshotId,catalogMode:'revised-catalog diagnostic'};store.db.prepare('INSERT INTO catalog_diagnostics VALUES(?,?,?)').run(id,report.createdAt,JSON.stringify(report));return send(res,200,report);}finally{fittingETAS=false;}
      }
      if(p==='/api/stations-query')return send(res,200,await instruments.stations(b));
      if(p==='/api/mechanism-query')return send(res,200,await mechanisms.query(b));
      if(p==='/api/waveform-query')return send(res,200,await instruments.waveform(b));
      if(p==='/api/station-stream-start')return send(res,200,seedlink.start(b));
      if(p==='/api/station-stream-stop')return send(res,200,seedlink.stop());
      if(p==='/api/station-stream-capture')return send(res,200,seedlink.capture());
      if(p==='/api/waveform-response')return send(res,200,await instruments.response(b));
      if(p==='/api/waveform-correct')return send(res,200,await instruments.correct(b));
      if(p==='/api/waveform-phases')return send(res,200,await phases.calculate(b));
      if(p==='/api/waveform-picks')return send(res,200,phases.annotate(b));
      if(p==='/api/waveform-spectrum')return send(res,200,await instruments.spectrum(b));
      if(p==='/api/learned-train')return send(res,200,await learned.train());
      if(p==='/api/learned-predict')return send(res,200,await learned.predict(b.id,Date.parse(b.cutoff),b.mode??'catalog-replay'));
      if(p==='/api/import-control')return send(res,200,importJobs.control(String(b.id??''),b.action));
      if(p==='/api/system/set-startup'){if(typeof b.enabled!=='boolean')throw new Error('A boolean startup preference is required');return send(res,200,await startupSetting(b.enabled?'Enable':'Disable'));}
      if(p==='/api/system/shutdown'){send(res,200,{stopping:true});setTimeout(shutdown,100);return;}
      if(p==='/api/sharing/prepare')return send(res,200,{certificate:await access.prepare(String(b.host??''))});
      if(p==='/api/sharing/prepare-rotation')return send(res,200,await access.prepareRotation(String(b.host??'')));
      if(p==='/api/sharing/cancel-rotation')return send(res,200,await access.cancelRotation());
      if(p==='/api/sharing/activate-rotation'){if(b.acknowledge!==true)throw new Error('Confirm that devices must install the new trust certificate and pair again');return send(res,200,await access.activateRotation(String(b.id??''),String(b.fingerprint??'')));}
      if(p==='/api/sharing/enable'){await access.start(handler,{...access.settings,host:String(b.host??access.settings.host)});return send(res,200,access.info());}
      if(p==='/api/sharing/disable'){await access.stop();return send(res,200,access.info());}
      if(p==='/api/sharing/invite')return send(res,200,access.invite(b.role??'controller'));
      if(p==='/api/sharing/revoke'){access.revoke(String(b.id??''));return send(res,200,access.info());}
      if(p==='/api/refresh'){await refresh();return send(res,200,feed);}
      if(p==='/api/etas-fit'||p==='/api/spatial-etas-fit'){
        if(fittingETAS)return send(res,409,{error:'A statistical fit is already running'});
        const spatial=p==='/api/spatial-etas-fit';
        const options={start:Date.parse(b.start),end:Date.parse(b.end),historyDays:Number(b.historyDays??5),minMagnitude:Number(b.minMagnitude??4.5),provider:config.catalogProvider,...(spatial?{south:Number(b.south),north:Number(b.north),west:Number(b.west),east:Number(b.east)}:{lat:Number(b.lat),lon:Number(b.lon),radiusKm:Number(b.radiusKm??1000)})};
        const holdoutEnd=b.holdoutEnd?Date.parse(b.holdoutEnd):null;
        if(!Number.isFinite(options.start)||!Number.isFinite(options.end)||options.end>Date.now()||holdoutEnd!==null&&(!Number.isFinite(holdoutEnd)||holdoutEnd<=options.end||holdoutEnd>Date.now()))throw new Error('Choose valid elapsed training and holdout dates');
        const coverage=store.get('coverage',[]);
        if(!coverageComplete(coverage,{provider:options.provider,start:options.start-options.historyDays*DAY,end:holdoutEnd??options.end,minMagnitude:options.minMagnitude,bounds:spatial?validateBounds(options):circleBounds(options.lat,options.lon,options.radiusKm)}))throw new Error('Import the full conditioning, training and holdout interval and region at this magnitude threshold first');
        const events=store.events({asOf:holdoutEnd??options.end,provider:options.provider,start:options.start-options.historyDays*DAY});
        const id=hash({version:spatial?SPATIAL_ETAS_VERSION:ETAS_VERSION,options,holdoutEnd,events});
        const existing=store.db.prepare('SELECT body FROM statistical_runs WHERE id=?').get(id);
        if(existing)return send(res,200,{...JSON.parse(existing.body),reused:true});
        fittingETAS=true;
        try{
          const result=await runStatistical({events,options,holdoutEnd},spatial?'spatial':'etas');
          const trainingSnapshotId=store.snapshot(events.filter(e=>e.time<=options.end),options.end,spatial?'spatial-etas-training':'regional-temporal-etas-training');
          const outcomeSnapshotId=holdoutEnd?store.snapshot(events.filter(e=>e.time>options.end),holdoutEnd,spatial?'spatial-etas-holdout':'regional-temporal-etas-holdout'):null;
          const report={id,createdAt:Date.now(),trainingSnapshotId,outcomeSnapshotId,catalogMode:'revised-catalog hindcast',...result};
          store.db.prepare('INSERT INTO statistical_runs VALUES(?,?,?)').run(id,report.createdAt,JSON.stringify(report));
          return send(res,200,report);
        }finally{fittingETAS=false;}
      }
      if(p==='/api/config'){config=validateConfig({...config,...b,rules:{...config.rules,...b.rules}});store.set('config',config);cache=null;return send(res,200,config);}
      if(p==='/api/issue'){const mode=b.mode==='hindcast'?'hindcast':'prospective';const draft=drafts.get(b.analysisId);if(!draft)throw new Error('Preview expired. Refresh the live analysis before freezing.');return send(res,200,{issued:issueAnalysis(draft.analysis,mode,b.includeBaselines!==false,b.keys??null)});}
      if(p==='/api/resolve')return send(res,200,resolveExpired(b.forecastId??null));
      if(p==='/api/midpoint'){
        const asOf=Number(b.asOf??Date.now());if(!Number.isFinite(asOf))throw new Error('Invalid cutoff');
        const events=researchEvents({asOf,strict:b.mode==='strict'}),a=events.find(e=>e.id===b.a),c=events.find(e=>e.id===b.b);
        if(!a||!c||a.id===c.id)throw new Error('Select two distinct observed events at the current cutoff');
        const route=b.routeId?routes.routes.find(r=>r.id===b.routeId):null;
        return send(res,200,{a,b:c,midpoint:midpoint(a,c),distanceKm:distance(a,c),routeMidpoint:route?pathMidpoint(route.points):null,method:'Great-circle midpoint on a spherical Earth (mean radius 6371.0088 km). Geometry alone is not a forecast.'});
      }
      if(p==='/api/import'){
        return send(res,202,importJobs.create(b));
      }
      if(p==='/api/gnss-refresh')return send(res,200,await gnss.refresh(b.frame));
      if(p==='/api/randomization-control')return send(res,200,await randomizations.control(String(b.id??''),b.action));
      if(p==='/api/randomization-run'){
        const options=randomizationOptions(b),begin=options.start-config.lookbackDays*DAY,coverage=store.get('coverage',[]);
        if(!coverageComplete(coverage,{provider:config.catalogProvider,start:begin,end:options.end,minMagnitude:Number(Math.max(0,config.minMagnitude-config.magnitudeTolerance-(config.magnitudeMode==='analogue'?1:0)).toFixed(2))-.5}))throw new Error('Import complete conditioning and outcome coverage, including the partial-hit magnitude range, before randomizing.');
        return send(res,202,randomizations.create(researchEvents({asOf:options.end}),options,config,routes,boundaries,coverage.filter(c=>c.provider===config.catalogProvider&&c.end>=begin&&c.start<=options.end)));
      }
      if(p==='/api/backtest'){
        const start=Date.parse(b.start),end=Date.parse(b.end),stepDays=Number(b.stepDays??5);
        if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(stepDays))throw new Error('Invalid backtest dates or step');
        const coverage=store.get('coverage',[]);
        if(!coverageComplete(coverage,{provider:config.catalogProvider,start:start-config.lookbackDays*DAY,end,minMagnitude:Number(Math.max(0,config.minMagnitude-config.magnitudeTolerance-(config.magnitudeMode==='analogue'?1:0)).toFixed(2))-.5}))throw new Error(`Import complete ${config.catalogProvider} training and outcome coverage including the partial-hit magnitude range before backtesting`);
        const events=researchEvents({asOf:end});
        const experimentId=hash({start,end,stepDays,config,routes,events});
        const previous=store.experiment(experimentId);if(previous)return send(res,200,{...previous,reused:true});
        const result=backtest(events,start,end,config,routes,boundaries,stepDays);
        const forecastIds=[],snapshotIds=new Map();
        for(const trial of result.trials){
          if(!snapshotIds.has(trial.asOf))snapshotIds.set(trial.asOf,store.snapshot(events.filter(e=>e.time<=trial.asOf),trial.asOf,'hindcast'));
          const {resolution,...prediction}=trial;
          const [f]=store.issue([prediction],{snapshotId:snapshotIds.get(trial.asOf),config,routeConfig:routes,mode:'hindcast',experimentId,issuedAt:Date.now(),status:'ISSUED'});
          if(resolution)store.resolve(f.id,resolution);forecastIds.push(f.id);
        }
        const {trials,...summary}=result;
        const report={...summary,experimentId,forecastIds,config,routeVersion:routes.version,createdAt:Date.now()};
        store.saveExperiment(experimentId,report);store.set('lastBacktest',report);resolveExpired();broadcast({type:'ledger',count:forecastIds.length});
        return send(res,200,report);
      }
      if(p==='/api/analogues'){const asOf=Number(b.asOf??Date.now());const events=researchEvents({asOf,strict:b.mode==='strict'});const source=events.find(e=>e.id===b.eventId);if(!source)throw new Error('Select a catalog event first');return send(res,200,{source,matches:analogues(source,events,asOf,config.radiusKm,config.windowDays),method:'Magnitude/depth source similarity with fully elapsed local outcome windows; not a trained graph neural network'});}
      if(p==='/api/neural-analogues'){
        const asOf=Number(b.asOf??Date.now());if(!Number.isFinite(asOf)||asOf>Date.now()+60000)throw new Error('Invalid cutoff');
        const events=researchEvents({asOf,strict:b.mode==='strict'}),source=events.find(e=>e.id===b.eventId);
        if(!source)throw new Error('Select a catalog event at the current cutoff first');
        return send(res,200,await neuralAnalogues(source,events,asOf,store,config));
      }
      if(p==='/api/chat'){
        if(aiBusy)return send(res,409,{error:'The AI is answering another question'});if(typeof b.message!=='string'||b.message.length>6000)throw new Error('Question must be at most 6000 characters');
        aiBusy=true;
        try{
          let asOf=Number(b.asOf??Date.now());if(!Number.isFinite(asOf)||asOf>Date.now()+60000)throw new Error('Invalid analysis time');
          if(b.randomizationRunId&&['analysisId','forecastId','learnedRunId','statisticalRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId'].some(k=>b[k]))throw new Error('Choose the randomization run alone to explain.');
          if(b.cratonId&&['analysisId','forecastId','learnedRunId','statisticalRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','gnssRecordId'].some(k=>b[k]))throw new Error('Choose the craton reference alone to explain.');
          if(Boolean(b.gnssRecordId)!==Boolean(b.gnssStationId))throw new Error('Choose both a saved GNSS solution and its station.');
          if(b.gnssRecordId&&['analysisId','forecastId','learnedRunId','statisticalRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId'].some(k=>b[k]))throw new Error('Choose the GNSS station alone to explain.');
          if(b.volcanoStatusId&&['analysisId','forecastId','learnedRunId','statisticalRunId','randomizationRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId','gnssStationId','reliefPoint','slabPoint','eventId'].some(k=>b[k]))throw new Error('Choose the volcano status alone to explain.');
          if(b.resolutionReviewId&&['weeklyVolcanoId','weeklyReportId','volcanoStatusId','volcanoStatusCode','analysisId','forecastId','learnedRunId','statisticalRunId','randomizationRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId','gnssStationId','reliefPoint','slabPoint','slabRegion','eventId'].some(k=>b[k]))throw new Error('Choose the saved resolution review alone to explain.');
          if(Boolean(b.weeklyVolcanoId)!==Boolean(b.weeklyReportId))throw new Error('Choose a saved weekly publication and report together.');
          if(b.weeklyVolcanoId&&['volcanoStatusId','volcanoStatusCode','analysisId','forecastId','learnedRunId','statisticalRunId','randomizationRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId','gnssStationId','reliefPoint','slabPoint','slabRegion','eventId'].some(k=>b[k]))throw new Error('Choose the weekly report alone to explain.');
          if(Boolean(b.volcanoStatusId)!==Boolean(b.volcanoStatusCode))throw new Error('Choose a saved status and volcano together.');
          if(b.slabPoint&&['analysisId','forecastId','learnedRunId','statisticalRunId','randomizationRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId','gnssStationId','reliefPoint'].some(k=>b[k]))throw new Error('Choose the Slab2 sample alone to explain.');
          if(Boolean(b.slabPoint)!==Boolean(b.slabRegion))throw new Error('Choose a Slab2 region and source point together.');
          if(b.reliefPoint&&['analysisId','forecastId','learnedRunId','statisticalRunId','randomizationRunId','diagnosticRunId','instrumentRecordId','mechanismRecordId','volcanoId','cratonId','gnssRecordId','gnssStationId'].some(k=>b[k]))throw new Error('Choose the relief sample alone to explain.');
          const frozen=b.forecastId?store.ledger().find(f=>f.id===b.forecastId):null;
          if(b.forecastId&&!frozen)throw new Error('Frozen forecast not found');
          let context;
          if(b.spatialQuestion){const spatial=spatialQuestion(b,drafts.get(b.analysisId));context=spatial.context;b.message=spatial.message;}else if(b.protocolId||b.resolutionReviewId||b.weeklyVolcanoId||b.volcanoStatusId||b.slabPoint||b.reliefPoint||b.gnssRecordId||b.cratonId||b.randomizationRunId||b.diagnosticRunId||b.instrumentRecordId||b.mechanismRecordId||b.volcanoId){context={asOf,mode:b.mode??'catalog-replay'};}else if(frozen){
            asOf=frozen.asOf;
            context={asOf,mode:frozen.mode,selected:frozen,candidates:[frozen],routeStatus:frozen.routeConfig.status,limitations:['Explain the frozen reasoning; do not use later earthquake knowledge.']};
            delete context.selected.resolution;
          }else{
            const a=(b.analysisId?drafts.get(b.analysisId)?.analysis:null)??analysisAt(asOf,b.mode??'catalog-replay');
            const draft=drafts.get(a.analysisId);
            asOf=a.asOf;const selected=a.candidates.find(c=>c.key===b.selectedKey)??null;
            const selectedEvent=b.eventId?draft.events.find(e=>e.id===b.eventId):null;
            if(b.eventId&&!selectedEvent)throw new Error('Selected event is unavailable in this analysis snapshot. Refresh and select it again.');
            context={asOf,mode:draft.mode,stats:a.stats,candidates:a.candidates.slice(0,3),selected,selectedEvent,limitations:a.limitations,routeStatus:a.routeStatus,eventView:commandEventView(b.message,draft.events,asOf)};
            if(/fault|geolog|tectonic/i.test(b.message))context.geologicalReference=await faultContext(selectedEvent,asOf);
          }
          if(b.statisticalRunId){
            const row=store.db.prepare('SELECT body FROM statistical_runs WHERE id=?').get(String(b.statisticalRunId));if(!row)throw new Error('Statistical run not found');
            const report=JSON.parse(row.body);if(!report.fit.version.startsWith('rectangular-gaussian-spatial-etas-'))throw new Error('Select a spatial statistical run');
            if(context.mode==='strict'&&report.createdAt>context.asOf)throw new Error('This statistical run was not available at the strict observation cutoff. Open its revised-catalog replay to inspect it.');
            context.statisticalModel=statisticalContext(report,context.asOf,Number(b.horizonDays??7));context.candidates=[];context.selected=null;
          }
          if(b.learnedRunId){
            const {report,projection}=await learned.predict(b.learnedRunId,context.asOf,context.mode==='strict'?'strict':'catalog-replay');
            context.learnedModel=learnedContext(report,projection,context.asOf,context.mode);context.candidates=[];context.selected=null;
          }
          if(b.randomizationRunId){
            context={asOf,mode:b.mode??'catalog-replay',randomization:randomizationContext(randomizations.report(String(b.randomizationRunId)),asOf,b.mode??'catalog-replay'),candidates:[],selected:null};
          }
          if(b.diagnosticRunId){
            if(b.forecastId||b.learnedRunId||b.statisticalRunId)throw new Error('Choose one diagnostic or model to explain');
            const row=store.db.prepare('SELECT body FROM catalog_diagnostics WHERE id=?').get(String(b.diagnosticRunId));if(!row)throw new Error('Catalog diagnostic not found');
            context={asOf,mode:b.mode??'catalog-replay',catalogDiagnostic:completenessContext(JSON.parse(row.body),asOf,b.mode??'catalog-replay',b.diagnosticSample??'pooled'),candidates:[],selected:null};
          }
          if(b.instrumentRecordId){
            if(b.forecastId||b.learnedRunId||b.statisticalRunId||b.diagnosticRunId)throw new Error('Choose one waveform or model to explain');
            const record=instruments.get(b.instrumentRecordId);context={asOf,mode:b.mode??'catalog-replay',...(record.kind==='phase'?{phaseEvidence:phases.context(record,asOf,b.mode??'catalog-replay')}:{waveformEvidence:instruments.context(record,asOf,b.mode??'catalog-replay')}),candidates:[],selected:null};
          }
          if(b.mechanismRecordId){
            if(b.forecastId||b.learnedRunId||b.statisticalRunId||b.diagnosticRunId||b.instrumentRecordId)throw new Error('Choose one mechanism or other evidence source to explain');
            context={asOf,mode:b.mode??'catalog-replay',mechanismEvidence:mechanismContext(mechanisms.get(b.mechanismRecordId),b.mechanismProductId,asOf,b.mode??'catalog-replay'),candidates:[],selected:null};
          }
          if(b.resolutionReviewId){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid resolution review mode');context={asOf,mode:b.mode??'catalog-replay',resolutionReviewEvidence:resolutionReviewEvidence(resolutionReviews.export(b.resolutionReviewId),asOf),candidates:[],selected:null};}
          if(b.weeklyVolcanoId){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid weekly report replay mode');context={asOf,mode:b.mode??'catalog-replay',weeklyVolcanoEvidence:weeklyVolcanoEvidence(weeklyVolcanoes.view(asOf,b.weeklyVolcanoId),b.weeklyReportId,asOf),candidates:[],selected:null};}
          if(b.volcanoStatusId){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid volcano status replay mode');context={asOf,mode:b.mode??'catalog-replay',volcanoStatusEvidence:volcanoStatusEvidence(volcanoStatus.view(asOf,b.volcanoStatusId),b.volcanoStatusCode,asOf),candidates:[],selected:null};}
          if(b.slabPoint){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid replay mode');const evidence=await slabSample(b.slabRegion,b.slabPoint,asOf);if(b.slabSha!==evidence.provenance.grid.sha256)throw new Error('Slab2 source changed; reload the source inspector.');context={asOf,mode:b.mode??'catalog-replay',slabEvidence:evidence,candidates:[],selected:null};}
          if(b.reliefPoint){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid replay mode');const data=await reliefDataset();if(b.reliefSha!==data.metadata.sha256)throw new Error('Relief source changed; reload the source inspector.');context={asOf,mode:b.mode??'catalog-replay',reliefEvidence:reliefEvidence(data,b.reliefPoint,asOf),candidates:[],selected:null};}
          if(b.gnssRecordId){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid replay mode');context={asOf,mode:b.mode??'catalog-replay',gnssEvidence:gnssEvidence(gnss.get(String(b.gnssRecordId)),String(b.gnssStationId),asOf),candidates:[],selected:null};}
          if(b.cratonId){if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid replay mode');context={asOf,mode:b.mode??'catalog-replay',cratonEvidence:cratonEvidence(await cratonDataset(),String(b.cratonId),asOf),candidates:[],selected:null};}
          if(b.volcanoId){
            if(b.forecastId||b.learnedRunId||b.statisticalRunId||b.diagnosticRunId||b.instrumentRecordId||b.mechanismRecordId)throw new Error('Choose one volcano reference or other evidence source to explain');
            if(!['strict','catalog-replay'].includes(b.mode??'catalog-replay'))throw new Error('Invalid volcano replay mode');
            const event=b.eventId?researchEvents({asOf,strict:b.mode==='strict'}).find(e=>e.id===b.eventId):null;if(b.eventId&&!event)throw new Error('Selected earthquake is unavailable at this cutoff');
            const {data,sha256}=await volcanoDataset();context={asOf,mode:b.mode??'catalog-replay',volcanoEvidence:{...volcanoEvidence(data,{id:b.volcanoId,event,asOf}),datasetSha256:sha256},candidates:[],selected:null};
          }
          if(b.protocolId){if(Object.keys(b).some(k=>!['protocolId','message','asOf','mode'].includes(k)))throw new Error('Choose the prospective protocol alone to explain');context={asOf,mode:b.mode??'catalog-replay',prospectiveExperiment:prospectiveContext(prospective.view(b.protocolId),asOf),candidates:[],selected:null};}
          const result=await chat(b.message,context,b.spatialQuestion&&b.brain?{...config,aiProvider:b.brain==='astra'?'codex':'ollama'}:config);
          if(b.spatialQuestion)result.notice='Explanation of the selected retained analysis snapshot. Spatial model watches are unissued drafts; no UI actions are applied.';
          store.db.prepare('INSERT INTO conversations VALUES(?,?,?)').run(crypto.randomUUID(),Date.now(),JSON.stringify({question:b.message,result,asOf,evidenceContext:context}));
          return send(res,200,result);
        }finally{aiBusy=false;}
      }
      return send(res,404,{error:'Unknown operation'});
    }
    if(p.startsWith('/api/'))return send(res,404,{error:'Unknown endpoint'});
    const root=path.resolve('public'),file=path.resolve(root,'.'+decodeURIComponent(p==='/'?'/index.html':p));
    if(!file.startsWith(root+path.sep)||!existsSync(file))return send(res,404,{error:'File not found'});
    const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':p.includes('/assets/')||p.includes('/vendor/')?'public, max-age=86400':'no-cache'});createReadStream(file).pipe(res);
  }catch(e){console.error(e.message);if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
};
const server=http.createServer(handler);
server.listen(port,'127.0.0.1',()=>{console.log(`SeismoSphere running at http://127.0.0.1:${port}`);if(!process.env.SEISMO_TEST_MODE){importJobs.kick();refresh();weeklyVolcanoes.refresh().then(()=>broadcast({type:'weekly-volcanoes'})).catch(e=>{console.error(e.message);broadcast({type:'weekly-volcanoes'});});volcanoStatus.refresh().then(()=>broadcast({type:'volcano-status'})).catch(e=>{console.error(e.message);broadcast({type:'volcano-status'});});if(access.settings.enabled)access.start(handler).catch(e=>{access.lastError=e.message;console.error('Phone access: '+e.message);});}});
const interval=setInterval(()=>{if(!process.env.SEISMO_TEST_MODE){refresh();weeklyVolcanoes.refresh().then(()=>broadcast({type:'weekly-volcanoes'})).catch(e=>{console.error(e.message);broadcast({type:'weekly-volcanoes'});});volcanoStatus.refresh().then(()=>broadcast({type:'volcano-status'})).catch(e=>{console.error(e.message);broadcast({type:'volcano-status'});});}},5*60000);interval.unref();
const protocolInterval=setInterval(()=>{if(!process.env.SEISMO_TEST_MODE)try{const result=prospective.tick(feed);if(result.changes)broadcast({type:'protocol'});}catch(e){console.error('Prospective schedule: '+e.message);}},30000);protocolInterval.unref();
let closing=false;
function shutdown(){if(closing)return;closing=true;clearInterval(interval);clearInterval(protocolInterval);clearTimeout(reviewTimer);learned.close();speech.close();const importsStopped=Promise.all([seedlink.close(),closeResponseWorkers(),importJobs.shutdown(),randomizations.shutdown(),gnss.shutdown(),volcanoStatus.shutdown(),weeklyVolcanoes.shutdown()]);access.close();for(const client of clients)client.end();server.close(async()=>{await importsStopped;store.close();process.exit(0);});server.closeAllConnections();setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
