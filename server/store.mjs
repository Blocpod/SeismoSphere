import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const canonical = value => JSON.stringify(sort(value));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export const hash = v => createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
// Only authoritative provider aliases are joined. Space/time proximity is not identity.
export function associateEvents(events){
  const parent=new Map();
  function root(id){if(!parent.has(id))parent.set(id,id);let r=id;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,r);id=next;}return r;}
  for(const e of events)for(const id of e.aliases??[])if(id.startsWith(`${e.provider}:`))parent.set(root(id),root(e.id));
  const groups=new Map();
  for(const e of events){const id=root(e.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(e);}
  return [...groups.values()].map(group=>{
    if(group.length===1)return group[0];
    group.sort((a,b)=>(b.updated??b.time)-(a.updated??a.time)||(b.observedAt??0)-(a.observedAt??0)||a.id.localeCompare(b.id));
    return {...group[0],aliases:[...new Set(group.flatMap(e=>[e.id,...e.aliases??[]]))].sort(),associatedReports:group.map(e=>({id:e.id,provider:e.provider,updated:e.updated,observedAt:e.observedAt})),association:'Provider-published identifiers; no proximity merge'};
  });
}
export class Store {
  constructor(file='data/seismosphere.sqlite') {
    if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true});
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS observations(id TEXT, observed_at INTEGER, event_time INTEGER, body TEXT NOT NULL, PRIMARY KEY(id,observed_at));
      CREATE INDEX IF NOT EXISTS obs_time ON observations(event_time);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, created_at INTEGER, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS forecasts(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE,issued_at INTEGER,body TEXT NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resolutions(forecast_id TEXT PRIMARY KEY,result TEXT NOT NULL,created_at INTEGER, FOREIGN KEY(forecast_id) REFERENCES forecasts(id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS statistical_runs(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalog_diagnostics(id TEXT PRIMARY KEY,created_at INTEGER,body TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS frozen_diagnostic_update BEFORE UPDATE ON catalog_diagnostics BEGIN SELECT RAISE(ABORT,'Catalog diagnostics are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_diagnostic_delete BEFORE DELETE ON catalog_diagnostics BEGIN SELECT RAISE(ABORT,'Catalog diagnostics are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_statistical_update BEFORE UPDATE ON statistical_runs BEGIN SELECT RAISE(ABORT,'Statistical runs are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_statistical_delete BEFORE DELETE ON statistical_runs BEGIN SELECT RAISE(ABORT,'Statistical runs are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_experiment_update BEFORE UPDATE ON experiments BEGIN SELECT RAISE(ABORT,'Experiments are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_experiment_delete BEFORE DELETE ON experiments BEGIN SELECT RAISE(ABORT,'Experiments are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_forecasts_update BEFORE UPDATE ON forecasts BEGIN SELECT RAISE(ABORT,'Issued forecasts are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_forecasts_delete BEFORE DELETE ON forecasts BEGIN SELECT RAISE(ABORT,'Issued forecasts are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_snapshot_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'Snapshots are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_snapshot_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'Snapshots are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_resolution_update BEFORE UPDATE ON resolutions BEGIN SELECT RAISE(ABORT,'Resolutions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_resolution_delete BEFORE DELETE ON resolutions BEGIN SELECT RAISE(ABORT,'Resolutions are immutable'); END;`);
  }
  get(key,fallback=null){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,JSON.stringify(value));}
  ingest(events,observedAt=Date.now(),{transaction=true}={}) {
    const stmt=this.db.prepare('INSERT INTO observations VALUES(?,?,?,?)');
    // Look up only incoming identifiers; multi-decade imports must not parse the full archive per chunk.
    const latest=this.db.prepare('SELECT body FROM observations WHERE id=? ORDER BY observed_at DESC LIMIT 1'),current=new Map();
    for(const id of new Set(events.map(e=>e.id))){const row=latest.get(id);if(row){const {observedAt,...value}=JSON.parse(row.body);current.set(id,{body:canonical(value),observedAt,updated:value.updated});}}
    let inserted=0;
    if(transaction)this.db.exec('BEGIN');
    try {
      for(const e of events){
        const previous=current.get(e.id),body=canonical(e);
        // A late, stale HTTP response must not resurrect a newer deletion/revision.
        if(previous?.body===body||Number.isFinite(e.updated)&&Number.isFinite(previous?.updated)&&e.updated<previous.updated)continue;
        if(previous&&observedAt<=previous.observedAt)throw new Error('Observation revisions must have increasing reception times');
        stmt.run(e.id,observedAt,e.time,JSON.stringify({...e,observedAt}));inserted++;
        current.set(e.id,{body,observedAt,updated:e.updated});
      }
      if(transaction)this.db.exec('COMMIT');return inserted;
    }catch(e){if(transaction)this.db.exec('ROLLBACK');throw e;}
  }
  revisions({asOf=Date.now(),strict=false}={}) {
    // Rank revisions before filtering origin times. Origin times can themselves be revised.
    const rows=this.db.prepare(`SELECT body FROM (SELECT body,ROW_NUMBER() OVER(PARTITION BY id ORDER BY observed_at DESC) AS rn FROM observations ${strict?'WHERE observed_at<=?':''}) WHERE rn=1`).all(...(strict?[asOf]:[]));
    return rows.map(r=>JSON.parse(r.body));
  }
  events({asOf=Date.now(),start=0,strict=false,provider=null,associate=true}={}) {
    const active=this.revisions({asOf,strict}).filter(e=>e.status!=='deleted'&&(!provider||!e.provider||e.provider===provider));
    return (associate?associateEvents(active):active).filter(e=>e.time<=asOf&&e.time>=start).sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id));
  }
  snapshot(events,at,mode){const value={asOf:at,mode,events};const id=hash(value);this.db.prepare('INSERT OR IGNORE INTO snapshots VALUES(?,?,?)').run(id,Date.now(),canonical(value));return id;}
  issue(candidates,context,{transaction=true}={}) {
    if(transaction)this.db.exec('BEGIN IMMEDIATE');
    try {
      let prev=this.db.prepare('SELECT hash FROM forecasts ORDER BY seq DESC LIMIT 1').get()?.hash??'GENESIS';
      const result=[];
      for(const candidate of candidates){
        const id='DSP-'+randomUUID().slice(0,12);
        const body={...candidate,...context,id,issuedAt:context.issuedAt??Date.now()};
        const digest=hash(prev+canonical(body));
        this.db.prepare('INSERT INTO forecasts(id,issued_at,body,prev_hash,hash) VALUES(?,?,?,?,?)').run(id,body.issuedAt,canonical(body),prev,digest);
        prev=digest; result.push({...body,hash:digest});
      }
      if(transaction)this.db.exec('COMMIT'); return result;
    }catch(e){if(transaction)this.db.exec('ROLLBACK');throw e;}
  }
  ledger(){return this.db.prepare('SELECT f.body,f.hash,r.result FROM forecasts f LEFT JOIN resolutions r ON r.forecast_id=f.id ORDER BY seq DESC').all().map(r=>({...JSON.parse(r.body),hash:r.hash,resolution:r.result?JSON.parse(r.result):null}));}
  resolve(id,result){this.db.prepare('INSERT OR IGNORE INTO resolutions VALUES(?,?,?)').run(id,canonical(result),Date.now());}
  experiment(id){const r=this.db.prepare('SELECT body FROM experiments WHERE id=?').get(id);return r?JSON.parse(r.body):null;}
  experiments(){return this.db.prepare('SELECT body FROM experiments ORDER BY created_at DESC LIMIT 50').all().map(r=>JSON.parse(r.body));}
  saveExperiment(id,body){this.db.prepare('INSERT OR IGNORE INTO experiments VALUES(?,?,?)').run(id,Date.now(),canonical(body));}
  verify(){
    let prev='GENESIS',count=0;const checked=new Set();
    for(const r of this.db.prepare('SELECT * FROM forecasts ORDER BY seq').all()){
      if(r.prev_hash!==prev||hash(prev+r.body)!==r.hash)return {valid:false,count,brokenAt:r.id};
      const b=JSON.parse(r.body);
      if(b.snapshotId&&!checked.has(b.snapshotId)){
        const s=this.db.prepare('SELECT body FROM snapshots WHERE id=?').get(b.snapshotId);
        if(!s||hash(JSON.parse(s.body))!==b.snapshotId)return {valid:false,count,brokenAt:r.id,reason:'snapshot mismatch'};
        checked.add(b.snapshotId);
      }
      prev=r.hash;count++;
    }
    return {valid:true,count,head:prev,scope:'Local hash chain and snapshot integrity; no external timestamp authority'};
  }
  close(){this.db.close();}
}
