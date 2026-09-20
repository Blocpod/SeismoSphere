import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fingerprint} from '../server/neural.mjs';
import {DAY} from '../server/geo.mjs';
test('neural sequence fingerprints exclude outcomes and geographic names',()=>{
  const s={id:'source',time:50*DAY,lat:0,lon:0,mag:5,depth:400,place:'Do not encode me'};
  const earlier={...s,id:'before',time:49*DAY,lon:5,mag:4};const future={...s,id:'after',time:51*DAY,mag:9};
  const a=fingerprint(s,[earlier]),b=fingerprint(s,[earlier,future]);assert.deepEqual(a,b);assert.equal(a.nodeCount,2);assert.ok(!a.text.includes('Do not encode me'));assert.ok(a.nodeIds.includes('before'));assert.ok(!a.nodeIds.includes('after'));
});
