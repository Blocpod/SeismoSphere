import {readFileSync} from 'node:fs';
import {coverageComplete} from './import-jobs.mjs';
import {tectonicCell} from './tectonic-baseline.mjs';
import {hash} from './store.mjs';
const DAY=86400000;
export function scoreCounts(models,observed){
 const logFactorial=[0];return Object.fromEntries(Object.entries(models).map(([name,cells])=>{let logLikelihood=0,absoluteError=0;for(let i=0;i<72;i++){const y=observed[i],mu=cells[i];while(logFactorial.length<=y)logFactorial.push(logFactorial.at(-1)+Math.log(logFactorial.length));logLikelihood+=y*Math.log(mu)-mu-logFactorial[y];absoluteError+=Math.abs(y-mu);}return [name,{logLikelihood,meanAbsoluteError:absoluteError/72,expectedCount:cells.reduce((a,b)=>a+b,0),events:observed.reduce((a,b)=>a+b,0)}];}));
}
export class CountForecasts{
 constructor(store,learned){this.store=store;this.learned=learned;this.busy=false;this.scoringSource=Object.fromEntries(['count-forecasts','tectonic-baseline','geo','import-jobs','store'].map(n=>[n,readFileSync(new URL('./'+n+'.mjs',import.meta.url),'utf8')]));this.scoringHash=hash(this.scoringSource);store.db.exec(`CREATE TABLE IF NOT EXISTS count_forecasts(id TEXT PRIMARY KEY,issued_at INTEGER NOT NULL,body TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS frozen_count_forecasts_update BEFORE UPDATE ON count_forecasts BEGIN SELECT RAISE(ABORT,'Count forecasts are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS frozen_count_forecasts_delete BEFORE DELETE ON count_forecasts BEGIN SELECT RAISE(ABORT,'Count forecasts are immutable'); END;
 CREATE TABLE IF NOT EXISTS count_assessments(forecast_id TEXT PRIMARY KEY REFERENCES count_forecasts(id),id TEXT NOT NULL,body TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS frozen_count_assessments_update BEFORE UPDATE ON count_assessments BEGIN SELECT RAISE(ABORT,'Count assessments are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS frozen_count_assessments_delete BEFORE DELETE ON count_assessments BEGIN SELECT RAISE(ABORT,'Count assessments are immutable'); END;`);}
 get(id){const row=this.store.db.prepare('SELECT issued_at,body FROM count_forecasts WHERE id=?').get(String(id??''));if(!row)throw new Error('Count forecast not found');const body=JSON.parse(row.body);if(hash(body)!==id||body.issuedAt!==row.issued_at)throw new Error('Count forecast integrity check failed');return {id,...body};}
 list(){return this.store.db.prepare('SELECT id FROM count_forecasts ORDER BY issued_at DESC').all().map(({id})=>{const f=this.get(id),a=this.assessment(id),{snapshot,...assessment}=a??{};return {cohort:hash({registration:f.registration?.planId??null,parent:f.parentRunId,weights:f.weightsSha256??null,scoring:f.scoringHash??null,tectonic:f.tectonicComparison.id??null,grid:f.grid,duration:f.validUntil-f.validFrom,delay:f.assessmentDueAt?f.assessmentDueAt-f.validUntil:null,grace:f.assessmentGraceMs??null}),id,planId:f.registration?.planId??null,issuedAt:f.issuedAt,validUntil:f.validUntil,parentRunId:f.parentRunId,assessmentDueAt:f.assessmentDueAt??null,assessment:a?assessment:null,totals:Object.fromEntries(Object.entries(f.models).map(([k,v])=>[k,v.reduce((a,b)=>a+b,0)]))};});}
 assessment(forecastId){const row=this.store.db.prepare('SELECT id,body FROM count_assessments WHERE forecast_id=?').get(forecastId);if(!row)return null;const b=JSON.parse(row.body);if(hash(b)!==row.id||b.forecastId!==forecastId||b.snapshot&&hash(b.snapshot)!==b.snapshotId)throw new Error('Count assessment integrity check failed');return {id:row.id,...b};}
 tick(feed){let changes=0;for(const {id} of this.store.db.prepare('SELECT f.id FROM count_forecasts f LEFT JOIN count_assessments a ON a.forecast_id=f.id WHERE a.forecast_id IS NULL').all()){
  const f=this.get(id),now=Date.now();if(f.version!=='prospective-count-2'||now<f.assessmentDueAt)continue;
  let status=now>f.assessmentDueAt+f.assessmentGraceMs?'MISSED_ASSESSMENT':f.scoringHash!==this.scoringHash?'SKIPPED_VERSION':null;
  if(!status&&(feed.status!=='live'||![feed.fetchedAt,feed.generated].every(t=>Number.isFinite(t)&&t<=now&&now-t<=900000)))continue;
  const body={forecastId:id,recordedAt:now,status,scoringHash:f.scoringHash};
  if(!status){const coverage=structuredClone(this.store.get('coverage',[])),query={provider:'USGS',start:f.validFrom,end:f.validUntil,minMagnitude:5};body.coverage=coverage;body.coverageQuery=query;body.feedReceipt=structuredClone(feed);
   if(!coverageComplete(coverage,query)){body.status='INCOMPLETE_COVERAGE';}else{
    const events=this.store.events({provider:'USGS',asOf:now,strict:true,start:f.validFrom}).filter(e=>e.type==='earthquake'&&e.mag>=5&&e.time>f.validFrom&&e.time<=f.validUntil),observed=Array(72).fill(0);for(const e of events)observed[tectonicCell(e.lat,e.lon)]++;
    body.snapshotId=this.store.snapshot(events,now,'prospective-count-outcomes');body.snapshot=JSON.parse(this.store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(body.snapshotId).body);body.observed=observed;body.scores=scoreCounts(f.models,observed);body.status='SCORED';
   }
  }
  this.store.db.prepare('INSERT INTO count_assessments VALUES(?,?,?)').run(id,hash(body),JSON.stringify(body));changes++;
 }return {changes};}
 export(id){return {...this.get(id),assessment:this.assessment(id)};}
 async issue(parentRunId,feed,registration=null){
  if(this.busy)throw new Error('A count forecast is being prepared');this.busy=true;
  try{
   const started=Date.now();if(feed.status!=='live'||![feed.fetchedAt,feed.generated].every(t=>Number.isFinite(t)&&t<=started&&started-t<=900000))throw new Error('Refresh the live USGS feed before issuing count forecasts');
   const cutoff=feed.generated,tectonic=this.learned.tectonic(parentRunId);
   if(tectonic.createdAt>cutoff)throw new Error('The tectonic comparison was just prepared after this feed cutoff. Review it and refresh the live catalog before issuing.');
   const inference=await this.learned.predict(parentRunId,cutoff,'strict','ensemble'),p=inference.projection;
   const models={...p.componentCells,ensemble:p.cells,tectonic:tectonic.report.fit.cells};
   if(Object.keys(models).sort().join(',')!=='ensemble,graph,noNeighbors,recentRate,tectonic,trainingMean'||Object.values(models).some(c=>c.length!==72||c.some(v=>!Number.isFinite(v)||v<=0)))throw new Error('All six models must provide 72 positive finite expectations');
   const issuedAt=Date.now();if(issuedAt<cutoff||issuedAt-started>300000||registration&&issuedAt>registration.deadline)throw new Error('Forecast computation exceeded the issuance window');
   const snapshot=this.store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(p.inputSnapshotId);if(!snapshot||hash(JSON.parse(snapshot.body))!==p.inputSnapshotId)throw new Error('Count inference snapshot integrity check failed');
   const body={registration,version:'prospective-count-2',assessmentDueAt:issuedAt+8*DAY,assessmentGraceMs:300000,scoringHash:this.scoringHash,scoringSource:this.scoringSource,assessmentPolicy:'Assess once one day after the seven-day window, within five minutes. Use then-received USGS M>=5 earthquake revisions in (validFrom,validUntil]. Missing coverage, missed timing and changed scoring stay excluded; no backfill.',issuedAt,validFrom:issuedAt,validUntil:issuedAt+7*DAY,inputCutoff:cutoff,parentRunId,models,ensembleWeights:p.ensembleWeights,grid:inference.report.grid,modelVersion:inference.report.version,weightsSha256:inference.report.weightsSha256,trainingSnapshotId:inference.report.inputSnapshotId,inputSnapshotId:p.inputSnapshotId,inputSnapshot:JSON.parse(snapshot.body),tectonicComparison:tectonic,feedReceipt:structuredClone(feed),timing:'Seven-day target window begins at actual issuance after computation; model conditioning ends at the latest feed generation time (inputCutoff), using only revisions received by that time. No backdating.',limitations:[registration?'Scheduled under a frozen count registration; inspect all skipped and cancelled slots.':'Manually initiated issuance; selection may be biased. This is not a preregistered schedule.','Expected broad-cell M≥5 catalog counts, not calibrated probabilities or precise earthquake predictions.','Local hashes and host clock; no external timestamp authority.','Fixed-delay outcomes remain subject to reporting completeness and revisions. Dependent or manually selected windows do not establish prospective skill.']};
   if(registration&&this.store.db.prepare('SELECT 1 FROM count_plan_slots WHERE plan_id=? AND ordinal=-1').get(registration.planId))throw new Error('Schedule stopped during computation');
   const id=hash(body);this.store.db.prepare('INSERT INTO count_forecasts VALUES(?,?,?)').run(id,issuedAt,JSON.stringify(body));return {id,...body};
  }finally{this.busy=false;}
 }
}
