import test from 'node:test';import assert from 'node:assert/strict';import {prospectiveCountLeaderboard} from '../server/count-leaderboard.mjs';
const names=['graph','noNeighbors','trainingMean','recentRate','ensemble','tectonic'];
const record=(id,cohort='a')=>({id,cohort,parentRunId:'parent',issuedAt:0,validUntil:10,assessmentDueAt:11,assessment:{id:'assessment-'+id,status:'SCORED',scores:Object.fromEntries(names.map((name,i)=>[name,{events:2,expectedCount:3,logLikelihood:-10+i,meanAbsoluteError:i}]))}});
test('prospective rankings retain paired denominators, exclusions and separate cohorts',()=>{
 const first=record('one'),second={...record('two'),issuedAt:5,validUntil:15},pending={...record('pending'),assessment:null},missed={...record('missed'),assessment:{status:'MISSED_ASSESSMENT'}},legacy={...record('legacy'),assessment:null,assessmentDueAt:null},other=record('different','b');const input=[first,second,pending,missed,legacy,other],before=structuredClone(input),[a,b]=prospectiveCountLeaderboard(input);
 assert.equal(a.issued,5);assert.equal(a.scored,2);assert.equal(a.pending,1);assert.deepEqual(a.excluded,{MISSED_ASSESSMENT:1,LEGACY_NO_ASSESSMENT:1});assert.equal(a.overlappingWindows,true);assert.equal(b.scored,1);assert.equal(b.overlappingWindows,false);assert.equal(a.ranking[0].name,'tectonic');assert.equal(a.ranking[0].events,4);assert.equal(a.ranking[0].bitsPerEventVsTrainingMean,6/(4*Math.LN2));assert.equal(a.ranking[0].meanAbsoluteError,5);assert.deepEqual(input,before);
 assert.equal(prospectiveCountLeaderboard([pending])[0].ranking.length,0);assert.deepEqual(prospectiveCountLeaderboard([]),[]);
 const broken=record('bad');delete broken.assessment.scores.graph;assert.throws(()=>prospectiveCountLeaderboard([broken]),/Incomplete/);
 const unequal=record('bad');unequal.assessment.scores.graph.events=3;assert.throws(()=>prospectiveCountLeaderboard([unequal]),/Incompatible/);
 const empty=record('zero');Object.values(empty.assessment.scores).forEach(s=>s.events=0);assert.ok(prospectiveCountLeaderboard([empty])[0].ranking.every(s=>s.bitsPerEventVsTrainingMean===null));
});
