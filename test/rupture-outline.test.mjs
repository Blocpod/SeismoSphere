import test from 'node:test';
import assert from 'node:assert/strict';
import {ruptureCorners,stressPosition,stressLegend} from '../public/stress-geometry.js';
test('rupture outlines retain the solver top edge, right-hand dip and true depths',()=>{
 for(const angle of [0,37,143,270])for(const dip of [19,45,90]){
  const a=angle*Math.PI/180,p={xStartKm:12,yStartKm:-8,xEndKm:12+20*Math.sin(a),yEndKm:-8+20*Math.cos(a),topKm:5,bottomKm:15,dipDeg:dip},c=ruptureCorners(p),width=10/Math.sin(dip*Math.PI/180);
  assert.deepEqual(c[0],{xKm:12,yKm:-8,depthKm:5});assert.equal(c[2].depthKm,15);
  const down=[c[3].xKm-c[0].xKm,c[3].yKm-c[0].yKm,10];assert.ok(Math.abs(Math.hypot(...down)-width)<1e-10);
  assert.ok(Math.abs(down[0]*Math.sin(a)+down[1]*Math.cos(a))<1e-10);assert.ok(down[0]*Math.cos(a)-down[1]*Math.sin(a)>=-1e-10);
  for(const point of c)assert.ok(Math.abs(Math.hypot(...stressPosition({lat:-31.5,lon:-71.6},point))-(1-point.depthKm/6371.0088))<1e-12);
 }
 assert.throws(()=>ruptureCorners({xStartKm:0,yStartKm:0,xEndKm:0,yEndKm:0,topKm:0,bottomKm:10,dipDeg:45}));
 const e={result:{options:{receiver:{strike:19,dip:19,rake:90}},report:{points:[{depthKm:10}]}},limitMPa:1,depthScale:1,rupturePatches:true};assert.match(stressLegend(e)[1],/amber outlines: source patches/);
});
