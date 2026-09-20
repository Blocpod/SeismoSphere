import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildFaultIndex,nearestFaults} from '../public/fault-geometry.js';
let cached;
export async function faultContext(event,asOf){
  if(!event)return {available:false,reason:'Select a catalog event for a mapped-fault proximity query.'};
  try{
    if(!cached)cached=(async()=>{const raw=await readFile('public/assets/gem-faults.json'),data=JSON.parse(raw);if(data.provenance?.revision!=='56816508ad92fd6846dad1163b1c8c01376a2cd1')throw new Error('Unexpected fault dataset revision');return {data,index:buildFaultIndex(data.features),sha256:createHash('sha256').update(raw).digest('hex')};})().catch(error=>{cached=null;throw error;});
    const {data,index,sha256}=await cached;
    if(asOf<Date.parse(data.provenance.retrievedAt))return {available:false,reason:'This fault dataset was received after the analysis cutoff. It is excluded from the copilot historical evidence; the visual reference layer can still be inspected separately.'};
    return {available:true,source:data.provenance,renderedDatasetSha256:sha256,eventId:event.id,method:'Shortest spherical epicentral distance to mapped minor-arc trace segments, within 500 km. Surface projection only; neither hypocentral distance nor rupture-plane distance.',use:'Geological explanation only; not a causal fault assignment, pressure corridor, calibration input or forecast factor.',matches:nearestFaults(index,event,6,500).map(m=>({...m,attributes:data.features[m.featureIndex].properties}))};
  }catch(error){return {available:false,reason:'Mapped-fault reference unavailable: '+error.message};}
}
