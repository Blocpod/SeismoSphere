import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {hash} from './store.mjs';
import {coverageComplete} from './import-jobs.mjs';
const DAY=86400000;
export const LEARNED_OPTIONS=Object.freeze({start:Date.UTC(2000,0,1),trainEnd:Date.UTC(2017,0,1),validationEnd:Date.UTC(2020,0,1),end:Date.UTC(2026,0,1),minMagnitude:5,provider:'USGS',seed:20260913});
export function learnedContext(report,projection,asOf,mode){
  if(asOf<report.options.validationEnd)throw new Error('The learned checkpoint was selected after this cutoff');
  if(mode==='strict'&&report.createdAt>asOf)throw new Error('This model did not exist at the strict observation cutoff');
  if(projection.cutoff!==asOf)throw new Error('Learned map cutoff does not match analysis');
  const scores=Object.fromEntries(Object.entries(report.scores).filter(([,s])=>s.lastEnd<=asOf));
  const comparisons=Object.fromEntries(Object.entries(scores).filter(([,s])=>s.models).map(([name,s])=>{const g=s.models.graph,n=s.models.noNeighbors;return [name,{logLikelihoodBetter:g.logLikelihood===n.logLikelihood?'tie':g.logLikelihood>n.logLikelihood?'graph':'noNeighbors',meanAbsoluteErrorBetter:g.meanAbsoluteError===n.meanAbsoluteError?'tie':g.meanAbsoluteError<n.meanAbsoluteError?'graph':'noNeighbors'}];}));
  return {id:report.id,version:report.version,createdAt:report.createdAt,catalogMode:report.catalogMode,options:report.options,grid:report.grid,features:report.features,weightsSha256:report.weightsSha256,projection,
    scores,comparisons,limitations:report.limitations,
    policy:'Only completed evaluation intervals appear here. This checkpoint was selected using validation, not test outcomes.'};
}
export class LearnedModel {
  constructor(store){
    this.store=store;this.active=null;this.children=new Set();
    if(store.get('learnedJob')?.status==='running')store.set('learnedJob',{...store.get('learnedJob'),status:'interrupted',message:'Training was interrupted by a server restart. Start the experiment again.'});
    this.python=process.env.SEISMO_MODEL_PYTHON??path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
    store.db.exec(`CREATE TABLE IF NOT EXISTS learned_runs(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS frozen_learned_update BEFORE UPDATE ON learned_runs BEGIN SELECT RAISE(ABORT,'Learned runs are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_learned_delete BEFORE DELETE ON learned_runs BEGIN SELECT RAISE(ABORT,'Learned runs are immutable'); END;`);
  }
  run(payload){
    if(!existsSync(this.python))throw new Error('Install the local training runtime using scripts/setup-model.ps1 first');
    return new Promise((resolve,reject)=>{
      const child=spawn(this.python,['model/seismic_gnn.py'],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.children.add(child);
      let stdout='',stderr='',failure;
      const timer=setTimeout(()=>{failure=new Error('Local model exceeded five minutes');child.kill();},300000);
      child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>20000000){failure=new Error('Model output exceeded limit');child.kill();}});
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-6000);});
      child.once('error',error=>{failure=error;});child.stdin.on('error',error=>{failure??=error;});
      child.once('close',code=>{clearTimeout(timer);this.children.delete(child);if(failure||code!==0)return reject(failure??new Error(stderr||`Local model exited ${code}`));try{resolve(JSON.parse(stdout));}catch{reject(new Error('Invalid local model response'));}});
      child.stdin.end(JSON.stringify(payload));
    });
  }
  get(id){const row=this.store.db.prepare('SELECT body FROM learned_runs WHERE id=?').get(String(id??''));if(!row)throw new Error('Saved learned run not found');return JSON.parse(row.body);}
  list(){return {fitting:!!this.active,job:this.store.get('learnedJob',null),ready:existsSync(this.python),options:LEARNED_OPTIONS,runs:this.store.db.prepare('SELECT body FROM learned_runs ORDER BY created_at DESC LIMIT 10').all().map(r=>{const {artifact,testWindows,...report}=JSON.parse(r.body);return report;})};}
  async train(){
    if(this.active||this.children.size)throw new Error('The local learned model is busy');
    const options=LEARNED_OPTIONS;
    if(!coverageComplete(this.store.get('coverage',[]),{provider:options.provider,start:options.start,end:options.end,minMagnitude:5}))throw new Error('Import the complete global USGS M5 archive for 2000–2025 first');
    const events=this.store.events({provider:options.provider,start:options.start,asOf:options.end}).filter(e=>e.mag>=5&&e.type==='earthquake');
    const sourceSha256=hash(readFileSync('model/seismic_gnn.py','utf8'));
    const id=hash({options,events,sourceSha256}),existing=this.store.db.prepare('SELECT body FROM learned_runs WHERE id=?').get(id);
    if(existing){this.store.set('learnedJob',{status:'completed',id,endedAt:Date.now(),reused:true});return {...JSON.parse(existing.body),reused:true};}
    this.store.set('learnedJob',{status:'running',id,startedAt:Date.now()});
    try{
      this.active=this.run({events,options});
      const result=await this.active;
      result.pythonWeightsSha256=result.weightsSha256;result.weightsSha256=hash(result.artifact);
      const inputSnapshotId=this.store.snapshot(events,options.end,'learned-revised-catalog-experiment');
      const report={...result,id,createdAt:Date.now(),sourceSha256,inputSnapshotId,catalogMode:'revised-catalog hindcast'};
      this.store.db.prepare('INSERT INTO learned_runs VALUES(?,?,?)').run(id,report.createdAt,JSON.stringify(report));this.store.set('learnedJob',{status:'completed',id,endedAt:Date.now()});return report;
    }catch(error){this.store.set('learnedJob',{status:'failed',id,endedAt:Date.now(),message:error.message});throw error;}finally{this.active=null;}
  }
  async predict(id,cutoff,mode='catalog-replay'){
    const report=this.get(id);
    if(!Number.isFinite(cutoff)||cutoff>Date.now()||cutoff<report.options.validationEnd)throw new Error('Choose a valid cutoff after checkpoint selection (2020-01-01)');
    if(report.sourceSha256!==hash(readFileSync('model/seismic_gnn.py','utf8')))throw new Error('This checkpoint uses a different model implementation. Restore its source version or train a new run.');
    if(!['strict','catalog-replay'].includes(mode))throw new Error('Invalid observation mode');
    if(mode==='strict'&&report.createdAt>cutoff)throw new Error('The learned model was unavailable at this strict observation cutoff');
    if(this.children.size)throw new Error('The local learned model is busy');
    if(!coverageComplete(this.store.get('coverage',[]),{provider:'USGS',start:cutoff-28*DAY,end:cutoff,minMagnitude:5}))throw new Error('Import all 28 conditioning days at M5 before generating this map');
    const events=this.store.events({provider:'USGS',start:cutoff-28*DAY,asOf:cutoff,strict:mode==='strict'}).filter(e=>e.mag>=5&&e.type==='earthquake');
    const projection=await this.run({action:'predict',report,events,cutoff});
    projection.inputSnapshotId=this.store.snapshot(events,cutoff,`learned-inference-${mode}`);
    return {report:{...report,artifact:undefined,testWindows:undefined},projection,mode};
  }
  export(id){const report=this.get(id),row=this.store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(report.inputSnapshotId);return {report,snapshot:{id:report.inputSnapshotId,...JSON.parse(row.body)},integrity:{weightsValid:hash(report.artifact)===report.weightsSha256,snapshotValid:hash(JSON.parse(row.body))===report.inputSnapshotId},hashMethod:'SHA-256 of recursively key-sorted JSON, UTF-8 (server/store.mjs canonical). Python serialization hash also retained.'};}
  close(){for(const child of this.children)child.kill();}
}
