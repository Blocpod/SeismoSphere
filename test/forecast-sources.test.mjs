import test from 'node:test';import assert from 'node:assert/strict';import {forecastSources,forecastRoutes} from '../public/forecast-sources.js';
test('watch source inspection uses retained inputs only, preserves missing snapshots and escapes catalog text',()=>{
 const f={sources:['a','missing','a'],sourceEvents:[{id:'a',mag:5,depth:550,lat:-20,lon:179,time:0,observedAt:1000,place:'<script>bad</script>',url:'javascript:alert(1)'},{id:'not-a-source',mag:9,place:'must not appear'}]},before=structuredClone(f),html=forecastSources(f);
 assert.match(html,/550 km/);assert.match(html,/1970-01-01T00:00:00.000Z/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|must not appear/);assert.match(html,/individual observation values are unavailable/);assert.equal((html.match(/Retained catalog observation/g)??[]).length,1);assert.deepEqual(f,before);
 assert.match(forecastSources({sources:[]}),/No individual source/);
 assert.match(forecastSources({sources:['a'],sourceEvents:[{id:'a',url:'https://earthquake.usgs.gov/earthquakes/eventpage/example'}]}),/Current USGS record/);
});

test('route inspection preserves ordered ancestry and never upgrades missing or unsafe provenance',()=>{
 const f={routeIds:['A','B'],routeProvenance:[{id:'A',status:'illustrative',notes:'<unsafe>',sourceUrl:'javascript:bad()'},{id:'B',status:'source-traced',sourceUrl:'https://example.com/map',locator:'frame 3'}],path:[{lat:10,lon:179},{lat:12,lon:-179}]},before=structuredClone(f),html=forecastRoutes(f);
 assert.match(html,/2 routes \/ 2 vertices/);assert.match(html,/illustrative/);assert.match(html,/not independent validation/);assert.match(html,/frame 3/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/javascript:/);assert.ok(html.indexOf('179°')<html.indexOf('-179°'));assert.deepEqual(f,before);
 assert.match(forecastRoutes({routeId:'legacy'}),/provenance not retained/);assert.equal(forecastRoutes({}),'');
 assert.doesNotMatch(forecastRoutes({routeIds:['A'],routeProvenance:[{id:'A',sourceUrl:'https://user:secret@example.com/'}]}),/href=/);
});
