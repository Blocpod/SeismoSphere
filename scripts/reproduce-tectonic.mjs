import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {boundaryExposure,fitTectonic,tectonicComparison,TECTONIC_VERSION} from '../server/tectonic-baseline.mjs';
import {hash} from '../server/store.mjs';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/reproduce-tectonic.mjs comparison.json [parent-learned-export.json]');
const bundle=JSON.parse(readFileSync(file,'utf8')),r=bundle.report;
assert.equal(r.version,TECTONIC_VERSION,'Restore the matching implementation version');assert.equal(hash(bundle.input),bundle.id);assert.equal(hash(r),bundle.reportSha256);assert.equal(hash(bundle.boundaries),bundle.input.boundariesSha256);assert.equal(hash(bundle.implementation),bundle.input.implementationSha256);
const exposure=boundaryExposure(bundle.boundaries),fit=fitTectonic(r.training.counts,r.fit.trainWeeks,exposure);assert.deepEqual(exposure,r.exposure);assert.deepEqual(fit,r.fit);
const factorial=[0];let ll=0,mae=0,events=0;
for(const w of bundle.testWindows)for(let i=0;i<72;i++){const y=w.observed[i],mu=fit.cells[i];while(factorial.length<=y)factorial.push(factorial.at(-1)+Math.log(factorial.length));ll+=y*Math.log(mu)-mu-factorial[y];mae+=Math.abs(y-mu);events+=y;}
assert.ok(Math.abs(ll-r.test.logLikelihood)<1e-7);assert.ok(Math.abs(mae/(72*bundle.testWindows.length)-r.test.meanAbsoluteError)<1e-10);assert.equal(events,r.test.events);
if(process.argv[3]){const parent=JSON.parse(readFileSync(process.argv[3],'utf8')),{id,...snapshot}=parent.snapshot;assert.equal(id,bundle.input.inputSnapshotId);assert.equal(hash(snapshot),id);assert.equal(parent.report.id,r.parentRunId);assert.deepEqual(tectonicComparison(parent.report,snapshot.events,bundle.boundaries),r);}
console.log('PASS: geometry exposure, training fit and test scores reproduce.'+(process.argv[3]?' Original training snapshot also verified.':' Training counts are conditional on the supplied export; add the parent export to verify raw training events.'));
