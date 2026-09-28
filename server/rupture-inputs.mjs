import {readFileSync} from 'node:fs';
import {instrumentResponse} from './response.mjs';
import {hash} from './store.mjs';
import {retrieveSource} from './instruments.mjs';
import {finiteFaultProducts,finiteFaultAvailability} from '../public/finite-fault.js';
import {parseCoulombInput} from './coulomb-input.mjs';

export function stressIntegrity(record,source){
  const {id,...body}=record,{id:sourceId,...sourceBody}=source;
  return {recordValid:hash(body)===id,implementationValid:hash(record.implementation)===record.implementationHash,sourceRecordValid:hash(sourceBody)===sourceId,sourceValid:hash(source.raw)===source.receipt.sha256,sourceLinked:record.sourceId===sourceId&&record.sourceHash===source.receipt.sha256};
}

export class RuptureInputs{
  constructor(store,mechanisms){
    this.store=store;this.mechanisms=mechanisms;this.busy=false;
    store.db.exec(`CREATE TABLE IF NOT EXISTS rupture_inputs(id TEXT PRIMARY KEY,query_key TEXT NOT NULL,created_at INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rupture_stress(id TEXT PRIMARY KEY,query_key TEXT NOT NULL,created_at INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS rupture_stress_queries ON rupture_stress(query_key);
      CREATE TRIGGER IF NOT EXISTS frozen_stress_update BEFORE UPDATE ON rupture_stress BEGIN SELECT RAISE(ABORT,'Stress results are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_stress_delete BEFORE DELETE ON rupture_stress BEGIN SELECT RAISE(ABORT,'Stress results are immutable'); END;
      CREATE INDEX IF NOT EXISTS rupture_input_queries ON rupture_inputs(query_key,created_at);
      CREATE TRIGGER IF NOT EXISTS frozen_rupture_update BEFORE UPDATE ON rupture_inputs BEGIN SELECT RAISE(ABORT,'Rupture inputs are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_rupture_delete BEFORE DELETE ON rupture_inputs BEGIN SELECT RAISE(ABORT,'Rupture inputs are immutable'); END;`);
  }
  get(id){const row=this.store.db.prepare('SELECT body FROM rupture_inputs WHERE id=?').get(String(id));if(!row)throw new Error('Saved rupture input not found');return JSON.parse(row.body);}
  stress(id){const row=this.store.db.prepare('SELECT body FROM rupture_stress WHERE id=?').get(String(id));if(!row)throw new Error('Saved stress result not found');return JSON.parse(row.body);}
  history(input){
    const source=this.get(input.sourceId),asOf=Number(input.asOf),mode=input.mode??'catalog-replay';
    if(!Number.isFinite(asOf)||asOf>Date.now()+1000)throw new Error('Choose an elapsed stress cutoff');
    const reason=finiteFaultAvailability(source,source.product,{asOf,mode});if(reason)throw new Error(reason);
    return this.store.db.prepare("SELECT id,created_at,json_extract(body,'$.options.receiver') AS receiver,json_extract(body,'$.options.points[0].depthKm') AS depthKm,json_array_length(body,'$.options.points') AS samples FROM rupture_stress WHERE json_extract(body,'$.sourceId')=? AND created_at<=? ORDER BY created_at DESC,id").all(source.id,mode==='strict'?asOf:Number.MAX_SAFE_INTEGER).map(r=>({...r,receiver:JSON.parse(r.receiver)}));
  }
  async calculate(input){
    const source=this.get(input.sourceId),{id,...body}=source,asOf=Number(input.asOf),mode=input.mode??'catalog-replay';
    if(!Number.isFinite(asOf)||asOf>Date.now()+1000)throw new Error('Choose an elapsed stress cutoff');
    if(hash(body)!==id||hash(source.raw)!==source.receipt.sha256)throw new Error('Rupture source integrity failed');
    const reason=finiteFaultAvailability(source,source.product,{asOf,mode});if(reason)throw new Error(reason);
    const options={points:input.points,receiver:input.receiver,poisson:input.poisson,shearModulusGPa:input.shearModulusGPa,friction:input.friction};
    const implementation=readFileSync('model/stress.py','utf8'),implementationHash=hash(implementation),key=hash({sourceId:id,options,implementationHash,asOf,mode});
    const old=this.store.db.prepare('SELECT id FROM rupture_stress WHERE query_key=?').get(key);if(old)return {...this.stress(old.id),reused:true};
    if(this.busy)throw new Error('A rupture input or stress calculation is already running');this.busy=true;
    try{
      const report=await instrumentResponse({model:source.model,...options},'stress'),record={schema:'seismosphere.static-stress.v1',sourceId:id,sourceHash:source.receipt.sha256,options,implementationHash,implementation,asOf,mode,report,createdAt:Date.now()},recordId=hash(record);
      this.store.db.prepare('INSERT INTO rupture_stress VALUES(?,?,?,?)').run(recordId,key,record.createdAt,JSON.stringify({...record,id:recordId}));return {...record,id:recordId};
    }finally{this.busy=false;}
  }
  async query(input){
    const asOf=Number(input.asOf),mode=input.mode??'catalog-replay';
    if(!Number.isFinite(asOf)||asOf>Date.now()+1000)throw new Error('Choose an elapsed rupture cutoff');
    const parent=this.mechanisms.get(input.recordId),{id,...body}=parent;
    if(hash(body)!==id||hash(parent.raw)!==parent.receipt.sha256)throw new Error('Source receipt integrity failed');
    const product=finiteFaultProducts(JSON.parse(parent.raw)).find(p=>p.id===input.productId);
    if(!product)throw new Error('Choose a retained finite-fault product');
    const reason=finiteFaultAvailability(parent,product,{asOf,mode});if(reason)throw new Error(reason);
    const file=product.files.find(f=>f.name===input.fileName&&f.kind==='Coulomb input');if(!file)throw new Error('Choose a published Coulomb input file');
    const key=hash({recordId:id,productId:product.id,fileName:file.name}),saved=this.store.db.prepare('SELECT id FROM rupture_inputs WHERE query_key=? AND (?=0 OR created_at<=?) ORDER BY created_at DESC LIMIT 1').get(key,mode==='strict'?1:0,asOf);
    if(saved)return {...this.get(saved.id),reused:true};
    if(mode==='strict')throw new Error('No archived rupture file existed at this strict cutoff');
    if(this.busy)throw new Error('A rupture input download is already running');this.busy=true;
    try{
      const source=await retrieveSource(file.url,'USGS finite-fault'),model=parseCoulombInput(source.raw);
      if(file.bytes!==null&&source.receipt.bytes!==file.bytes)throw new Error('Published rupture file length does not match inventory');
      const record={schema:'seismosphere.rupture-input.v1',recordId:id,event:parent.event,product,file,model,...source,createdAt:source.receipt.fetchedAt},recordId=hash(record);
      this.store.db.prepare('INSERT INTO rupture_inputs VALUES(?,?,?,?)').run(recordId,key,record.createdAt,JSON.stringify({...record,id:recordId}));return {...record,id:recordId};
    }finally{this.busy=false;}
  }
}
