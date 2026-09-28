import test from 'node:test';import assert from 'node:assert/strict';
import {boundaryExposure,fitTectonic,tectonicComparison,tectonicCell} from '../server/tectonic-baseline.mjs';
const geometry={features:[{geometry:{type:'LineString',coordinates:[[170,0],[-170,0]]}}]};
test('tectonic geometry crosses the dateline without depositing length in Greenwich',()=>{
 const e=boundaryExposure(geometry);assert.ok(e.totalLengthKm>2200&&e.totalLengthKm<2230);assert.equal(e.lengthKm.filter(x=>x>0).length,2);assert.equal(e.lengthKm[tectonicCell(0,0)],0);assert.ok(Math.abs(e.lengthKm.reduce((a,b)=>a+b)-e.totalLengthKm)<1e-9);
 assert.throws(()=>boundaryExposure({features:[]}),/No usable/);
});
test('tectonic fit preserves total rate and never uses test events or outcomes for selection',()=>{
 const events=[{id:'a',type:'earthquake',lat:0,lon:179,mag:5,time:1},{id:'b',type:'earthquake',lat:0,lon:-179,mag:5,time:2},{id:'cutoff',type:'earthquake',lat:0,lon:0,mag:5,time:0}];
 const parent={id:'fixture',options:{minMagnitude:5},scores:{train:{firstCutoff:0,lastEnd:10,windows:1,models:{graph:{events:2}}},test:{firstCutoff:20,lastEnd:30,models:{graph:{logLikelihood:-72}}}},testWindows:[{observed:Array(72).fill(0),graph:Array(72).fill(1)}]};
 const before=tectonicComparison(parent,events,geometry);assert.equal(before.fit.alpha,.99);assert.ok(before.fit.cells.every(x=>x>0));assert.ok(Math.abs(before.fit.cells.reduce((a,b)=>a+b)-2)<1e-12);assert.ok(Math.abs(before.test.logLikelihood+2)<1e-10);assert.equal(before.test.bitsPerEventVsGraph,null);
 parent.testWindows[0].observed[0]=100;const after=tectonicComparison(parent,[...events,{...events[0],time:25,lat:50,lon:0}],geometry);assert.deepEqual(after.fit,before.fit);assert.equal(after.test.events,100);
 const uniform=fitTectonic(Array(72).fill(1),1,boundaryExposure(geometry));assert.equal(uniform.alpha,0);
});
