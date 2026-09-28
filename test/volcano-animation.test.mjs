import test from 'node:test';
import assert from 'node:assert/strict';
import {volcanoAnimationState} from '../public/volcano-animation-state.js';
test('volcano motion requires fresh eligible live evidence and respects static presentation',()=>{
 const now=Date.now(),base={enabled:true,eligible:true,live:true,checkedAt:now,now};assert.equal(volcanoAnimationState(base).active,true);
 for(const change of [{enabled:false},{eligible:false},{live:false},{scientific:true},{reduced:true},{error:'offline'},{checkedAt:now-31*60000}])assert.equal(volcanoAnimationState({...base,...change}).active,false);
 assert.equal(volcanoAnimationState({...base,weekly:true,publishedAt:now-86400000}).active,true);
 for(const publishedAt of [NaN,now+1,now-10*86400000])assert.equal(volcanoAnimationState({...base,weekly:true,publishedAt}).active,false);
});
