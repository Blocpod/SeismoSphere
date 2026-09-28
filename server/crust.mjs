import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeSection,sectionVector} from '../public/section-geometry.js';

export function crustCell(lat,lon){
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw new Error('Invalid crust sample coordinates.');
 const row=Math.min(179,Math.floor(90-lat)),column=Math.floor(((lon+180)%360+360)%360);
 return {row,column,index:row*360+column,lat:89.5-row,lon:-179.5+column};
}
export function crustColumn(names,values){
 if(names.length!==9)throw new Error('Invalid crust layer names.');
 for(const field of ['bnds','vp','vs','rho'])if(values[field]?.length!==9||!values[field].every(Number.isFinite))throw new Error('Invalid crust column.');
 if(['vp','vs','rho'].some(field=>values[field].some(value=>value<0)))throw new Error('Negative crust physical property.');
 const boundaries=values.bnds.map(value=>-value);
 if(boundaries.some((value,i)=>i>0&&value<boundaries[i-1]))throw new Error('Invalid crust boundary ordering.');
 return names.map((name,i)=>({name,topDepthKm:boundaries[i],bottomDepthKm:i<8?boundaries[i+1]:null,thicknessKm:i<8?boundaries[i+1]-boundaries[i]:null,present:i===8||boundaries[i+1]>boundaries[i],vpKmPerSecond:values.vp[i],vsKmPerSecond:values.vs[i],densityGramsPerCubicCm:values.rho[i]}));
}
let loading;
async function load(){
 return loading??=Promise.all([readFile('config/crust1.json','utf8'),...['bnds','vp','vs','rho'].map(field=>readFile('public/assets/crust1/'+field+'.f32'))]).then(([text,...files])=>{
  const metadata=JSON.parse(text),grids={};
  for(const [i,field]of ['bnds','vp','vs','rho'].entries()){
   const bytes=files[i],pin=metadata.files[field];if(bytes.length!==64800*9*4||bytes.length!==pin.bytes||createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new Error('CRUST1.0 asset integrity mismatch.');grids[field]=bytes;
  }
  return {metadata,grids};
 }).catch(error=>{loading=null;throw error;});
}
export async function crustSample(lat,lon){
 const cell=crustCell(lat,lon),{metadata,grids}=await load(),values=Object.fromEntries(Object.entries(grids).map(([field,bytes])=>[field,Array.from({length:9},(_,i)=>bytes.readFloatLE((cell.index*9+i)*4))]));
 return {query:{lat,lon},cell,layers:crustColumn(metadata.layers,values),sourceValues:values,provenance:metadata,policy:'Static one-degree cell-average reference. Signed depth is positive below sea level; negative depths lie above it. Zero-thickness layers are absent. Mantle properties have no specified bottom. No interpolation, local resolution or earthquake association is inferred.'};
}
export function crustProfilePoints(options){
 const frame=makeSection(options),steps=Math.ceil(frame.lengthKm/50);
 return {frame,points:Array.from({length:steps+1},(_,i)=>{const alongKm=(i/steps-.5)*frame.lengthKm,v=sectionVector(alongKm,0,frame);return {alongKm,lat:Math.asin(Math.max(-1,Math.min(1,v[1])))*180/Math.PI,lon:Math.atan2(-v[2],v[0])*180/Math.PI};})};
}
export async function crustProfile(options){
 const {frame,points}=crustProfilePoints(options),samples=[];let provenance;
 for(const point of points){const column=await crustSample(point.lat,point.lon);provenance=column.provenance;samples.push({...point,cell:column.cell,layers:column.layers,sourceValues:column.sourceValues});}
 return {frame,samples,provenance,policy:'Static one-degree cell-average reference sampled along a great-circle profile at intervals no larger than 50 km. Repeated cells are retained; sampling does not increase source resolution. No interpolation between source columns or earthquake association is inferred.'};
}
