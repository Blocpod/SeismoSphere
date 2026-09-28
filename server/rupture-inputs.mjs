import {hash} from './store.mjs';
import {retrieveSource} from './instruments.mjs';
import {finiteFaultProducts,finiteFaultAvailability} from '../public/finite-fault.js';
import {parseCoulombInput} from './coulomb-input.mjs';

export class RuptureInputs{
  constructor(store,mechanisms){
    this.store=store;this.mechanisms=mechanisms;this.busy=false;
    store.db.exec(`CREATE TABLE IF NOT EXISTS rupture_inputs(id TEXT PRIMARY KEY,query_key TEXT NOT NULL,created_at INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS rupture_input_queries ON rupture_inputs(query_key,created_at);
      CREATE TRIGGER IF NOT EXISTS frozen_rupture_update BEFORE UPDATE ON rupture_inputs BEGIN SELECT RAISE(ABORT,'Rupture inputs are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS frozen_rupture_delete BEFORE DELETE ON rupture_inputs BEGIN SELECT RAISE(ABORT,'Rupture inputs are immutable'); END;`);
  }
  get(id){const row=this.store.db.prepare('SELECT body FROM rupture_inputs WHERE id=?').get(String(id));if(!row)throw new Error('Saved rupture input not found');return JSON.parse(row.body);}
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
