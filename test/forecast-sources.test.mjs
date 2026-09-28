import test from 'node:test';import assert from 'node:assert/strict';import {forecastSources} from '../public/forecast-sources.js';
test('watch source inspection uses retained inputs only, preserves missing snapshots and escapes catalog text',()=>{
 const f={sources:['a','missing','a'],sourceEvents:[{id:'a',mag:5,depth:550,lat:-20,lon:179,time:0,observedAt:1000,place:'<script>bad</script>',url:'javascript:alert(1)'},{id:'not-a-source',mag:9,place:'must not appear'}]},before=structuredClone(f),html=forecastSources(f);
 assert.match(html,/550 km/);assert.match(html,/1970-01-01T00:00:00.000Z/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|must not appear/);assert.match(html,/individual observation values are unavailable/);assert.equal((html.match(/Retained catalog observation/g)??[]).length,1);assert.deepEqual(f,before);
 assert.match(forecastSources({sources:[]}),/No individual source/);
 assert.match(forecastSources({sources:['a'],sourceEvents:[{id:'a',url:'https://earthquake.usgs.gov/earthquakes/eventpage/example'}]}),/Current USGS record/);
});
