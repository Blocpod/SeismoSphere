import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {xyz,R} from './geo.mjs';
export const BOUNDARY_SOURCE={name:'PB2002 classified plate-boundary steps',revision:'b53c3b7d82afd764650ebdc4565b9666795b9d83',source:'https://raw.githubusercontent.com/fraxen/tectonicplates/b53c3b7d82afd764650ebdc4565b9666795b9d83/GeoJSON/PB2002_steps.json',sha256:'528fdeb1d57eb3d4c6e730951eabc6fd7da9dbc5fc7038b9f19100c52b986c9a',citation:'Bird (2003), An updated digital model of plate boundaries, doi:10.1029/2001GC000252; GeoJSON conversion by Hugo Ahlenius / Nordpil',license:'Open Data Commons Attribution License 1.0',licenseUrl:'https://opendatacommons.org/licenses/by/1.0/'};
export const BOUNDARY_TYPES={CCB:'continental convergent boundary',CTF:'continental transform fault',CRB:'continental rift boundary',OSR:'oceanic spreading ridge',OTF:'oceanic transform fault',OCB:'oceanic convergent boundary',SUB:'subduction zone'};
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=n=>Math.max(-1,Math.min(1,n));
export function boundaryIndex(features){return features.map(f=>{
 const p=f.properties,start={lat:p.STARTLAT,lon:p.STARTLONG},end={lat:p.FINALLAT,lon:p.FINALLONG};
 if(!BOUNDARY_TYPES[p.STEPCLASS]||![start,end].every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180))throw new Error('Invalid classified boundary step');
 const a=xyz(start),b=xyz(end),n=cross(a,b),length=Math.atan2(Math.hypot(...n),dot(a,b));
 if(length<1e-10||Math.PI-length<1e-10)throw new Error('Ambiguous boundary step');
 const tangent=cross(n.map(v=>v/Math.hypot(...n)),a);
 return {id:p.SEQNUM,type:p.STEPCLASS,plateBoundary:p.PLATEBOUND,start,end,a,b,tangent,length};
});}
export function nearestBoundary(point,steps){
 const p=xyz(point);let nearest=null;
 for(const s of steps){const along=Math.max(0,Math.min(s.length,Math.atan2(dot(p,s.tangent),dot(p,s.a)))),q=s.a.map((n,i)=>n*Math.cos(along)+s.tangent[i]*Math.sin(along)),distanceKm=Math.acos(clamp(Math.max(dot(p,q),dot(p,s.a),dot(p,s.b))))*R;
  if(!nearest||distanceKm<nearest.distanceKm)nearest={stepId:s.id,type:s.type,label:BOUNDARY_TYPES[s.type],plateBoundary:s.plateBoundary,distanceKm,start:s.start,end:s.end};
 }
 return nearest;
}
let cached;
export function boundaryReference(){
 if(cached)return cached;const file='public/assets/plate-steps.json';if(!existsSync(file))return null;
 const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==BOUNDARY_SOURCE.sha256)throw new Error('Classified boundary source checksum mismatch');
 return cached={provenance:BOUNDARY_SOURCE,steps:boundaryIndex(JSON.parse(bytes).features)};
}
