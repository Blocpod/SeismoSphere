import {Worker} from 'node:worker_threads';
import {hash} from './store.mjs';
import {VERSION as ENGINE_VERSION} from './engine.mjs';
import {randomizationOptions,randomizationInput,randomizationReport,RANDOMIZATION_VERSION} from './randomization.mjs';
export class RandomizationJobs{
  constructor(store,{onChange=()=>{}}={}){
    this.store=store;this.onChange=onChange;this.active=null;
    store.db.exec(`CREATE TABLE IF NOT EXISTS randomization_jobs(id TEXT PRIMARY KEY,created_at INTEGER,updated_at INTEGER,status TEXT,input TEXT NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS randomization_runs(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS frozen_randomization_update BEFORE UPDATE ON randomization_runs BEGIN SELECT RAISE(ABORT,'Randomization reports are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_randomization_delete BEFORE DELETE ON randomization_runs BEGIN SELECT RAISE(ABORT,'Randomization reports are immutable'); END;
      UPDATE randomization_jobs SET status='paused' WHERE status='running';`);
  }
  row(id){const r=this.store.db.prepare('SELECT * FROM randomization_jobs WHERE id=?').get(id);if(!r)throw new Error('Randomization job not found.');return {...r,input:JSON.parse(r.input),state:JSON.parse(r.state)};}
  get(id){const r=this.row(id);return {id,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,options:r.input.options,provider:r.input.config.catalogProvider,completed:r.state.replicates.length,observed:r.state.observed,error:r.state.error??null,report:r.status==='completed'?this.report(id):null};}
  list(){return this.store.db.prepare('SELECT id FROM randomization_jobs ORDER BY created_at DESC LIMIT 50').all().map(r=>{const j=this.get(r.id);delete j.report;return j;});}
  report(id){const r=this.store.db.prepare('SELECT body FROM randomization_runs WHERE id=?').get(id);if(!r)throw new Error('Completed randomization report not found.');return JSON.parse(r.body);}
  input(id){const r=this.row(id),snapshot=this.store.db.prepare('SELECT body FROM snapshots WHERE id=?').get(r.input.inputSnapshotId);if(!snapshot||hash(JSON.parse(snapshot.body))!==r.input.inputSnapshotId||hash(r.input)!==id)throw new Error('Randomization input integrity check failed.');return {input:r.input,snapshot:JSON.parse(snapshot.body)};}
  export(id){const {input,snapshot}=this.input(id),report=this.report(id),{sha256,...body}=report;return {report,input,snapshot:{id:input.inputSnapshotId,...snapshot},integrity:{inputValid:hash(input)===id,snapshotValid:hash(snapshot)===input.inputSnapshotId,reportValid:hash(body)===sha256}};}
  create(events,options,config,routes,boundaries,coverage){
    options=randomizationOptions(options);events=randomizationInput(events,options,config);
    const input={version:RANDOMIZATION_VERSION,engineVersion:ENGINE_VERSION,options,config:structuredClone(config),routes:structuredClone(routes),boundaries:structuredClone(boundaries),coverage:structuredClone(coverage),inputSnapshotId:this.store.snapshot(events,options.end,'randomization-revised-input')},id=hash(input);
    if(this.store.db.prepare('SELECT id FROM randomization_jobs WHERE id=?').get(id))return {...this.get(id),reused:true};
    if(this.active)throw new Error('Pause the current randomization job before starting another.');const at=Date.now();this.store.db.prepare('INSERT INTO randomization_jobs VALUES(?,?,?,?,?,?)').run(id,at,at,'paused',JSON.stringify(input),JSON.stringify({observed:null,replicates:[]}));this.resume(id);return this.get(id);
  }
  write(id,status,state){this.store.db.prepare('UPDATE randomization_jobs SET status=?,updated_at=?,state=? WHERE id=?').run(status,Date.now(),JSON.stringify(state),id);this.onChange(this.get(id));}
  resume(id){
    if(this.active)throw new Error('A randomization job is already running.');const row=this.row(id);if(row.status==='completed')return this.get(id);
    const {input,snapshot}=this.input(id),state=row.state;if(input.version!==RANDOMIZATION_VERSION||input.engineVersion!==ENGINE_VERSION)throw new Error('Resume requires the original randomization and forecast engine versions.');delete state.error;
    const worker=new Worker(new URL('./randomization-worker.mjs',import.meta.url),{workerData:{input,events:snapshot.events,checkpoint:state}});let resolve;const promise=new Promise(r=>resolve=r);this.active={id,worker,promise};
    const finish=(status,error)=>{if(this.active?.worker!==worker)return;this.active=null;if(error)state.error=error;this.write(id,status,state);};
    worker.on('message',message=>{if(this.active?.worker!==worker)return;try{
      if(message.type==='error'){finish('failed',message.error);worker.terminate();}
      else if(message.type==='observed'){state.observed=message.result;if(!state.observed.summary.find(s=>s.engine==='DS')?.forecasts)throw new Error('The observed catalog generated no forecasts. Change the interval or rules.');this.write(id,'running',state);}
      else if(message.type==='replicate'){if(message.result.index!==state.replicates.length)throw new Error('Unexpected replicate order.');state.replicates.push(message.result);this.write(id,'running',state);}
      else if(message.type==='complete'){const body={...randomizationReport(input,state.observed,state.replicates),id,createdAt:Date.now()},report={...body,sha256:hash(body)};this.store.db.exec('BEGIN IMMEDIATE');try{this.store.db.prepare('INSERT INTO randomization_runs VALUES(?,?,?)').run(id,body.createdAt,JSON.stringify(report));this.store.db.prepare('UPDATE randomization_jobs SET status=?,updated_at=?,state=? WHERE id=?').run('completed',Date.now(),JSON.stringify(state),id);this.store.db.exec('COMMIT');}catch(error){this.store.db.exec('ROLLBACK');throw error;}this.active=null;this.onChange(this.get(id));}
    }catch(error){finish('failed',error.message);worker.terminate();}});
    worker.once('error',error=>finish('failed',error.message));worker.once('exit',code=>{if(this.active?.worker===worker)finish('failed',`Randomization worker exited before completion (${code}).`);resolve();});this.write(id,'running',state);return this.get(id);
  }
  async control(id,action){
    if(action==='resume')return this.resume(id);if(!['pause','cancel'].includes(action))throw new Error('Choose pause, resume or cancel.');const row=this.row(id);if(row.status==='completed')throw new Error('Completed reports cannot be changed.');if(row.status==='cancelled')return this.get(id);
    const active=this.active?.id===id?this.active:null;if(active)this.active=null;this.write(id,action==='pause'?'paused':'cancelled',row.state);const result=this.get(id);if(active){await active.worker.terminate();await active.promise;}return result;
  }
  async shutdown(){if(this.active)await this.control(this.active.id,'pause');}
}
