import test from 'node:test';import assert from 'node:assert/strict';import {depthRuler} from '../public/depth-ruler.js';
test('event depth ruler uses an unexaggerated kilometer axis and includes outlying depths',()=>{
 const deep=depthRuler(550);assert.match(deep,/cy="130"/);assert.match(deep,/550.0 km catalog depth/);assert.match(deep,/700 km/);assert.match(deep,/independent of globe depth exaggeration/);
 assert.match(depthRuler(0),/cy="20"/);assert.match(depthRuler(800),/cy="160"/);assert.match(depthRuler(-20),/-100 km/);assert.doesNotMatch(depthRuler(-20),/NaN/);
 assert.equal(depthRuler(NaN),'');assert.equal(depthRuler(Infinity),'');
});
