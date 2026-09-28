import test from 'node:test';
import assert from 'node:assert/strict';
import {stressGrid} from '../public/stress-grid.js';
test('saved stress grids retain coordinate/value pairing across input order and reject irregular sampling',()=>{
  const points=[{xKm:-1,yKm:-1,depthKm:10},{xKm:-1,yKm:1,depthKm:10},{xKm:1,yKm:-1,depthKm:10},{xKm:1,yKm:1,depthKm:10}],values=points.map(p=>({coulombPa:10*p.xKm+p.yKm})),record={report:{points,values}},original=structuredClone(record),view=stressGrid(record);
  assert.deepEqual(view.grid,{n:2,depth:10,east:0,north:0,extent:1});assert.deepEqual(view.report.values.map(v=>v.coulombPa),[-9,11,-11,9]);assert.deepEqual(record,original);
  assert.deepEqual(stressGrid({report:{points:[...points].reverse(),values:[...values].reverse()}}),view);
  for(const changed of [points.slice(1),[points[0],points[0],points[2],points[3]],points.map((p,i)=>i===0?{...p,depthKm:20}:p),points.map(p=>({...p,xKm:p.xKm*2}))])assert.throws(()=>stressGrid({report:{points:changed,values}}));
});
