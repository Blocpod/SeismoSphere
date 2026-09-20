import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeVolcanoes} from '../public/volcano-data.js';
import {retrieveSource} from '../server/instruments.mjs';
const config=JSON.parse(await readFile(new URL('../config/volcano-source.json',import.meta.url),'utf8')),sha=v=>createHash('sha256').update(v).digest('hex');
await mkdir('data/geology/volcano-cache',{recursive:true});await mkdir('public/assets',{recursive:true});let source;
try{const previous=JSON.parse(await readFile('data/geology/volcano-manifest.json','utf8')),raw=await readFile('data/geology/volcano-cache/'+previous.receipt.sha256+'.json','utf8');if(sha(raw)===previous.receipt.sha256&&previous.normalizedSha256===config.normalizedSha256&&Number.isFinite(previous.receipt.fetchedAt))source={raw,receipt:previous.receipt};}catch{}
if(!source)source=await retrieveSource(config.source,'Smithsonian GVP');
const volcanoes=normalizeVolcanoes(JSON.parse(source.raw));if(volcanoes.length!==config.count||sha(JSON.stringify(volcanoes))!==config.normalizedSha256)throw new Error('GVP content differs from the reviewed source pin. Review the new version before replacing the retained dataset.');
const provenance={...config,receipt:source.receipt,retrievedAt:new Date(source.receipt.fetchedAt).toISOString(),changes:'Sorted by stable Volcano_Number; service-generated feature IDs excluded from normalized records; original attributes retained. Full raw response preserved separately.',policy:'Static Holocene geological reference, not current eruption status, a hazard classification, a causal earthquake association or a forecast factor. Latest recorded eruption years belong to this database version, not a historical replay state.'},data={schema:'seismosphere.volcanoes.v1',provenance,volcanoes},text=JSON.stringify(data),manifest={...provenance,bytes:Buffer.byteLength(text),sha256:sha(text)};
await writeFile('data/geology/volcano-cache/'+source.receipt.sha256+'.json',source.raw);
for(const [file,body]of [['public/assets/gvp-volcanoes.json',text],['public/assets/gvp-volcanoes-source.json',source.raw],['data/geology/volcano-manifest.json',JSON.stringify(manifest,null,2)]]){await writeFile(file+'.tmp',body);await rename(file+'.tmp',file);}
console.log(JSON.stringify(manifest));
