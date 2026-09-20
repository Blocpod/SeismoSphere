import {mkdir,writeFile} from 'node:fs/promises';
const files=[
 ['public/vendor/three.module.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'],
 ['public/vendor/three.core.js','https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js'],
 ['public/vendor/OrbitControls.js','https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js'],
 ['public/vendor/LICENSE-three.txt','https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE'],
 ['public/assets/earth.jpg','https://threejs.org/examples/textures/planets/earth_day_4096.jpg'],
 ['public/assets/earth-8k.jpg','https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg'],
 ['public/assets/earth-night.jpg','https://threejs.org/examples/textures/planets/earth_night_4096.jpg'],
 ['public/assets/earth-clouds.jpg','https://threejs.org/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg'],
 ['public/assets/earth-normal.jpg','https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'],
 ['public/assets/earth-specular.jpg','https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'],
 ['public/assets/plates.json','https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json']
];
for(const [file,url] of files){await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`${file}: HTTP ${r.status}`);await writeFile(file,Buffer.from(await r.arrayBuffer()));console.log(`Saved ${file}`);}
await import('./setup-geology.mjs');
await import('./setup-relief.mjs');
await import('./setup-faults.mjs');
await import('./setup-volcanoes.mjs');
for(const [file,url] of [['public/vendor/qrcode.mjs','https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'],['public/vendor/LICENSE-qrcode.txt','https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/LICENSE']]){const r=await fetch(url);if(!r.ok)throw new Error(`QR dependency: HTTP ${r.status}`);const value=await r.text();await writeFile(file,value+(file.endsWith('.mjs')?'\nexport default qrcode;\n':''));}
