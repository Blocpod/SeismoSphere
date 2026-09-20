import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nearbyVolcanoes} from '../public/volcano-data.js';
const sha=v=>createHash('sha256').update(v).digest('hex');let cached;
export async function volcanoDataset(){
  if(!cached)cached=(async()=>{const config=JSON.parse(await readFile('config/volcano-source.json','utf8')),raw=await readFile('public/assets/gvp-volcanoes.json'),data=JSON.parse(raw);if(data.schema!=='seismosphere.volcanoes.v1'||data.volcanoes?.length!==config.count||sha(JSON.stringify(data.volcanoes))!==config.normalizedSha256||!Number.isFinite(Date.parse(data.provenance?.retrievedAt)))throw new Error('Volcano dataset failed its reviewed content pin');return {data,sha256:sha(raw)};})().catch(e=>{cached=null;throw e;});return cached;
}
export function volcanoEvidence(data,{id,event,asOf}){
  if(!Number.isFinite(asOf))throw new Error('Invalid volcano evidence cutoff');
  if(asOf<Date.parse(data.provenance.retrievedAt))return {available:false,reason:'This volcano reference was received after the analysis cutoff. Its later eruption-year and geological attributes are excluded from the AI historical evidence.'};
  const selected=id?data.volcanoes.find(v=>v.id===id):null;if(id&&!selected)throw new Error('Unknown volcano source identity');if(event&&event.time>asOf)throw new Error('Selected earthquake occurs after the cutoff');
  const brief=v=>{const {sourceProperties,...fields}=v;return fields;};
  return {available:true,provenance:data.provenance,selected:selected?brief(selected):null,event:event?{id:event.id,lat:event.lat,lon:event.lon,depth:event.depth,time:event.time}:null,matches:event?nearbyVolcanoes(data.volcanoes,event).map(m=>({...m,volcano:brief(data.volcanoes.find(v=>v.id===m.id))})):[],method:'Spherical epicentral distance to a catalog point, within 500 km. Not hypocentral, vent-boundary or rupture distance.',limitations:['Holocene inclusion is not current eruption, unrest, hazard, or earthquake causation.','Latest recorded eruption year is metadata from this database version, not a continuous activity feed.','A nearby volcano does not establish a volcanic earthquake or a pressure pathway.','Summit elevation in meters relative to sea level is metadata; surface symbols do not depict terrain, volcano shape or magma chambers.','This reference is not used by the forecasting engines.']};
}
