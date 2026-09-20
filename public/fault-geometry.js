// Spherical surface-trace geometry. Distances are epicentral, not rupture distances.
export const EARTH_KM=6371.0088;
const rad=Math.PI/180,clamp=x=>Math.max(-1,Math.min(1,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(...a);return n?a.map(v=>v/n):null;};
export const unit=p=>[Math.cos(p.lat*rad)*Math.cos(p.lon*rad),Math.sin(p.lat*rad),-Math.cos(p.lat*rad)*Math.sin(p.lon*rad)];
const coordinate=v=>({lat:Math.asin(clamp(v[1]))/rad,lon:Math.atan2(-v[2],v[0])/rad});
function closest(p,a,b){
  let q=dot(p,a)>=dot(p,b)?a:b;const n=norm(cross(a,b)),arc=Math.acos(clamp(dot(a,b)));
  // Antipodal endpoints do not define a unique minor arc. Preserve endpoint distance.
  if(n&&arc<Math.PI-1e-10){const d=dot(p,n),foot=norm(p.map((v,i)=>v-d*n[i]));if(foot){
    const along=Math.atan2(dot(n,cross(a,foot)),dot(a,foot));
    if(along>=-1e-10&&along<=arc+1e-10&&dot(p,foot)>dot(p,q))q=foot;
  }}
  return {distanceKm:Math.atan2(Math.hypot(...cross(p,q)),clamp(dot(p,q)))*EARTH_KM,point:coordinate(q),ambiguous:arc>=Math.PI-1e-10};
}
export function nearestOnSegment(p,a,b){return closest(unit(p),unit(a),unit(b));}
export function buildFaultIndex(features){
  const ranges=[];let count=0;
  for(const f of features)for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates)count+=line.length-1;
  const vertices=new Float64Array(count*6);let offset=0;
  for(const f of features){const start=offset;for(const line of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates)for(let i=1;i<line.length;i++){
    vertices.set(unit({lon:line[i-1][0],lat:line[i-1][1]}),offset);vertices.set(unit({lon:line[i][0],lat:line[i][1]}),offset+3);offset+=6;
  }ranges.push({start,end:offset});}
  return {vertices,ranges};
}
export function nearestFaults(index,point,limit=6,maxKm=500){
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180)throw new Error('Invalid query coordinate');
  const p=unit(point),matches=[];let cutoff=maxKm;
  for(let featureIndex=0;featureIndex<index.ranges.length;featureIndex++){
    const {start,end}=index.ranges[featureIndex];let best=null;
    for(let k=start;k<end;k+=6){const a=index.vertices.subarray(k,k+3),b=index.vertices.subarray(k+3,k+6);
      // Triangle inequality excludes segments whose nearer endpoint is too far even after their full length.
      const arc=Math.acos(clamp(dot(a,b))),bound=Math.min(Math.PI,cutoff/EARTH_KM+arc);
      if(Math.max(dot(p,a),dot(p,b))<Math.cos(bound))continue;
      const r=closest(p,a,b);if(r.distanceKm<=cutoff&&(!best||r.distanceKm<best.distanceKm))best={...r,segmentIndex:(k-start)/6};
    }
    if(best){matches.push({featureIndex,...best});matches.sort((a,b)=>a.distanceKm-b.distanceKm||a.featureIndex-b.featureIndex);if(matches.length>limit)matches.length=limit;if(matches.length===limit)cutoff=Math.min(maxKm,matches.at(-1).distanceKm);}
  }
  return matches;
}
