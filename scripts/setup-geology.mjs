import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='https://earthquake.usgs.gov/arcgis/rest/services/eq/slab2_depth/MapServer/0';
await mkdir('data/geology/slab2-cache',{recursive:true});await mkdir('public/assets',{recursive:true});
async function json(url){
  for(let attempt=0;attempt<3;attempt++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(d.error)throw new Error(JSON.stringify(d.error));return d;}
    catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,(attempt+1)*1000));}
  }
}
const index=await json(root+'/query?'+new URLSearchParams({where:'1=1',returnIdsOnly:'true',f:'json'}));
if(!Array.isArray(index.objectIds)||!index.objectIds.length)throw new Error('Slab contour index is empty');
const queue=[...index.objectIds],features=[];let completed=0;
await Promise.all(Array.from({length:4},async()=>{
  while(queue.length){
    const id=queue.shift(),file=`data/geology/slab2-cache/${id}.json`;let feature;
    try{feature=JSON.parse(await readFile(file,'utf8'));}catch{
      const d=await json(root+'/query?'+new URLSearchParams({objectIds:String(id),outFields:'depth,region,OBJECTID',outSR:'4326',f:'geojson'}));
      if(d.features?.length!==1||d.features[0].properties.OBJECTID!==id||d.exceededTransferLimit)throw new Error(`Incomplete contour ${id}`);
      feature=d.features[0];await writeFile(file,JSON.stringify(feature));
    }
    if(!Number.isFinite(feature.properties.depth)||!['LineString','MultiLineString'].includes(feature.geometry?.type))throw new Error(`Invalid contour ${id}`);
    features.push(feature);completed++;if(completed%100===0)console.log(`Slab2 ${completed}/${index.objectIds.length}`);
  }
}));
features.sort((a,b)=>a.properties.OBJECTID-b.properties.OBJECTID);
const provenance={source:root,retrievedAt:new Date().toISOString(),name:'USGS Slab2 depth contours',citation:'Hayes et al. (2018), Slab2, a comprehensive subduction zone geometry model',doi:'https://doi.org/10.1126/science.aat4723',policy:'Published depth contours, not direct measurements. Source vertices retained. No inferred slab thickness or interpolation between contours.'};
const collection={type:'FeatureCollection',provenance,features};
const content=JSON.stringify(collection),sha256=createHash('sha256').update(content).digest('hex');
await writeFile('public/assets/slab2-depth.json',content);
await writeFile('data/geology/slab2-manifest.json',JSON.stringify({...provenance,sha256,featureCount:features.length,regions:[...new Set(features.map(f=>f.properties.region))].sort(),bytes:Buffer.byteLength(content)},null,2));
console.log(JSON.stringify({saved:'public/assets/slab2-depth.json',sha256,contours:features.length,bytes:Buffer.byteLength(content)}));
