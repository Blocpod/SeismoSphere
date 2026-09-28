// Piecewise great-circle profiles; no physical fault or pressure route is inferred.
import {sectionFromEndpoints,sectionCoordinates,sectionVector,SECTION_EARTH_KM as R} from './section-geometry.js';
export function curvedSection(points,halfWidthKm=100){
 if(!Array.isArray(points)||points.length<2||points.length>32)throw new Error('Enter 2–32 latitude, longitude waypoints.');
 const segments=[];let lengthKm=0;
 for(let i=1;i<points.length;i++){const frame=sectionFromEndpoints(points[i-1],points[i],halfWidthKm);segments.push({frame,offsetKm:lengthKm});lengthKm+=frame.lengthKm;}
 if(lengthKm>30000)throw new Error('Total curved path must be at most 30,000 km.');
 return {kind:'curved',waypoints:points.map(p=>({lat:p.lat,lon:p.lon})),segments,lengthKm,halfWidthKm,start:points[0],end:points.at(-1)};
}
export function curvedCoordinates(point,path){
 let nearest=null;
 path.segments.forEach(({frame,offsetKm},segmentIndex)=>{
  const c=sectionCoordinates(point,frame),along=Math.max(-frame.lengthKm/2,Math.min(frame.lengthKm/2,c.alongKm));
  // Exact surface distance to the bounded minor arc, including rounded end caps.
  const distanceKm=Math.acos(Math.max(-1,Math.min(1,Math.cos(c.crossKm/R)*Math.cos((c.alongKm-along)/R))))*R;
  if(!nearest||distanceKm<nearest.distanceKm-1e-7)nearest={segmentIndex,distanceKm,crossKm:(c.crossKm<0?-1:1)*distanceKm,alongKm:offsetKm+along+frame.lengthKm/2-path.lengthKm/2,inside:distanceKm<=path.halfWidthKm+1e-7};
 });
 return nearest;
}
export function curvedTrack(path,depthKm=0){return path.segments.flatMap(({frame},i)=>Array.from({length:Math.ceil(frame.lengthKm/25)+1},(_,j)=>sectionVector((j/Math.ceil(frame.lengthKm/25)-.5)*frame.lengthKm,depthKm,frame)).slice(i?1:0));}

export function curvedSlabSamples(features,path){
 const samples=[];
 features.forEach((feature,featureIndex)=>{
  const depth=feature.properties?.depth;if(!Number.isFinite(depth))return;
  const lines=feature.geometry?.type==='LineString'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiLineString'?feature.geometry.coordinates:[];
  lines.forEach((line,lineIndex)=>line.forEach(([lon,lat],nodeIndex)=>{
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
   const projected=curvedCoordinates({lat,lon},path);
   if(projected.inside)samples.push({featureIndex,lineIndex,nodeIndex,region:feature.properties.name??feature.properties.region??null,lat,lon,depth,...projected});
  }));
 });
 return samples;
}
