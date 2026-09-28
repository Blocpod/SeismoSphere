import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {checkCoordinates} from '../server/stress-coordinates.mjs';
import {stressIntegrity} from '../server/rupture-inputs.mjs';
import {parseCoulombInput} from '../server/coulomb-input.mjs';


if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.argv[3])throw new Error('Usage: node scripts/check-stress-coordinates.mjs STRESS_EXPORT_JSON COMPANION_FSP');
  const {record,source}=JSON.parse(readFileSync(process.argv[2],'utf8')),raw=readFileSync(process.argv[3],'utf8');
  for(const [key,valid]of Object.entries(stressIntegrity(record,source)))assert.equal(valid,true,key);
  assert.deepEqual(parseCoulombInput(source.raw),source.model);
  console.log(JSON.stringify({sourceId:source.id,sourceSha256:source.receipt.sha256,referenceSha256:createHash('sha256').update(raw).digest('hex'),...checkCoordinates(source.model,raw)}));
}
