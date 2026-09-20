import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hash} from './store.mjs';
let cached;
export async function cratonDataset(){
 if(!cached)cached=(async()=>{const [raw,pinRaw]=await Promise.all([readFile('public/assets/cratons.json','utf8'),readFile('config/craton-source.json','utf8')]),data=JSON.parse(raw),pin=JSON.parse(pinRaw);if(data.provenance?.revision!==pin.revision||hash(data.features)!==pin.featuresSha256||!Number.isFinite(Date.parse(data.provenance.retrievedAt)))throw new Error('Craton dataset integrity mismatch; restore the pinned conversion.');return {...data,sha256:createHash('sha256').update(raw).digest('hex'),featuresSha256:pin.featuresSha256};})().catch(e=>{cached=null;throw e;});return cached;
}
export function cratonEvidence(data,id,asOf){
 if(!Number.isFinite(asOf)||asOf<Date.parse(data.provenance.retrievedAt))throw new Error('This craton reference was received after the analysis cutoff.');const feature=data.features.find(f=>f.id===id);if(!feature)throw new Error('Craton reference region not found.');
 return {id,attributes:feature.properties,provenance:data.provenance,featuresSha256:data.featuresSha256,boundaryRings:feature.geometry.coordinates.length,boundaryVertices:feature.geometry.coordinates.reduce((n,r)=>n+r.length,0),use:'Static geological reference only. No measured pressure, subsurface thickness, event causation or forecast skill is inferred. Source age sentinel fields are not geological ages.'};
}
