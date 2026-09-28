import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../server/store.mjs';
import {tectonicCell} from '../server/tectonic-baseline.mjs';
import {scoreCounts} from '../server/count-forecasts.mjs';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/reproduce-count-forecast.mjs exported-record.json');
const {id,assessment,...f}=JSON.parse(readFileSync(file,'utf8'));
assert.equal(hash(f),id);assert.equal(hash(f.inputSnapshot),f.inputSnapshotId);
if(f.version==='prospective-count-2')assert.equal(hash(f.scoringSource),f.scoringHash);
if(assessment){const {id:assessmentId,...a}=assessment;assert.equal(hash(a),assessmentId);assert.equal(a.forecastId,id);
 if(a.status==='SCORED'){
  assert.equal(hash(a.snapshot),a.snapshotId);const observed=Array(72).fill(0);
  for(const e of a.snapshot.events){assert.ok(e.type==='earthquake'&&e.mag>=5&&e.time>f.validFrom&&e.time<=f.validUntil);observed[tectonicCell(e.lat,e.lon)]++;}
  assert.deepEqual(observed,a.observed);assert.deepEqual(scoreCounts(f.models,observed),a.scores);
 }
}
console.log('PASS: frozen forecast and input hashes'+(assessment?.status==='SCORED'?', outcome counts and six model scores reproduce.':'; no scored assessment is present.'));
