import test from 'node:test';
import assert from 'node:assert/strict';
import {pulseForecasts} from '../public/forecast-pulse.js';
test('active forecast pulse changes opacity only and stops for reduced/scientific presentation',()=>{
 const marker={userData:{forecastPulse:{from:10,until:20,opacity:.85}},material:{opacity:.85},position:{x:1,y:2,z:3}},other={userData:{},material:{opacity:.4}};
 const geometry=structuredClone(marker.position);
 pulseForecasts([marker,other],1125,15,true);assert.equal(marker.material.opacity,.85);
 pulseForecasts([marker,other],3375,15,true);assert.ok(Math.abs(marker.material.opacity-.646)<1e-12);
 for(const asOf of [9,20]){pulseForecasts([marker],3375,asOf,true);assert.equal(marker.material.opacity,.85);}
 pulseForecasts([marker],3375,15,false);assert.equal(marker.material.opacity,.85);
 assert.deepEqual(marker.position,geometry);assert.equal(other.material.opacity,.4);
});
