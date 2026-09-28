import {hash} from './store.mjs';
const DAY=86400000;
export class CountForecasts{
 constructor(store,learned){this.store=store;this.learned=learned;this.busy=false;store.db.exec(`CREATE TABLE IF NOT EXISTS count_forecasts(id TEXT PRIMARY KEY,issued_at INTEGER NOT NULL,body TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS frozen_count_forecasts_update BEFORE UPDATE ON count_forecasts BEGIN SELECT RAISE(ABORT,'Count forecasts are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS frozen_count_forecasts_delete BEFORE DELETE ON count_forecasts BEGIN SELECT RAISE(ABORT,'Count forecasts are immutable'); END;`);}
 get(id){const row=this.store.db.prepare('SELECT issued_at,body FROM count_forecasts WHERE id=?').get(String(id??''));if(!row)throw new Error('Count forecast not found');const body=JSON.parse(row.body);if(hash(body)!==id||body.issuedAt!==row.issued_at)throw new Error('Count forecast integrity check failed');return {id,...body};}
 list(){return this.store.db.prepare('SELECT id FROM count_forecasts ORDER BY issued_at DESC').all().map(({id})=>{const f=this.get(id);return {id,issuedAt:f.issuedAt,validUntil:f.validUntil,parentRunId:f.parentRunId,totals:Object.fromEntries(Object.entries(f.models).map(([k,v])=>[k,v.reduce((a,b)=>a+b,0)]))};});}
 async issue(parentRunId,feed){
  if(this.busy)throw new Error('A count forecast is being prepared');this.busy=true;
  try{
   const started=Date.now();if(feed.status!=='live'||![feed.fetchedAt,feed.generated].every(t=>Number.isFinite(t)&&t<=started&&started-t<=900000))throw new Error('Refresh the live USGS feed before issuing count forecasts');
   const cutoff=feed.generated,tectonic=this.learned.tectonic(parentRunId);
   if(tectonic.createdAt>cutoff)throw new Error('The tectonic comparison was just prepared after this feed cutoff. Review it and refresh the live catalog before issuing.');
   const inference=await this.learned.predict(parentRunId,cutoff,'strict','ensemble'),p=inference.projection;
   const models={...p.componentCells,ensemble:p.cells,tectonic:tectonic.report.fit.cells};
   if(Object.keys(models).sort().join(',')!=='ensemble,graph,noNeighbors,recentRate,tectonic,trainingMean'||Object.values(models).some(c=>c.length!==72||c.some(v=>!Number.isFinite(v)||v<=0)))throw new Error('All six models must provide 72 positive finite expectations');
   const issuedAt=Date.now();if(issuedAt<cutoff||issuedAt-started>300000)throw new Error('Forecast computation exceeded the issuance window');
   const snapshot=this.store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(p.inputSnapshotId);if(!snapshot||hash(JSON.parse(snapshot.body))!==p.inputSnapshotId)throw new Error('Count inference snapshot integrity check failed');
   const body={version:'prospective-count-1',issuedAt,validFrom:issuedAt,validUntil:issuedAt+7*DAY,inputCutoff:cutoff,parentRunId,models,ensembleWeights:p.ensembleWeights,grid:inference.report.grid,modelVersion:inference.report.version,weightsSha256:inference.report.weightsSha256,trainingSnapshotId:inference.report.inputSnapshotId,inputSnapshotId:p.inputSnapshotId,inputSnapshot:JSON.parse(snapshot.body),tectonicComparison:tectonic,feedReceipt:structuredClone(feed),timing:'Seven-day target window begins at actual issuance after computation; model conditioning ends at the latest feed generation time (inputCutoff), using only revisions received by that time. No backdating.',limitations:['Manually initiated issuance; selection may be biased. This is not a preregistered schedule.','Expected broad-cell M≥5 catalog counts, not calibrated probabilities or precise earthquake predictions.','Local hashes and host clock; no external timestamp authority.','Outcome assessment is not implemented for this record version. No skill claim follows from issuance.']};
   const id=hash(body);this.store.db.prepare('INSERT INTO count_forecasts VALUES(?,?,?)').run(id,issuedAt,JSON.stringify(body));return {id,...body};
  }finally{this.busy=false;}
 }
}
