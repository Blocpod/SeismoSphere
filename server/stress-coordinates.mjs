import assert from 'node:assert/strict';
import {destination,distance,R} from './geo.mjs';

// The INP origin alone does not identify its projection. Test this candidate
// against the same product's independently published geographic patch centers.
export function checkCoordinates(model,fsp){
  assert.match(fsp,/Coordinates are given for center of each subfault/,'FSP must explicitly describe patch centers');
  assert.match(fsp,/% LAT LON X==EW Y==NS Z SLIP RAKE TRUP RISE SF_MOMENT/,'Unsupported FSP columns');
  const rows=fsp.split(/\r?\n/).filter(s=>s.trim()&&!s.trimStart().startsWith('%')).map(s=>s.trim().split(/\s+/).map(Number));
  assert.equal(rows.length,model.patches.length,'Patch count differs');
  assert.ok(rows.length>0,'Empty reference');
  const errors=rows.map((row,i)=>{
    assert.ok(row.length===10&&row.every(Number.isFinite),'Invalid FSP row');
    const [lat,lon,,,depth,slip,rake]=row,p=model.patches[i];
    assert.ok(Math.abs(lat)<=90&&Math.abs(lon)<=180,'Invalid geographic reference');
    assert.ok(Math.abs(depth-(p.topKm+p.bottomKm)/2)<=.001,'Patch depth/order mismatch');
    assert.ok(Math.abs(slip-p.slipM)<=.0002,'Patch slip/order mismatch');
    assert.ok(Math.abs(((rake-p.rakeDeg+540)%360)-180)<=.001,'Patch rake/order mismatch');
    const dx=p.xEndKm-p.xStartKm,dy=p.yEndKm-p.yStartKm,length=Math.hypot(dx,dy),halfHorizontal=(p.bottomKm-p.topKm)/Math.tan(p.dipDeg*Math.PI/180)/2;
    const east=(p.xStartKm+p.xEndKm)/2+halfHorizontal*dy/length,north=(p.yStartKm+p.yEndKm)/2-halfHorizontal*dx/length;
    const mapped=destination(model.origin,Math.atan2(east,north)*180/Math.PI,Math.hypot(east,north));
    return distance(mapped,{lat,lon});
  });
  const maxErrorKm=Math.max(...errors),rmsErrorKm=Math.sqrt(errors.reduce((sum,e)=>sum+e*e,0)/errors.length);
  assert.ok(Number.isFinite(maxErrorKm)&&maxErrorKm<=.05,`Spherical projection fails 50 m tolerance: maximum ${maxErrorKm} km`);
  return {projection:'spherical azimuthal equidistant',earthRadiusKm:R,origin:model.origin,patches:rows.length,maxErrorKm,rmsErrorKm,toleranceKm:.05,
    scope:'Agreement with this companion file only; not a universal INP projection or source-model accuracy estimate. FSP X/Y columns are not used as geographic coordinates.'};
}
