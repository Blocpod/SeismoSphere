import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const revision='56816508ad92fd6846dad1163b1c8c01376a2cd1',expected='603513086b4693de6008e3444959995c34683b30dac291856340522a76d8505e';
const base=`https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/${revision}`;
await mkdir('data/geology/faults-cache',{recursive:true});await mkdir('public/assets',{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');let source;
try{source=await readFile('data/geology/faults-cache/source.geojson');}catch{}
if(!source||sha(source)!==expected){const response=await fetch(base+'/geojson/gem_active_faults.geojson',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Fault source HTTP ${response.status}`);source=Buffer.from(await response.arrayBuffer());}
if(sha(source)!==expected)throw new Error('Fault source checksum mismatch; refusing to change the pinned dataset.');
const data=JSON.parse(source);let segments=0;
let retrievedAt=new Date().toISOString();
try{const previous=JSON.parse(await readFile('data/geology/faults-manifest.json','utf8'));if(previous.revision===revision&&previous.sourceSha256===expected&&Number.isFinite(Date.parse(previous.retrievedAt)))retrievedAt=previous.retrievedAt;}catch{}
if(data.type!=='FeatureCollection'||!data.features?.length)throw new Error('Invalid fault collection');
for(const [index,feature] of data.features.entries()){
  if(!['LineString','MultiLineString'].includes(feature.geometry?.type))throw new Error(`Invalid fault geometry ${index}`);
  for(const line of feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates){
    if(line.length<2)throw new Error(`Empty fault trace ${index}`);segments+=line.length-1;
    for(const c of line)if(!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90)throw new Error(`Invalid fault coordinate ${index}`);
  }
}
const license=await fetch(base+'/LICENSE.txt',{signal:AbortSignal.timeout(30000)});if(!license.ok)throw new Error('Fault dataset license unavailable');
const provenance={name:'GEM Global Active Faults Database',revision,source:base+'/geojson/gem_active_faults.geojson',sourceSha256:expected,revisionDate:'2021-06-24',retrievedAt,citation:'Styron, R. and Pagani, M. (2020), The GEM Global Active Faults Database, Earthquake Spectra 36(1_suppl), 160–180',doi:'https://doi.org/10.1177/8755293020944182',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',changes:'Original feature order, vertices and attributes retained; collection-level provenance added. Feature indexes distinguish duplicate or absent source catalog IDs.',policy:'Static mapped surface traces, with uneven regional completeness and accuracy. Not a live rupture map or causal earthquake-fault association; not used as historical forecast input.'};
const content=JSON.stringify({...data,provenance}),manifest={...provenance,featureCount:data.features.length,segments,bytes:Buffer.byteLength(content),sha256:sha(content)};
await writeFile('data/geology/faults-cache/source.geojson',source);
await writeFile('public/assets/gem-faults.json',content);await writeFile('public/assets/LICENSE-gem-faults.txt',await license.text());
await writeFile('data/geology/faults-manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
