import test from 'node:test';
import assert from 'node:assert/strict';
import {stressGrid,stressDifference} from '../public/stress-grid.js';
test('saved stress grids retain coordinate/value pairing across input order and reject irregular sampling',()=>{
  const points=[{xKm:-1,yKm:-1,depthKm:10},{xKm:-1,yKm:1,depthKm:10},{xKm:1,yKm:-1,depthKm:10},{xKm:1,yKm:1,depthKm:10}],values=points.map(p=>({coulombPa:10*p.xKm+p.yKm})),record={report:{points,values}},original=structuredClone(record),view=stressGrid(record);
  assert.deepEqual(view.grid,{n:2,depth:10,east:0,north:0,extent:1});assert.deepEqual(view.report.values.map(v=>v.coulombPa),[-9,11,-11,9]);assert.deepEqual(record,original);
  assert.deepEqual(stressGrid({report:{points:[...points].reverse(),values:[...values].reverse()}}),view);
  for(const changed of [points.slice(1),[points[0],points[0],points[2],points[3]],points.map((p,i)=>i===0?{...p,depthKm:20}:p),points.map(p=>({...p,xKm:p.xKm*2}))])assert.throws(()=>stressGrid({report:{points:changed,values}}));
});
test('stress comparison matches coordinates, subtracts current minus baseline and preserves masks',()=>{
  const points=[{xKm:-1,yKm:-1,depthKm:10},{xKm:-1,yKm:1,depthKm:10},{xKm:1,yKm:-1,depthKm:10},{xKm:1,yKm:1,depthKm:10}];
  const current={sourceId:'same',report:{points,values:[1,2,3,4].map(v=>({coulombPa:v*10,shearPa:v*6,unclampingPa:v*8}))}},baseline=structuredClone(current);
  baseline.report.points.reverse();baseline.report.values.reverse();baseline.report.values.forEach(v=>{for(const k in v)v[k]/=2;});baseline.report.values[0]=null;
  const originals=structuredClone([current,baseline]),delta=stressDifference(current,baseline);
  assert.deepEqual(delta.values,[{coulombPa:10,shearPa:6,unclampingPa:8},null,{coulombPa:5,shearPa:3,unclampingPa:4},{coulombPa:15,shearPa:9,unclampingPa:12}]);
  assert.equal(delta.excludedCount,1);assert.deepEqual([current,baseline],originals);
  assert.throws(()=>stressDifference(current,{...baseline,sourceId:'other'}),/same archived source/);
  const shifted=structuredClone(baseline);shifted.report.points.forEach(p=>p.depthKm++);assert.throws(()=>stressDifference(current,shifted),/identical sampling/);
  const invalid=structuredClone(current);invalid.report.values[0].shearPa=NaN;assert.throws(()=>stressDifference(current,invalid),/invalid stress/);
});
