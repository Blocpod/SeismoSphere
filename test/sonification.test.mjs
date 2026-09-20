import test from 'node:test';
import assert from 'node:assert/strict';
import {toneParameters,plottedAudioEvents,updateListener} from '../public/sonification.js';
test('catalog audio preserves cutoff, spherical location and monotonic mappings',()=>{
  const e={id:'test',lat:0,lon:0,depth:0,mag:6,time:0},fresh=toneParameters(e,0),old=toneParameters(e,8*86400000),deep=toneParameters({...e,depth:700},0);
  assert.deepEqual(fresh.position,[1,0,-0]);assert.equal(fresh.frequencyHz,990);assert.equal(deep.frequencyHz,110);assert.ok(Math.abs(deep.position[0]-(1-700/6371.0088))<1e-12);
  assert.ok(Math.abs(old.ageGain-Math.exp(-1))<1e-12);assert.ok(old.peakGain<fresh.peakGain);assert.ok(toneParameters({...e,mag:7},0).peakGain>fresh.peakGain);assert.equal(toneParameters(e,1000*86400000).ageGain,.08);
  assert.ok(Math.abs(toneParameters({...e,lon:90},0).position[2]+1)<1e-12);assert.ok(Math.abs(toneParameters({...e,lat:90},0).position[1]-1)<1e-12);
  assert.ok(toneParameters({...e,depth:-2},0).position[0]>1);assert.ok(toneParameters({...e,mag:-10000},0).peakGain>0);
  assert.deepEqual(plottedAudioEvents({eventGroup:{children:[{visible:false,userData:{events:[e]}},{visible:true,userData:{events:[{...e,id:'shown'}]}},{visible:true,userData:{events:[{...e,id:'shown'}]}}]}}).map(e=>e.id),['shown']);
  const legacy={},camera={updateMatrixWorld(){},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1]}};updateListener({listener:{setPosition(...p){legacy.position=p;},setOrientation(...p){legacy.orientation=p;}}},camera);assert.deepEqual(legacy.position,[2,3,4]);assert.equal(legacy.orientation[2],-1);assert.equal(legacy.orientation[4],1);
  assert.throws(()=>toneParameters({...e,time:1},0));assert.throws(()=>toneParameters({...e,lat:91},0));assert.throws(()=>toneParameters({...e,mag:NaN},0));assert.throws(()=>toneParameters(e,NaN));
});
