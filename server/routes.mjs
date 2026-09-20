import {hash} from './store.mjs';
import {distance} from './geo.mjs';
const text=(v,n=300)=>{if(v==null)return '';if(typeof v!=='string'||v.trim().length>n)throw new Error('Text field exceeds its limit or has an invalid type.');return v.trim();};
export function validateRoutes(input){
 if(!input||!Array.isArray(input.routes)||input.routes.length>100)throw new Error('A network may contain up to 100 routes.');
 const ids=new Set();const routes=input.routes.map(r=>{
  if(!r||!/^[-A-Za-z0-9_]{1,40}$/.test(r.id)||ids.has(r.id))throw new Error('Use unique route IDs with letters, numbers, hyphens or underscores.');ids.add(r.id);
  const name=text(r.name,120);if(!name)throw new Error('Each route needs a name.');
  if(!Array.isArray(r.points)||r.points.length<2||r.points.length>100)throw new Error('Each route needs 2–100 ordered waypoints.');
  const points=r.points.map(p=>{if(!p||![p.lat,p.lon].every(Number.isFinite)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw new Error('Waypoint latitude/longitude is outside its valid range.');return {lat:p.lat,lon:p.lon};});
  for(let i=1;i<points.length;i++){const d=distance(points[i-1],points[i]);if(d<1||d>19000)throw new Error('Adjacent waypoints must be 1–19,000 km apart. Add intermediate points for long arcs.');}
  const direction=r.direction??'forward',kind=r.kind??'research-corridor';if(!['forward','reverse'].includes(direction)||!['research-corridor','plate-corridor','craton-edge'].includes(kind))throw new Error('Invalid route direction or kind.');
  const provenance=r.provenance??{status:'illustrative',notes:'Legacy illustrative research corridor'},status=provenance.status??'illustrative';if(!['illustrative','source-traced'].includes(status))throw new Error('Choose illustrative or source-traced provenance.');
  const sourceUrl=text(provenance.sourceUrl,1000),locator=text(provenance.locator,300),notes=text(provenance.notes,2000);
  if(sourceUrl){let url;try{url=new URL(sourceUrl);}catch{throw new Error('Enter a valid source URL.');}if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Use a public HTTP(S) source URL without embedded credentials.');}
  if(status==='source-traced'&&(!sourceUrl||!locator))throw new Error('A source-traced route requires a source URL and map/page/video timestamp.');
  const next=r.next??[];if(!Array.isArray(next)||next.length>10||next.some(id=>typeof id!=='string')||new Set(next).size!==next.length)throw new Error('Choose up to 10 distinct outgoing routes.');
  if(typeof r.termination!=='boolean')throw new Error('Choose whether the route terminates.');if(r.termination&&next.length)throw new Error('A termination cannot also have outgoing routes.');
  return {id:r.id,name,kind,direction,points,termination:r.termination,next,provenance:{status,sourceUrl,locator,notes}};
 });
 for(const r of routes)for(const id of r.next){const target=routes.find(x=>x.id===id);if(!target||target===r)throw new Error('Outgoing connections must name another route.');if(distance(oriented(r).at(-1),oriented(target)[0])>1)throw new Error('Connected routes must share an endpoint within 1 km; coordinates are never joined automatically.');}
 const hops=input.maxHops??3,captureKm=input.captureKm??400;if(!Number.isInteger(hops)||hops<1||hops>12||!Number.isFinite(captureKm)||captureKm<10||captureKm>1400)throw new Error('Use 1–12 downstream hops and a 10–1,400 km capture radius.');
 return {schema:'seismosphere.routes.v1',status:routes.length&&routes.every(r=>r.provenance.status==='source-traced')?'source-traced-unvalidated':'illustrative-or-mixed',provenance:text(input.provenance,2000)||'Configurable research hypotheses; source tracing is not validation of physical transfer.',maxHops:hops,captureKm,routes};
}
export const oriented=r=>r.direction==='reverse'?[...r.points].reverse():r.points;
// Explicit waypoint graph: proximity never creates an edge, and each walk is bounded.
export function routeWalks(network,source,{reflection=true}={}){
 const output=[];for(const route of network.routes){const points=oriented(route);let start=0;for(let i=1;i<points.length;i++)if(distance(source,points[i])<distance(source,points[start]))start=i;
  if(distance(source,points[start])>(network.captureKm??1400))continue;
  const queue=[{route,index:start,path:[source,points[start]],ids:[route.id],seen:new Set([route.id+':'+start]),hops:0,reflected:false}];
  while(queue.length&&output.length<64){const w=queue.shift(),p=oriented(w.route);if(w.hops>=(network.maxHops??2))continue;
   const next=[];if(w.index<p.length-1&&!w.reflected)next.push({route:w.route,index:w.index+1,reflected:false});else if(w.reflected&&w.index>0)next.push({route:w.route,index:w.index-1,reflected:true});else if(w.index===p.length-1){for(const id of w.route.next??[]){const r=network.routes.find(r=>r.id===id);if(r)next.push({route:r,index:1,reflected:false});}if(reflection&&w.route.termination&&w.index>0)next.push({route:w.route,index:w.index-1,reflected:true});}
   for(const n of next){const key=n.route.id+':'+n.index+':'+n.reflected;if(w.seen.has(key))continue;const center=oriented(n.route)[n.index],path=[...w.path,center],ids=[...new Set([...w.ids,n.route.id])],seen=new Set(w.seen);seen.add(key);output.push({center,path,route:n.route,routeIds:ids,reflected:n.reflected,hops:w.hops+1});queue.push({...n,path,ids,seen,hops:w.hops+1});}
  }
 }return output;
}
export class RouteHistory{
 constructor(store,initial){this.store=store;store.db.exec(`CREATE TABLE IF NOT EXISTS route_versions(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,body TEXT NOT NULL);CREATE TRIGGER IF NOT EXISTS frozen_route_update BEFORE UPDATE ON route_versions BEGIN SELECT RAISE(ABORT,'Route versions are immutable'); END;CREATE TRIGGER IF NOT EXISTS frozen_route_delete BEFORE DELETE ON route_versions BEGIN SELECT RAISE(ABORT,'Route versions are immutable'); END;`);if(!store.get('activeRoutes'))this.save({network:initial,note:'Imported existing illustrative route network',baseVersion:null});}
 current(){return this.get(this.store.get('activeRoutes'));}
 get(id){const r=this.store.db.prepare('SELECT body FROM route_versions WHERE id=?').get(id);if(!r)throw new Error('Route version not found.');const value=JSON.parse(r.body),{version,...body}=value;if(hash(body)!==version)throw new Error('Route version integrity failed.');return value;}
 list(){return this.store.db.prepare('SELECT id,created_at FROM route_versions ORDER BY created_at DESC,rowid DESC').all().map(r=>({version:r.id,createdAt:r.created_at}));}
 save({network,note,baseVersion}){const active=this.store.get('activeRoutes');if(active!==baseVersion)throw new Error('The active network changed. Reload before saving.');const body={...validateRoutes(network),parentVersion:active,note:text(note,500),createdAt:Date.now()};if(!body.note)throw new Error('Describe this revision before saving.');const version=hash(body),value={...body,version};this.store.db.exec('BEGIN IMMEDIATE');try{this.store.db.prepare('INSERT INTO route_versions VALUES(?,?,?)').run(version,body.createdAt,JSON.stringify(value));this.store.set('activeRoutes',version);this.store.db.exec('COMMIT');}catch(e){this.store.db.exec('ROLLBACK');throw e;}return value;}
}
