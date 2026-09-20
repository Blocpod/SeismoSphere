import {mkdir,readFile,writeFile,open,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='data/geology/slab2-volume',catalog='https://www.sciencebase.gov/catalog/item/5aa1b00ee4b0b1c392e86467?format=json',name='Slab2Distribute_Mar2018.tar.gz';
await mkdir(root,{recursive:true});let item;
try{item=JSON.parse(await readFile(root+'/item.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch(catalog,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Slab2 catalog HTTP '+response.status);item=await response.json();await writeFile(root+'/item.json',JSON.stringify(item));}
const source=item.files.find(f=>f.name===name);if(!source||source.size!==140213438||new URL(source.url).hostname!=='www.sciencebase.gov')throw new Error('Review changed Slab2 source metadata.');
let receipt;try{receipt=JSON.parse(await readFile(root+'/receipt.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;try{receipt=JSON.parse(await readFile('config/slab-surfaces.json','utf8')).source;}catch(error){if(error.code!=='ENOENT')throw error;}}
try{const bytes=await readFile(root+'/'+name);if(bytes.length!==source.size||!receipt||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw new Error('Retained Slab2 archive integrity mismatch.');await writeFile(root+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));process.exit(0);}catch(e){if(e.code!=='ENOENT')throw e;}
// ScienceBase ignores Range for this attachment. Retain progress on disk, but only publish a complete archive.
const response=await fetch(source.url,{signal:AbortSignal.timeout(1200000)});if(!response.ok)throw new Error('Slab2 source HTTP '+response.status);console.log('Downloading original Slab2 volume: '+source.size+' bytes.');
const file=await open(root+'/'+name+'.tmp','w'),hash=createHash('sha256');let size=0,next=5000000;
try{for await(const chunk of response.body){size+=chunk.length;if(size>source.size)throw new Error('Slab2 source exceeded declared size.');hash.update(chunk);await file.writeFile(chunk);if(size>=next){console.log(Math.round(size/1000000)+' / 140 MB');next+=5000000;}}}finally{await file.close();}
if(size!==source.size)throw new Error('Incomplete Slab2 volume.');const sha256=hash.digest('hex');if(receipt&&sha256!==receipt.sha256)throw new Error('Slab2 source differs from its retained receipt.');
await rename(root+'/'+name+'.tmp',root+'/'+name);receipt??={url:source.url,catalog,receivedAt:new Date().toISOString(),bytes:size,sha256};await writeFile(root+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
