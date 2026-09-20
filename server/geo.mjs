export const R = 6371.0088;
export const DAY = 86400000;
const rad = Math.PI / 180;
export const longitudeWidth=b=>b.east>=b.west?b.east-b.west:b.east-b.west+360;
export function validateBounds(input){
  if(!input||typeof input!=='object')throw new Error('A geographic rectangle is required');
  const b=Object.fromEntries(['south','north','west','east'].map(k=>[k,input[k]===''||input[k]===null?NaN:Number(input[k])]));
  if(!Object.values(b).every(Number.isFinite)||b.south< -90||b.north>90||b.south>=b.north||Math.abs(b.west)>180||Math.abs(b.east)>180||longitudeWidth(b)<=0)throw new Error('Use ordered latitudes within ±90° and distinct longitudes within ±180°. West > east crosses the dateline.');
  return b;
}
export function insideBounds(p,b){return !b||p.lat>=b.south&&p.lat<=b.north&&((p.lon-b.west+360)%360)<=longitudeWidth(b)+1e-10;}
export function boundsContain(outer,inner){
  if(!outer)return true;
  if(!inner)return outer.south===-90&&outer.north===90&&longitudeWidth(outer)===360;
  return outer.south<=inner.south&&outer.north>=inner.north&&(longitudeWidth(outer)===360||((inner.west-outer.west+360)%360)+longitudeWidth(inner)<=longitudeWidth(outer)+1e-10);
}
export function circleBounds(lat,lon,radiusKm){
  if(![lat,lon,radiusKm].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lon)>180||radiusKm<=0||radiusKm>Math.PI*R)throw new Error('Invalid spherical circle');
  const angle=radiusKm/R,south=Math.max(-90,lat-angle/rad),north=Math.min(90,lat+angle/rad);
  if(south===-90||north===90)return {south,north,west:-180,east:180};
  const width=Math.asin(Math.min(1,Math.sin(angle)/Math.cos(lat*rad)))/rad;
  return {south,north,west:((lon-width+540)%360)-180,east:((lon+width+540)%360)-180};
}
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function distance(a, b) {
  const dlat = (b.lat-a.lat)*rad, dlon = (b.lon-a.lon)*rad;
  return 2*R*Math.asin(Math.sqrt(clamp(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2,0,1)));
}
export function xyz(p, radius = 1) {
  return [radius*Math.cos(p.lat*rad)*Math.cos(p.lon*rad), radius*Math.sin(p.lat*rad), -radius*Math.cos(p.lat*rad)*Math.sin(p.lon*rad)];
}
export function midpoint(a,b) {
  const x=xyz(a),y=xyz(b),v=x.map((n,i)=>n+y[i]);
  if(Math.hypot(...v)<1e-10) throw new Error('Antipodal points have no unique midpoint');
  return {lat:Math.atan2(v[1],Math.hypot(v[0],v[2]))/rad,lon:Math.atan2(-v[2],v[0])/rad};
}
export function interpolate(a,b,t) {
  const x=xyz(a), y=xyz(b), omega=Math.acos(clamp(x.reduce((s,n,i)=>s+n*y[i],0),-1,1));
  if(omega<1e-8)return {...a};
  if(Math.PI-omega<1e-8)throw new Error('Ambiguous antipodal path');
  const v=x.map((n,i)=>(Math.sin((1-t)*omega)*n+Math.sin(t*omega)*y[i])/Math.sin(omega));
  return {lat:Math.atan2(v[1],Math.hypot(v[0],v[2]))/rad,lon:Math.atan2(-v[2],v[0])/rad};
}
export function pathMidpoint(points) {
  if(points.length<2)throw new Error('A path needs two points');
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p));
  let remain=lengths.reduce((a,b)=>a+b,0)/2;
  for(let i=0;i<lengths.length;i++){if(remain<=lengths[i])return interpolate(points[i],points[i+1],lengths[i]?remain/lengths[i]:0);remain-=lengths[i];}
  return points.at(-1);
}
export const moment = m => 10**(1.5*m+9.1);
export const equivalentMagnitude = magnitudes => (Math.log10(magnitudes.reduce((s,m)=>s+moment(m),0))-9.1)/1.5;
export function destination(p,bearing,km) {
  const d=km/R,b=bearing*rad,lat=p.lat*rad,lon=p.lon*rad;
  const phi=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b));
  return {lat:phi/rad,lon:((lon+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(phi)))/rad+540)%360-180};
}
export function seeded(seed=1){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
