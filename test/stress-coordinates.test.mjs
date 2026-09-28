import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCoordinates} from '../scripts/check-stress-coordinates.mjs';

test('geographic source check rejects misplaced or mismatched companion patches',()=>{
  const model={origin:{lat:0,lon:179.9},patches:[{xStartKm:0,yStartKm:-1,xEndKm:0,yEndKm:1,topKm:1,bottomKm:3,dipDeg:90,slipM:1,rakeDeg:90}]};
  const header='% Coordinates are given for center of each subfault\n% LAT LON X==EW Y==NS Z SLIP RAKE TRUP RISE SF_MOMENT\n';
  const fsp=header+'0 179.9 0 0 2 1 90 0 1 1e18\n';
  assert.ok(checkCoordinates(model,fsp).maxErrorKm<1e-8);
  assert.throws(()=>checkCoordinates({...model,origin:{lat:0,lon:179}},fsp),/50 m tolerance/);
  assert.throws(()=>checkCoordinates(model,header+'0 179.9 0 0 2 2 90 0 1 1e18'),/slip\/order/);
  assert.throws(()=>checkCoordinates(model,fsp+'0 179.9 0 0 2 1 90 0 1 1e18'),/Patch count/);
  assert.throws(()=>checkCoordinates(model,fsp.replace('center of each subfault','corner')),/patch centers/);
});
