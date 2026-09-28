import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BOUNDARY_SOURCE,boundaryIndex} from '../server/boundary-context.mjs';
const r=await fetch(BOUNDARY_SOURCE.source,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`PB2002 source: HTTP ${r.status}`);
const bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==BOUNDARY_SOURCE.sha256)throw new Error('PB2002 source checksum mismatch');
const steps=boundaryIndex(JSON.parse(bytes).features);if(steps.length!==5824)throw new Error('Incomplete PB2002 steps');
await mkdir('public/assets',{recursive:true});await writeFile('public/assets/plate-steps.json',bytes);console.log(`Saved ${steps.length} classified PB2002 steps; ${BOUNDARY_SOURCE.license}`);
