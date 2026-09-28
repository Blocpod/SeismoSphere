import test from 'node:test';
import assert from 'node:assert/strict';
import {stressPosition,stressColor,stressLegend} from '../public/stress-geometry.js';
import {destination,R} from '../server/geo.mjs';
import {unit} from '../public/fault-geometry.js';
test('stress samples map at depth across dateline/poles and share signed MPa colors',()=>{
  for(const origin of [{lat:-31.5952,lon:-71.6728},{lat:89,lon:179},{lat:-89,lon:-179}])for(const [xKm,yKm]of [[0,0],[200,300],[-500,150]]){
    const point={xKm,yKm,depthKm:10},actual=stressPosition(origin,point,3),expected=unit(destination(origin,Math.atan2(xKm,yKm)*180/Math.PI,Math.hypot(xKm,yKm))).map(v=>v*(1-30/R));
    actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-12));assert.ok(Math.abs(Math.hypot(...actual)-(1-30/R))<1e-12);
  }
  assert.deepEqual(stressColor(0,1),[221/255,221/255,221/255]);assert.deepEqual(stressColor(-2e6,1),[43/255,130/255,205/255]);assert.deepEqual(stressColor(2e6,1),[235/255,133/255,68/255]);
  assert.throws(()=>stressPosition({lat:91,lon:0},{xKm:0,yKm:0,depthKm:10}));assert.throws(()=>stressColor(NaN,1));
});
test('export stress legends preserve comparison sign, MPa scale, depth and receiver',()=>{
  const e={result:{options:{receiver:{strike:19,dip:19,rake:90}},report:{points:[{depthKm:10}]}},baseline:{id:'b'},limitMPa:.5,depthScale:3};
  assert.deepEqual(stressLegend(e),['STATIC STRESS · CURRENT − BASELINE · blue −0.5 / orange +0.5 MPa','10 km samples · receiver 19/19/90° · 3× depth · NOT A FORECAST']);
  assert.match(stressLegend({...e,baseline:null})[0],/COULOMB CHANGE/);
});
