import test from 'node:test';
import assert from 'node:assert/strict';
import {learnedUncertainty} from '../server/learned-uncertainty.mjs';
const week=7*86400000;
const fixture=()=>({id:'fixture',weightsSha256:'frozen',testWindows:Array.from({length:26},(_,i)=>({cutoff:i*week,end:(i+1)*week,observed:Array(72).fill(1),graph:Array(72).fill(1),noNeighbors:Array(72).fill(2),ensemble:Array(72).fill(1),recentRate:Array(72).fill(2)}))});
test('paired block intervals reproduce constant likelihood contrasts without modifying evidence',()=>{
 const report=fixture(),before=JSON.stringify(report),u=learnedUncertainty(report),expected=(1-Math.log(2))/Math.LN2;
 assert.equal(JSON.stringify(report),before);assert.deepEqual(learnedUncertainty(report),u);
 for(const b of u.blocks){assert.equal(b.emptyReplicates,0);assert.equal(b.comparisons[0].validReplicates,2000);for(const key of ['bitsPerEvent','lower','upper'])assert.ok(Math.abs(b.comparisons[0][key]-expected)<1e-12);assert.equal(b.comparisons[1].lower,0);assert.equal(b.comparisons[1].upper,0);}
 report.testWindows[1].cutoff++;assert.throws(()=>learnedUncertainty(report),/consecutive/);
 const invalid=fixture();invalid.testWindows[0].graph[0]=0;assert.throws(()=>learnedUncertainty(invalid),/positive/);
 const empty=fixture();empty.testWindows.forEach(w=>w.observed.fill(0));assert.throws(()=>learnedUncertainty(empty),/No observed/);
});
