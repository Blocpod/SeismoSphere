import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurationAnalogues} from '../server/configuration-analogues.mjs';
import {DAY} from '../server/geo.mjs';

test('Mode D selects relative geometry before outcomes, with source-age-aligned complete windows',()=>{
  const event=(id,day,lon,mag=5,depth=350)=>({id,time:day*DAY,lat:0,lon,mag,depth,type:'earthquake',provider:'USGS'});
  const source=event('query',398,0);
  const peers=[event('q1',399,10,4.8,200),event('q2',400,-10,4.6,100)];
  const sequence=(prefix,day,lon,bent=false)=>[event(prefix,day,lon),event(prefix+'1',day+1,lon+10,4.8,200),event(prefix+'2',day+2,lon+(bent?10.1:-10),4.6,100)];
  const history=[...sequence('match',40,160),...sequence('decoy',80,-100,true),...sequence('empty',120,60),...sequence('incomplete',395,100)];
  const outcomes=[event('outcome',43,160,6.7,10),event('decoy-outcome',83,-100,9,10),event('too-late',53,160,9,10)];
  const result=configurationAnalogues(source,[source,...peers,...history,...outcomes],400*DAY);
  assert.deepEqual(result.matches.map(m=>m.source.id).sort(),['empty','match']);
  const match=result.matches.find(m=>m.source.id==='match');
  assert.equal(match.configuration.cutoff,42*DAY);
  assert.deepEqual(match.outcomes,[{id:'outcome',time:43*DAY,mag:6.7}]);
  assert.equal(result.matches.find(m=>m.source.id==='empty').largest,null);
  assert.ok(match.difference<1e-12);
  const changed=configurationAnalogues(source,[source,...peers,...history,...outcomes.map(e=>({...e,mag:8})),event('future',401,0,9)],400*DAY);
  assert.deepEqual(changed.matches.map(m=>[m.source.id,m.difference]),result.matches.map(m=>[m.source.id,m.difference]));
  const excluded=[{...event('deleted',399,1),status:'deleted'},{...event('other-provider',399,1),provider:'EMSC'},{...event('explosion',399,1),type:'explosion'}];
  assert.deepEqual(configurationAnalogues(source,[source,...peers,...history,...outcomes,...excluded],400*DAY),result);
  assert.equal(configurationAnalogues(source,[source,event('isolated-old',40,20)],400*DAY).matches.length,0);
});
