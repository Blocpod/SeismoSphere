// Spherical oblique coordinates. Vectors follow the renderer's x/north/-east convention.
export const SECTION_EARTH_KM=6371.0088;
const R=SECTION_EARTH_KM,rad=Math.PI/180,clamp=x=>Math.max(-1,Math.min(1,x));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const d=Math.hypot(...a);if(d<1e-10)throw new Error('Section endpoints are coincident or antipodal');return a.map(v=>v/d);};
export const surfaceVector=({lat,lon})=>[Math.cos(lat*rad)*Math.cos(lon*rad),Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad)];
const latLon=v=>({lat:Math.asin(clamp(v[1]))/rad,lon:Math.atan2(-v[2],v[0])/rad});
export function makeSection({lat,lon,bearing=0,lengthKm=6000,halfWidthKm=100}){
  if(![lat,lon,bearing,lengthKm,halfWidthKm].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lon)>180||bearing<0||bearing>=360||lengthKm<50||lengthKm>18000||halfWidthKm<10||halfWidthKm>500)throw new Error('Choose valid coordinates, bearing 0–359.99°, length 50–18,000 km and half-width 10–500 km.');
  const radial=surfaceVector({lat,lon}),north=[-Math.sin(lat*rad)*Math.cos(lon*rad),Math.cos(lat*rad),Math.sin(lat*rad)*Math.sin(lon*rad)],east=[-Math.sin(lon*rad),0,-Math.cos(lon*rad)],tangent=north.map((v,i)=>v*Math.cos(bearing*rad)+east[i]*Math.sin(bearing*rad)),normal=cross(radial,tangent);
  const section={lat,lon,bearing,lengthKm,halfWidthKm,radial,tangent,normal};
  return {...section,start:latLon(sectionVector(-lengthKm/2,0,section)),end:latLon(sectionVector(lengthKm/2,0,section))};
}
export function sectionFromEndpoints(start,end,halfWidthKm=100){
  for(const p of [start,end])if(!p||![p.lat,p.lon].every(Number.isFinite)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw new Error('Choose valid endpoint coordinates');
  const a=surfaceVector(start),b=surfaceVector(end),radial=norm(a.map((v,i)=>v+b[i])),tangent=norm(b.map((v,i)=>v-a[i])),center=latLon(radial),basis=makeSection({...center,bearing:0,lengthKm:6000,halfWidthKm}),east=cross(basis.tangent,radial),bearing=(Math.atan2(dot(tangent,east),dot(tangent,basis.tangent))/rad+360)%360,lengthKm=2*Math.atan2(Math.hypot(...a.map((v,i)=>v-b[i])),Math.hypot(...a.map((v,i)=>v+b[i])))*R;
  return makeSection({...center,bearing,lengthKm,halfWidthKm});
}
export function sectionCoordinates(point,s){
  const v=surfaceVector(point),alongKm=Math.atan2(dot(v,s.tangent),dot(v,s.radial))*R,crossKm=Math.asin(clamp(dot(v,s.normal)))*R;
  return {alongKm,crossKm,inside:Math.abs(alongKm)<=s.lengthKm/2+1e-7&&Math.abs(crossKm)<=s.halfWidthKm+1e-7};
}
export function sectionVector(alongKm,depthKm,s){const angle=alongKm/R,radius=1-depthKm/R;return s.radial.map((v,i)=>(v*Math.cos(angle)+s.tangent[i]*Math.sin(angle))*radius);}
// Three.js discards the negative side of every supplied plane when clipIntersection is true.
export function cutawayNormals(frame,mode='wedge',side=1){
  if(!['wedge','hemisphere'].includes(mode)||![1,-1].includes(side))throw new Error('Choose a radial wedge or hemisphere and a valid hemisphere side');
  return mode==='hemisphere'?[frame.normal.map(v=>-v*side)]:[frame.normal.map(v=>-v),frame.radial.map(v=>-v)];
}
// Source line segments are linear in the oblique profile coordinates; clip both ends.
export function clipSectionSegment(a,b,s){
  if(Math.abs(b.alongKm-a.alongKm)>Math.PI*R)return null; // projection's opposite-meridian seam
  let lo=0,hi=1;
  for(const [key,min,max] of [['alongKm',-s.lengthKm/2,s.lengthKm/2],['crossKm',-s.halfWidthKm,s.halfWidthKm]]){
    const delta=b[key]-a[key];if(Math.abs(delta)<1e-12){if(a[key]<min||a[key]>max)return null;continue;}
    const t0=(min-a[key])/delta,t1=(max-a[key])/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return null;
  }
  return [lo,hi].map(t=>({alongKm:a.alongKm+(b.alongKm-a.alongKm)*t,crossKm:a.crossKm+(b.crossKm-a.crossKm)*t}));
}
