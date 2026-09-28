import {readFileSync} from 'node:fs';
import {hash} from './store.mjs';
const DAY=86400000,GRACE=300000;
export class CountSchedules{
 constructor(store,counts){this.store=store;this.counts=counts;this.running=false;this.lastError=null;this.source=Object.fromEntries(['server/count-schedules.mjs','server/learned.mjs','model/seismic_gnn.py'].map(p=>[p,readFileSync(p,'utf8')]));this.runtimeHash=hash({source:this.source,scoring:counts.scoringHash,node:process.version});store.db.exec(`CREATE TABLE IF NOT EXISTS count_plans(id TEXT PRIMARY KEY,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS count_plan_slots(plan_id TEXT REFERENCES count_plans(id),ordinal INTEGER,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(plan_id,ordinal));`);
 for(const table of ['count_plans','count_plan_slots'])for(const op of ['UPDATE','DELETE'])store.db.exec(`CREATE TRIGGER IF NOT EXISTS frozen_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Count schedules are immutable'); END;`);}
 preview(input){
  const start=Date.parse(input.start),issuances=Number(input.issuances),stepDays=Number(input.stepDays),name=String(input.name??'').trim();
  if(!name||name.length>120||!Number.isFinite(start)||start<Date.now()+120000||start>Date.now()+365*DAY||!Number.isInteger(issuances)||issuances<1||issuances>52||![7,14,30].includes(stepDays)||(issuances-1)*stepDays>365)throw new Error('Choose a name, a start at least two minutes ahead, 1–52 issuances, and a 7/14/30-day cadence spanning at most one year');
  const parent=this.counts.learned.get(input.parentRunId),tectonic=this.counts.learned.tectonic(parent.id);
  if(parent.version!=='equal-area-weekly-gnn-0.2.1'||hash(parent.artifact)!==parent.weightsSha256)throw new Error('A verified six-model inference checkpoint is required');
  const spec={name,start,issuances,stepDays,parentRunId:parent.id,weightsSha256:parent.weightsSha256,tectonicId:tectonic.id,runtimeHash:this.runtimeHash,implementation:this.source,scoringHash:this.counts.scoringHash,graceMs:GRACE,
   policy:'Issue every scheduled slot with strict current-feed inputs. Validity begins after computation, never backdated. Five-minute grace; missed slots stay missing. A model/source change excludes the slot. Host must be running. One-day outcome settlement and five-minute assessment grace.',
   primary:'Paired seven-day Poisson count log likelihood for all six models on the same complete outcome windows. No test-driven refitting or model selection.',limitations:['Seven-day cadence may overlap by issuance-time jitter.','Exclusions and stopping can bias the assessed subset; no significance or independent-trial claim.','Local host clock and hashes, without external timestamp authority.']};return {spec,previewHash:hash(spec)};
 }
 register(input){const prior=this.store.db.prepare('SELECT id FROM count_plans WHERE id=?').get(String(input.previewHash));if(prior)return this.get(prior.id);const {spec,previewHash}=this.preview(input);if(previewHash!==input.previewHash)throw new Error('Schedule changed; review it again');const body={spec,registeredAt:Date.now()};this.store.db.prepare('INSERT INTO count_plans VALUES(?,?)').run(previewHash,JSON.stringify(body));return this.get(previewHash);}
 get(id){const row=this.store.db.prepare('SELECT body FROM count_plans WHERE id=?').get(String(id));if(!row)throw new Error('Count schedule not found');const p=JSON.parse(row.body);if(hash(p.spec)!==id||p.registeredAt>=p.spec.start)throw new Error('Count schedule integrity check failed');const slots=this.store.db.prepare('SELECT id,body FROM count_plan_slots WHERE plan_id=? ORDER BY ordinal').all(id).map(r=>{const b=JSON.parse(r.body);if(hash(b)!==r.id||b.planId!==id)throw new Error('Count slot integrity check failed');return {id:r.id,...b};});return {id,...p,slots,stopped:slots.some(s=>s.ordinal===-1)};}
 list(){return this.store.db.prepare('SELECT id FROM count_plans').all().map(r=>this.get(r.id));}
 append(id,ordinal,body){const b={planId:id,ordinal,recordedAt:Date.now(),...body};this.store.db.prepare('INSERT INTO count_plan_slots VALUES(?,?,?,?)').run(id,ordinal,hash(b),JSON.stringify(b));}
 stop(id){const p=this.get(id);if(!p.stopped)this.append(id,-1,{status:'STOPPED',reason:'Future issuances stopped; existing outcome assessments continue'});return this.get(id);}
 async tick(feed){if(this.running)return {changes:0};this.running=true;let changes=0;this.lastError=null;
  try{for(const p of this.list())for(let ordinal=0;ordinal<p.spec.issuances;ordinal++){
   if(p.slots.some(s=>s.ordinal===ordinal))continue;const due=p.spec.start+ordinal*p.spec.stepDays*DAY,now=Date.now();
   const recovered=this.store.db.prepare("SELECT id FROM count_forecasts WHERE json_extract(body,'$.registration.planId')=? AND json_extract(body,'$.registration.ordinal')=?").get(p.id,ordinal);
   if(recovered){const f=this.counts.get(recovered.id);this.append(p.id,ordinal,{status:'ISSUED',scheduledAt:due,forecastId:f.id,reason:'Recovered durable issuance'});changes++;continue;}
   if(p.stopped){this.append(p.id,ordinal,{status:'CANCELLED',scheduledAt:due});changes++;continue;}
   if(now<due)continue;let status=now>due+GRACE?'MISSED_WINDOW':p.spec.runtimeHash!==this.runtimeHash?'SKIPPED_VERSION':null;
   if(status){this.append(p.id,ordinal,{status,scheduledAt:due});changes++;continue;}
   if(this.counts.busy||feed.status!=='live')continue;
   try{const parent=this.counts.learned.get(p.spec.parentRunId),tectonic=this.counts.learned.tectonic(parent.id);if(hash(parent.artifact)!==p.spec.weightsSha256||tectonic.id!==p.spec.tectonicId)throw new Error('Frozen model evidence changed');
    const f=await this.counts.issue(parent.id,feed,{planId:p.id,ordinal,scheduledAt:due,deadline:due+GRACE});this.append(p.id,ordinal,{status:'ISSUED',scheduledAt:due,forecastId:f.id});changes++;
   }catch(e){this.lastError=e.message;}
  }return {changes};}finally{this.running=false;}
 }
}
