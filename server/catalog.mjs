export function normalize(feature,provider='USGS'){
  if(!feature||typeof feature!=='object')return null;
  let p=feature.properties??{},c=feature.geometry?.coordinates,source={};
  if(provider==='EMSC'){
    // EMSC JSON is GeoJSON-shaped, but its timestamps, depth sign and ISF types differ from USGS.
    const code=typeof p.evtype==='string'?p.evtype.trim().toLowerCase():'',types={e:'earthquake',r:'rock burst',i:'induced event',m:'mining explosion',h:'chemical explosion',x:'experimental explosion',n:'nuclear explosion'};
    const type=['de','fe'].includes(code)?'earthquake':code==='ls'?'landslide':/^[ks][erimhxn]$/.test(code)?types[code[1]]:'unknown';
    source={sourceType:p.evtype??null,typeCertainty:code[0]==='s'?'suspected':code[0]==='k'?'known':code==='fe'?'felt':code==='de'?'damaging':'unknown',providerFields:{sourceId:p.source_id??null,catalog:p.source_catalog??null,unid:p.unid??null,time:p.time??null,lastupdate:p.lastupdate??null,depth:p.depth??null}};
    c=Array.isArray(c)?[c[0],c[1],p.depth]:c;
    p={mag:p.mag,time:typeof p.time==='string'?Date.parse(p.time):NaN,updated:typeof p.lastupdate==='string'?Date.parse(p.lastupdate):NaN,place:p.flynn_region,magType:p.magtype,net:p.auth,type};
    if(!Number.isFinite(p.updated))return null;
  }
  if(!['string','number'].includes(typeof feature.id)||!String(feature.id).length)return null;
  if(!Array.isArray(c)||c.length<3||![c[0],c[1],c[2],p.mag,p.time].every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90||c[2]<-10||c[2]>1000||p.mag< -3||p.mag>11)return null;
  const aliases=[...new Set([String(feature.id),...(typeof p.ids==='string'?p.ids.split(',').map(s=>s.trim()).filter(Boolean):[])])].map(id=>`${provider}:${id}`).sort();
  return {id:`${provider}:${feature.id}`,sourceId:String(feature.id),provider,aliases,lat:c[1],lon:c[0],depth:c[2],mag:p.mag,time:p.time,updated:Number.isFinite(p.updated)?p.updated:p.time,place:p.place??'Unnamed seismic event',magType:p.magType??'unknown',url:p.url??null,status:p.status??'unknown',type:p.type??'earthquake',tsunami:p.tsunami===1,net:p.net??provider,...source};
}
async function fetchJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'SeismoSphere/0.1 (local research)'}});if(!r.ok)throw new Error(`Catalog returned HTTP ${r.status}`);return r.json();}
export async function liveCatalog(){
  const url='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
  const data=await fetchJSON(url);
  if(!Array.isArray(data.features))throw new Error('Invalid USGS response');
  return {events:data.features.map(f=>normalize(f)).filter(Boolean),url,generated:data.metadata?.generated??Date.now(),fetchedAt:Date.now()};
}
export function normalizeDeletions(features,url){
  const events=[],quarantined=[];
  for(const f of features){
    if(f.properties?.status!=='deleted'||!Number.isFinite(f.properties?.time)||!Number.isFinite(f.properties?.updated))throw new Error('Unrecognized deletion record; cursor not advanced');
    // Some actual ComCat deletion entries have empty id, net, code and ids fields.
    // Keep the raw record for reconciliation. Never infer an identity from its coordinates.
    if(!['string','number'].includes(typeof f.id)||!String(f.id)){quarantined.push({reason:'Provider deletion has no event identifier',source:url,feature:f});continue;}
    events.push(normalize(f)??{id:`USGS:${f.id}`,sourceId:String(f.id),provider:'USGS',time:f.properties.time,updated:f.properties.updated,status:'deleted',deletionSource:url});
  }
  return {events,quarantined};
}
export async function deletedCatalog(since){
  if(!Number.isFinite(since))throw new Error('Invalid deletion synchronization cutoff');
  // Query by provider update time, including old origins. Absence from a rolling feed is never a deletion.
  const params=new URLSearchParams({format:'geojson',includedeleted:'only',starttime:'1900-01-01',updatedafter:new Date(since).toISOString(),limit:'20000'});
  const url='https://earthquake.usgs.gov/fdsnws/event/1/query?'+params,data=await fetchJSON(url);
  if(!Array.isArray(data.features)||data.features.length>=20000)throw new Error('Deletion response is invalid or truncated');
  return {...normalizeDeletions(data.features,url),url,fetchedAt:Date.now()};
}
