import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {normalize} from './catalog.mjs';
import {DAY,validateBounds,insideBounds,boundsContain} from './geo.mjs';
export class CatalogRequestError extends Error{constructor(message,{retryable=false,split=false,retryAfterMs=0,receipt=null}={}){super(message);Object.assign(this,{retryable,split,retryAfterMs,receipt});}}
export function importOptions(input,now=Date.now()){
  const start=typeof input.start==='number'?input.start:Date.parse(input.start),end=typeof input.end==='number'?input.end:Date.parse(input.end),minMagnitude=Number(input.minMagnitude??4),provider=input.provider??'USGS';
  if(![start,end,minMagnitude].every(Number.isFinite)||start<Date.UTC(1900,0,1)||end>now||start>=end||end-start>50*366*DAY||minMagnitude<0||minMagnitude>9||!['USGS','EMSC'].includes(provider))throw new Error('Choose an elapsed interval from 1900 onward, up to 50 years, M 0–9, and USGS or EMSC.');
  return {start,end,minMagnitude,provider,...(input.bounds!==undefined?{bounds:validateBounds(input.bounds)}:{})};
}
export function coverageComplete(coverage,{provider,start,end,minMagnitude,bounds}){
  // ponytail: each temporal segment needs a containing rectangle; partial spatial tiles are not unioned.
  const intervals=coverage.filter(c=>c.provider===provider&&c.minMagnitude<=minMagnitude&&c.end>=start&&c.start<=end&&boundsContain(c.bounds,bounds)).sort((a,b)=>a.start-b.start);let reached=start;
  for(const c of intervals){if(c.start>reached)return false;reached=Math.max(reached,c.end);if(reached>=end)return true;}return false;
}
export async function fetchImportChunk(options,interval,signal){
  const root=options.provider==='EMSC'?'https://www.seismicportal.eu/fdsnws/event/1/query':'https://earthquake.usgs.gov/fdsnws/event/1/query',params=new URLSearchParams({format:options.provider==='EMSC'?'json':'geojson',starttime:new Date(interval.start).toISOString(),endtime:new Date(interval.end).toISOString(),minmagnitude:String(options.minMagnitude),limit:'20000',orderby:'time-asc'});
  if(options.bounds){const {south,north,west,east}=options.bounds;for(const [key,value]of Object.entries({minlatitude:south,maxlatitude:north,minlongitude:west>east&&west>=0?west-360:west,maxlongitude:west>east&&west<0?east+360:east}))params.set(key,String(value));}
  const url=root+'?'+params;
  let response,text;
  try{
    response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),headers:{'User-Agent':'SeismoSphere/0.2 (local research catalog import)'}});
    // A bounded body also protects against an unexpectedly large/erroring upstream response.
    const reader=response.body?.getReader(),parts=[];let bytes=0;
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>80000000){await reader.cancel();throw new CatalogRequestError('Catalog response exceeded 80 MB; interval will be split',{split:true});}parts.push(value);}
    text=Buffer.concat(parts).toString('utf8');
  }catch(error){if(signal.aborted)throw signal.reason;if(error instanceof CatalogRequestError)throw error;throw new CatalogRequestError(error.message,{retryable:true});}
  const fetchedAt=Date.now(),receipt={url,fetchedAt,httpStatus:response.status,sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)};
  if(!response.ok){const retryAfter=response.headers.get('retry-after'),retryAfterMs=retryAfter===null?0:Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-fetchedAt,split=response.status===400&&/exceed[\s\S]*(?:limit|20000)|maximum[\s\S]*20000/i.test(text);throw new CatalogRequestError(`Catalog HTTP ${response.status}: ${text.slice(0,240).replace(/\s+/g,' ')}`,{retryable:[408,429,500,502,503,504].includes(response.status),split,retryAfterMs:Math.max(0,Math.min(86400000,retryAfterMs||0)),receipt});}
  let data;try{data=response.status===204?{features:[]}:JSON.parse(text);}catch{throw new CatalogRequestError('Invalid catalog JSON',{retryable:true,receipt});}
  if(!Array.isArray(data.features))throw new CatalogRequestError('Catalog response has no feature array',{receipt});
  if(data.features.length>=20000)throw new CatalogRequestError('Catalog result cap reached',{split:true,receipt});
  const events=[],rejected=[];
  for(const feature of data.features){const event=normalize(feature,options.provider);if(!event||event.time<interval.start||event.time>interval.end||event.mag<options.minMagnitude||!insideBounds(event,options.bounds))rejected.push(feature);else events.push(event);}
  if(rejected.length)throw new CatalogRequestError(`${rejected.length} catalog records failed validation; interval is not marked covered`,{receipt:{...receipt,rejected}});
  return {events:[...new Map(events.map(e=>[e.id,e])).values()],receipt:{...receipt,receivedRows:data.features.length}};
}
export class ImportJobs{
  constructor(store,{fetchChunk=fetchImportChunk,onChange=()=>{},onCatalog=()=>{},retryBaseMs=1000,paceMs=500}={}){
    Object.assign(this,{store,fetchChunk,onChange,onCatalog,retryBaseMs,paceMs});this.active=null;this.stopping=false;
    store.db.exec(`CREATE TABLE IF NOT EXISTS catalog_import_jobs(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalog_import_receipts(job_id TEXT,seq INTEGER,body TEXT NOT NULL,PRIMARY KEY(job_id,seq),FOREIGN KEY(job_id) REFERENCES catalog_import_jobs(id));
      CREATE TRIGGER IF NOT EXISTS frozen_import_receipt_update BEFORE UPDATE ON catalog_import_receipts BEGIN SELECT RAISE(ABORT,'Import receipts are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_import_receipt_delete BEFORE DELETE ON catalog_import_receipts BEGIN SELECT RAISE(ABORT,'Import receipts are immutable'); END;`);
    for(const j of this.list())if(['running','retrying','pausing','cancelling'].includes(j.status)){j.status=j.status==='pausing'?'paused':j.status==='cancelling'?'cancelled':'queued';j.message='Recovered after server interruption; completed chunks retained.';this.save(j);}
  }
  list(){return this.store.db.prepare('SELECT body FROM catalog_import_jobs ORDER BY created_at DESC').all().map(r=>JSON.parse(r.body));}
  get(id){const row=this.store.db.prepare('SELECT body FROM catalog_import_jobs WHERE id=?').get(id);if(!row)throw new Error('Import job not found');return JSON.parse(row.body);}
  summary(j){const {pending,...rest}=j;return {...rest,pendingChunks:pending.length,nextInterval:pending[0]??null,progress:j.status==='completed'?1:(j.coveredThrough-j.options.start)/(j.options.end-j.options.start)};}
  summaries(){return this.list().map(j=>this.summary(j));}
  save(j){j.updatedAt=Date.now();this.store.db.prepare('INSERT INTO catalog_import_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(j.id,j.createdAt,JSON.stringify(j));}
  publish(j){this.onChange(this.summary(j));}
  receipts(id){this.get(id);return this.store.db.prepare('SELECT body FROM catalog_import_receipts WHERE job_id=? ORDER BY seq').all(id).map(r=>JSON.parse(r.body));}
  receipt(j,value){const seq=this.store.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next FROM catalog_import_receipts WHERE job_id=?').get(j.id).next;this.store.db.prepare('INSERT INTO catalog_import_receipts VALUES(?,?,?)').run(j.id,seq,JSON.stringify({seq,...value}));j.receipts=seq;}
  create(input){
    if(this.stopping)throw new Error('Server is stopping');const options=importOptions(input),same=this.list().find(j=>JSON.stringify(j.options)===JSON.stringify(options)&&!['cancelled','completed'].includes(j.status));if(same)return {...this.summary(same),reused:true};
    const pending=[];for(let t=options.start;t<options.end;t+=31*DAY)pending.push({start:t,end:Math.min(options.end,t+31*DAY)});
    const j={id:randomUUID(),createdAt:Date.now(),options,status:'queued',pending,coveredThrough:options.start,completedChunks:0,receivedRows:0,newRevisions:0,requests:0,receipts:0,attempt:0,message:'Queued; completed chunks are checkpointed.'};this.save(j);this.publish(j);this.kick();return this.summary(j);
  }
  control(id,action){
    const j=this.get(id);if(!['pause','resume','cancel'].includes(action))throw new Error('Unknown import action');
    if(action==='resume'){
      if(!['paused','failed'].includes(j.status))throw new Error('Only paused or failed imports can resume');j.status='queued';j.attempt=0;j.retryAt=null;j.error=null;j.message='Resuming from the first unfinished chunk.';this.save(j);this.publish(j);this.kick();return this.summary(j);
    }
    if(['completed','cancelled'].includes(j.status))throw new Error('This import has already finished');
    j.status=this.active?.id===id?(action==='pause'?'pausing':'cancelling'):(action==='pause'?'paused':'cancelled');j.message=action==='pause'?'Pausing; completed chunks stay available.':'Cancelling; retained observations are not deleted.';this.save(j);this.publish(j);if(this.active?.id===id)this.active.controller.abort(new Error('Import interrupted by '+action));return this.summary(j);
  }
  // ponytail: one sequential queue respects provider load; per-provider workers only if measured throughput requires them.
  kick(){if(this.active||this.stopping)return;const j=this.list().reverse().find(j=>j.status==='queued');if(!j)return;const controller=new AbortController();this.active={id:j.id,controller,promise:null};this.active.promise=this.run(j.id,controller.signal).finally(()=>{this.active=null;if(!this.stopping)this.kick();});}
  async run(id,signal){
    try{
      while(!signal.aborted){
        let j=this.get(id),interval=j.pending[0];if(!interval){j.status='completed';j.message='All requested intervals were fetched and validated.';this.save(j);this.publish(j);this.onCatalog();return;}
        j.status='running';j.attempt++;j.requests++;j.retryAt=null;j.error=null;j.message=`Fetching ${new Date(interval.start).toISOString().slice(0,10)} → ${new Date(interval.end).toISOString().slice(0,10)} (attempt ${j.attempt}/4)`;this.save(j);this.publish(j);
        try{
          const result=await this.fetchChunk(j.options,interval,signal);signal.throwIfAborted();j=this.get(id);
          this.store.db.exec('BEGIN IMMEDIATE');
          try{
            const inserted=this.store.ingest(result.events,result.receipt.fetchedAt,{transaction:false});this.receipt(j,{success:true,interval,...result.receipt,normalizedEvents:result.events.length,newRevisions:inserted});j.newRevisions+=inserted;j.receivedRows+=result.receipt.receivedRows??result.events.length;j.completedChunks++;j.pending.shift();j.coveredThrough=interval.end;j.attempt=0;
            // One prefix coverage record per job supports downstream checks without thousands of ranges.
            const coverage=this.store.get('coverage',[]).filter(c=>c.importJobId!==id);coverage.push({...j.options,end:j.coveredThrough,importJobId:id,receiptEndpoint:'/api/import-export?id='+id});this.store.set('coverage',coverage);this.save(j);this.store.db.exec('COMMIT');
          }catch(error){this.store.db.exec('ROLLBACK');throw error;}
          this.publish(j);this.onCatalog();if(this.paceMs)await delay(this.paceMs,undefined,{signal});
        }catch(error){
          if(signal.aborted)break;j=this.get(id);if(error.receipt)this.receipt(j,{success:false,interval,error:error.message,...error.receipt});
          if(error.split&&interval.end-interval.start>1000){const middle=Math.floor((interval.start+interval.end)/2);j.pending.splice(0,1,{start:interval.start,end:middle},{start:middle,end:interval.end});j.attempt=0;j.message='Dense interval split into smaller requests; no truncated coverage accepted.';this.save(j);this.publish(j);continue;}
          if(error.retryable&&j.attempt<4){const ms=Math.max(error.retryAfterMs??0,this.retryBaseMs*2**(j.attempt-1));j.status='retrying';j.retryAt=Date.now()+ms;j.error=error.message;j.message='Temporary catalog failure; waiting before retry.';this.save(j);this.publish(j);await delay(ms,undefined,{signal});continue;}
          j.status='failed';j.error=error.message;j.message='Stopped at the first unfinished interval. Inspect receipts, then resume.';this.save(j);this.publish(j);return;
        }
      }
    }catch(error){if(!signal.aborted){const j=this.get(id);j.status='failed';j.error=error.message;this.save(j);this.publish(j);}}
    finally{if(signal.aborted){const j=this.get(id);j.status=j.status==='cancelling'?'cancelled':this.stopping?'queued':'paused';j.retryAt=null;j.message=this.stopping?'Interrupted by server shutdown; will resume on restart.':'Interrupted; completed chunks retained.';this.save(j);this.publish(j);}}
  }
  async shutdown(){this.stopping=true;if(this.active){this.active.controller.abort(new Error('Server shutdown'));await this.active.promise;}}
}
