import test from 'node:test';import assert from 'node:assert/strict';import {runProspectiveChecks} from '../server/prospective-checks.mjs';
test('slow or failed issuance cannot prevent independent assessment and protocol checks',async()=>{
 let release,notices=0;const calls=[],feed={status:'live'};
 const resultPromise=runProspectiveChecks({schedules:{tick(f){assert.equal(f,feed);calls.push('schedules');return new Promise((_,reject)=>release=()=>reject(new Error('invalid frozen schedule')));}},assessments:{tick(){calls.push('assessments');return {changes:2};}},protocols:{tick(){calls.push('protocols');return {changes:1};}}},feed,()=>notices++);
 assert.deepEqual(calls,['schedules','assessments','protocols']);await Promise.resolve();assert.equal(notices,2);release();const result=await resultPromise;
 assert.equal(result.complete,false);assert.equal(result.changes,null);assert.equal(result.completedChanges,3);assert.match(result.schedules.error,/frozen schedule/);assert.equal(result.assessments.changes,2);assert.equal(result.protocols.changes,1);assert.equal(notices,3);
});
test('synchronous failures remain explicit and successful runs retain exact totals',async()=>{
 const result=await runProspectiveChecks({schedules:{tick(){throw new Error('bad record');}},assessments:{tick:()=>({changes:0})},protocols:{tick:()=>({changes:4})}},{});
 assert.equal(result.complete,false);assert.equal(result.protocols.changes,4);assert.equal(result.schedules.changes,null);
 const complete=await runProspectiveChecks({schedules:{tick:()=>({changes:1})},assessments:{tick:()=>({changes:2})},protocols:{tick:()=>({changes:0})}},{});
 assert.equal(complete.complete,true);assert.equal(complete.changes,3);
});
