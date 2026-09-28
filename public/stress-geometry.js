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
export function stressLegend(evidence){
  const r=evidence.result.options.receiver,depth=evidence.result.report.points[0].depthKm;
  return [`STATIC STRESS · ${evidence.baseline?'CURRENT − BASELINE':'COULOMB CHANGE'} · blue −${evidence.limitMPa} / orange +${evidence.limitMPa} MPa`,
    `${depth} km samples · receiver ${r.strike}/${r.dip}/${r.rake}° · ${evidence.depthScale}× depth · NOT A FORECAST${evidence.rupturePatches?' · amber outlines: source patches':''}`];
}
export function ruptureCorners(p){
  const {xStartKm:x,yStartKm:y,xEndKm:xx,yEndKm:yy,topKm:top,bottomKm:bottom,dipDeg:dip}=p,length=Math.hypot(xx-x,yy-y);
  if(![x,y,xx,yy,top,bottom,dip].every(Number.isFinite)||!length||top<0||bottom<=top||dip<=0||dip>90)throw new Error('Invalid rupture patch geometry');
  const horizontal=(bottom-top)/Math.tan(dip*Math.PI/180),dx=horizontal*(yy-y)/length,dy=-horizontal*(xx-x)/length;
  return [{xKm:x,yKm:y,depthKm:top},{xKm:xx,yKm:yy,depthKm:top},{xKm:xx+dx,yKm:yy+dy,depthKm:bottom},{xKm:x+dx,yKm:y+dy,depthKm:bottom}];
}
