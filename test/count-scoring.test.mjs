import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreCounts} from '../server/count-forecasts.mjs';
test('shared cell-count scores reject incompatible arrays and reproduce a hand calculation',()=>{
 const observed=Array(72).fill(0);observed[0]=2;
 const models={a:Array(72).fill(.5),b:Array(72).fill(1)},before=structuredClone({models,observed});
 const scores=scoreCounts(models,observed);
 assert.ok(Math.abs(scores.a.logLikelihood-(-36+2*Math.log(.5)-Math.log(2)))<1e-12);
 assert.ok(Math.abs(scores.b.logLikelihood-(-72-Math.log(2)))<1e-12);
 assert.equal(scores.a.events,2);assert.equal(scores.b.events,2);
 assert.deepEqual({models,observed},before);
 for(const value of [-1,NaN,Infinity,.5]){const bad=[...observed];bad[0]=value;assert.throws(()=>scoreCounts(models,bad),/outcomes/);}
 for(const value of [0,-1,NaN,Infinity]){const bad=[...models.a];bad[0]=value;assert.throws(()=>scoreCounts({a:bad},observed),/expectations/);}
 assert.throws(()=>scoreCounts(models,observed.slice(1)),/72/);
 assert.throws(()=>scoreCounts({a:models.a.slice(1)},observed),/72/);
 assert.throws(()=>scoreCounts({a:Array(72)},observed),/72/);
 assert.throws(()=>scoreCounts({},observed),/Every/);
});
