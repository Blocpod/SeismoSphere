import {unit,EARTH_KM} from './fault-geometry.js';
export function stressPosition(origin,point,depthScale=1){
  if(![origin.lat,origin.lon,point.xKm,point.yKm,point.depthKm,depthScale].every(Number.isFinite)||Math.abs(origin.lat)>90||Math.abs(origin.lon)>180||point.depthKm<0||depthScale<=0)throw new Error('Invalid stress sample coordinates');
  const lat=origin.lat*Math.PI/180,lon=origin.lon*Math.PI/180,base=unit(origin),east=[-Math.sin(lon),0,-Math.cos(lon)],north=[-Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon)],distance=Math.hypot(point.xKm,point.yKm),angle=distance/EARTH_KM;
  const radius=Math.max(.04,1-point.depthKm*depthScale/EARTH_KM);
  return base.map((v,i)=>(v*Math.cos(angle)+(distance?(east[i]*point.xKm+north[i]*point.yKm)*Math.sin(angle)/distance:0))*radius);
}
export function stressColor(value,limit){
  if(!Number.isFinite(value)||!Number.isFinite(limit)||limit<=0)throw new Error('Invalid stress color value');
  const t=Math.max(-1,Math.min(1,value/(limit*1e6))),rgb=t<0?[43,130,205]:[235,133,68];return rgb.map(c=>Math.round(221+(c-221)*Math.abs(t))/255);
}
