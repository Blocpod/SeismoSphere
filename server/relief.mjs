import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reliefGrid} from '../public/relief-grid.js';
let cached;
export async function reliefDataset(){
 if(!cached)cached=(async()=>{const [pin,raw]=await Promise.all([readFile('config/relief-source.json','utf8'),readFile('public/assets/relief.bin')]),metadata=JSON.parse(pin);if(createHash('sha256').update(raw).digest('hex')!==metadata.sha256||!Number.isFinite(Date.parse(metadata.receivedAt)))throw new Error('Relief grid integrity mismatch. Run node scripts/setup-relief.mjs.');return {metadata,grid:reliefGrid(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),metadata)};})().catch(e=>{cached=null;throw e;});return cached;
}
export async function reliefSource(){const {metadata}=await reliefDataset(),raw=await readFile('data/geology/relief-source/surface-9arcmin.dods');if(createHash('sha256').update(raw).digest('hex')!==metadata.sourceSha256)throw new Error('Relief source integrity mismatch.');return raw;}
export function reliefEvidence(dataset,point,asOf){
 if(!Number.isFinite(asOf)||asOf<Date.parse(dataset.metadata.receivedAt))throw new Error('This relief reference was received after the analysis cutoff.');
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))throw new Error('Choose a numeric relief latitude and longitude.');
 return {query:{lat:point.lat,lon:point.lon},sample:dataset.grid.nearest(point.lat,point.lon),provenance:dataset.metadata,policy:'Nearest retained grid cell is rounded to metres; interpolatedM is a display interpolation, not a surveyed height at the query. Negative values are below the EGM2008 geoid, not earthquake depth. Relief exaggeration is a display setting and never multiplies these source values. This static composite is not a current survey, crust thickness, pressure field, forecast factor or earthquake precursor.'};
}
