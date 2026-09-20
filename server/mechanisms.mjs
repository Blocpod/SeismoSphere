import {hash} from './store.mjs';
import {normalize} from './catalog.mjs';
import {retrieveSource} from './instruments.mjs';
const keys=['mrr','mtt','mpp','mrt','mrp','mtp'];
function numeric(value){if(value===null||value===undefined||typeof value==='string'&&!value.trim())return null;if(!['number','string'].includes(typeof value))return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function coordinate(p,prefix=''){const lat=numeric(p[prefix+'latitude']),lon=numeric(p[prefix+'longitude']),depth=numeric(p[prefix+'depth']),time=Date.parse(p[prefix+'eventtime']);return {lat:lat!==null&&Math.abs(lat)<=90?lat:null,lon:lon!==null&&Math.abs(lon)<=180?lon:null,depth:depth!==null&&depth>=-10&&depth<=1000?depth:null,time:Number.isFinite(time)?time:null};}
export function parseMechanisms(detail,event){
  const detailEvent=normalize(detail);if(!detailEvent||![detailEvent.id,...detailEvent.aliases].some(id=>[event.id,...(event.aliases??[])].includes(id)))throw new Error('USGS detail event identity does not match the selected catalog event');
  const types=detail.properties.products;if(!types||typeof types!=='object'||Array.isArray(types))throw new Error('USGS detail is missing its product inventory');
  const products=[];
  for(const type of ['moment-tensor','focal-mechanism','internal-moment-tensor'])if(types[type]!==undefined&&!Array.isArray(types[type]))throw new Error('Invalid mechanism product inventory');
  for(const type of ['moment-tensor','focal-mechanism'])for(const source of types[type]??[]){
    if(!source||source.type!==type||typeof source.id!=='string'||!Number.isFinite(source.updateTime)||typeof source.properties!=='object'||!source.properties)throw new Error('Invalid public mechanism product');
    const p=source.properties,planes=[1,2].map(i=>{const strike=numeric(p[`nodal-plane-${i}-strike`]),dip=numeric(p[`nodal-plane-${i}-dip`]),rake=numeric(p[`nodal-plane-${i}-rake`]);return strike!==null&&strike>=0&&strike<=360&&dip!==null&&dip>=0&&dip<=90&&rake!==null&&Math.abs(rake)<=180?{number:i,strike,dip,rake}:null;}).filter(Boolean);
    const values=keys.map(k=>numeric(p['tensor-'+k])),tensor=type==='moment-tensor'&&values.every(v=>v!==null)&&values.some(v=>v!==0)?Object.fromEntries(keys.map((k,i)=>[k,values[i]])):null;
    const dc=numeric(p['percent-double-couple']),moment=numeric(p['scalar-moment']);
    products.push({id:source.id,type,code:source.code,source:source.source,updateTime:source.updateTime,status:source.status,preferredWeight:numeric(source.preferredWeight),reviewStatus:p['review-status']??null,evaluationStatus:p['evaluation-status']??null,tensor,tensorUnits:tensor?'N m':null,tensorBasis:tensor?'r = up, t = south, p = east':null,planes,derivedOrigin:coordinate(p,'derived-'),productOrigin:coordinate(p),magnitude:numeric(p['derived-magnitude']),magnitudeType:p['derived-magnitude-type']??null,scalarMoment:moment!==null&&moment>0?moment:null,doubleCoupleRaw:p['percent-double-couple']??null,doubleCoupleFraction:p['quakeml-publicid']&&dc!==null&&dc>=0&&dc<=1?dc:null,usable:source.status==='UPDATE'&&!['rejected'].includes(p['evaluation-status'])&&(tensor!==null||planes.length>0),sourceProperties:p,contents:source.contents??{}});
  }
  if(products.length>200)throw new Error('Unexpectedly large mechanism product inventory');if(new Set(products.map(p=>p.id)).size!==products.length)throw new Error('Duplicate mechanism product identities');
  return {detailEvent,products,excludedInternalProducts:(types['internal-moment-tensor']??[]).length};
}
export function mechanismContext(record,productId,asOf,mode='catalog-replay'){
  if(!Number.isFinite(asOf)||!['strict','catalog-replay'].includes(mode))throw new Error('Invalid mechanism cutoff or replay mode');
  if(record.event.time>asOf)throw new Error('This event occurs after the analysis cutoff');
  if(mode==='strict'&&record.createdAt>asOf)throw new Error('This mechanism receipt was unavailable at the strict observation cutoff');
  const product=record.products.find(p=>p.id===productId);if(!product?.usable)throw new Error('Select a usable public focal-mechanism product');if(product.updateTime>asOf)throw new Error('This mechanism product was updated after the analysis cutoff');
  const {sourceProperties,contents,...evidence}=product;
  return structuredClone({recordId:record.id,event:record.event,product:{...evidence,scalarMomentText:product.scalarMoment===null?'unavailable':product.scalarMoment.toExponential()+' N m'},receipt:record.receipt,createdAt:record.createdAt,limitations:['A published source inversion, not a measured local stress field or a forecast factor.','Both nodal planes are retained. The mechanism alone does not identify the actual rupture plane.','Tensor-derived origin and depth are distinct from the selected catalog hypocenter.','Tensor P-radiation sign diagrams are theoretical lower-hemisphere projections, not observed waveform amplitudes.','Product update time must precede the cutoff; revised-catalog inspection does not reconstruct historical product availability.','No finite-fault dimensions, slip distribution or Coulomb stress calculation is inferred.']});
}
export class Mechanisms{
  constructor(store){this.store=store;this.busy=false;store.db.exec(`CREATE TABLE IF NOT EXISTS mechanism_records(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,query_key TEXT NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mechanism_queries ON mechanism_records(query_key,created_at);
    CREATE TRIGGER IF NOT EXISTS frozen_mechanism_update BEFORE UPDATE ON mechanism_records BEGIN SELECT RAISE(ABORT,'Mechanism records are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS frozen_mechanism_delete BEFORE DELETE ON mechanism_records BEGIN SELECT RAISE(ABORT,'Mechanism records are immutable'); END;`);}
  get(id){const row=this.store.db.prepare('SELECT body FROM mechanism_records WHERE id=?').get(String(id));if(!row)throw new Error('Saved mechanism record not found');return JSON.parse(row.body);}
  // ponytail: browse the latest 40 receipts; add pagination when older-history browsing is required.
  list(){return this.store.db.prepare('SELECT id,event_id,created_at FROM mechanism_records ORDER BY created_at DESC LIMIT 40').all();}
  async query(input){
    const asOf=Number(input.asOf??Date.now()),mode=input.mode??'catalog-replay';if(!Number.isFinite(asOf)||asOf>Date.now()+1000||!['strict','catalog-replay'].includes(mode))throw new Error('Choose a valid elapsed mechanism cutoff');
    const event=this.store.events({asOf,strict:mode==='strict',provider:'USGS'}).find(e=>e.id===input.eventId);if(!event)throw new Error('Select a retained USGS event available at the cutoff');if(!/^[A-Za-z0-9_-]{1,100}$/.test(event.sourceId))throw new Error('Invalid USGS event identifier');
    const queryKey=hash({id:event.id,updated:event.updated,observedAt:event.observedAt}),old=this.store.db.prepare('SELECT id FROM mechanism_records WHERE query_key=? AND (?=0 OR created_at<=?) ORDER BY created_at DESC LIMIT 1').get(queryKey,mode==='strict'?1:0,asOf);
    if(old&&!input.refresh)return {...this.get(old.id),reused:true};if(mode==='strict')throw new Error('No saved mechanism receipt is available at this strict cutoff; use revised-catalog inspection');
    if(this.busy)throw new Error('A USGS mechanism request is already running');this.busy=true;
    try{const url='https://earthquake.usgs.gov/fdsnws/event/1/query?'+new URLSearchParams({format:'geojson',eventid:event.sourceId}),source=await retrieveSource(url,'USGS'),data=parseMechanisms(JSON.parse(source.raw),event),body={schema:'seismosphere.mechanisms.v1',event,...data,...source,createdAt:source.receipt.fetchedAt},id=hash(body);this.store.db.prepare('INSERT INTO mechanism_records VALUES(?,?,?,?,?)').run(id,event.id,body.createdAt,queryKey,JSON.stringify({...body,id}));return {...body,id};}finally{this.busy=false;}
  }
}
