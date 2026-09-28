import test from 'node:test';
import assert from 'node:assert/strict';
import {countLeaderboard} from '../public/learned-lab.js';
test('count leaderboard ranks shared likelihoods without changing saved scores and rejects incompatible comparisons',()=>{
 const scores={windows:2,firstCutoff:100,lastEnd:200,models:{graph:{events:10,logLikelihood:-30},trainingMean:{events:10,logLikelihood:-40},ensemble:{events:10,logLikelihood:-20}}},before=structuredClone(scores),tectonic={test:{windows:2,events:10,start:100,end:200,logLikelihood:-35}};
 const rows=countLeaderboard(scores,tectonic);assert.deepEqual(rows.map(r=>r.name),['ensemble','graph','tectonic','trainingMean']);assert.equal(rows[2].bitsPerEventVsTrainingMean,5/(10*Math.LN2));assert.deepEqual(scores,before);
 for(const invalid of [{events:11},{events:NaN},{logLikelihood:Infinity}]){const bad=structuredClone(scores);Object.assign(bad.models.ensemble,invalid);assert.throws(()=>countLeaderboard(bad),/do not share/);}
 assert.throws(()=>countLeaderboard(scores,{test:{...tectonic.test,logLikelihood:NaN}}),/finite/);
 for(const key of ['windows','events','start','end'])assert.throws(()=>countLeaderboard(scores,{test:{...tectonic.test,[key]:999}}),/does not share/);
 assert.equal(countLeaderboard({...scores,models:{graph:{events:0,logLikelihood:-1},trainingMean:{events:0,logLikelihood:-2}}},{test:{...tectonic.test,events:0}}).find(r=>r.name==='tectonic').bitsPerEventVsTrainingMean,null);
});
