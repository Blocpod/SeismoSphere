import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonEvidence,comparisonAvailable} from '../public/model-comparison.js';
import {workspaceCommand} from '../public/workspace-commands.js';
test('named DS/ETAS commands open evidence without inventing a common score',()=>{
 assert.deepEqual(workspaceCommand('Compare the Yuri model against ETAS'),{type:'action',action:'modelComparison'});
 assert.equal(workspaceCommand('Do not compare DS against ETAS'),null);
 const e=comparisonEvidence({experimentId:'ds',start:0,end:100,summary:[{engine:'DS',hits:0,forecasts:0,precision:null}]},{id:'etas',fit:{version:'temporal',options:{start:0,end:100,minMagnitude:4}},holdout:null});
 assert.match(e.ds,/hit fraction unavailable/);assert.match(e.etas,/No holdout scored/);assert.match(e.policy,/not a common skill ranking/);assert.match(comparisonEvidence().ds,/No completed/);
});


test('comparison availability excludes future outcomes and later-created strict records',()=>{
 const ds={end:100,createdAt:200},etas={fit:{options:{end:50}},holdout:{end:100},createdAt:200};
 for(const [r,isEtas]of [[ds,false],[etas,true]]){assert.equal(comparisonAvailable(r,99,false,isEtas),false);assert.equal(comparisonAvailable(r,100,false,isEtas),true);assert.equal(comparisonAvailable(r,100,true,isEtas),false);assert.equal(comparisonAvailable(r,200,true,isEtas),true);}
});
