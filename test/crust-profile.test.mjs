import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as THREE from '../public/vendor/three.module.js';import {makeSection} from '../public/section-geometry.js';
const source=readFileSync(new URL('../public/crust-profile.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href)).replace("'./section-geometry.js'",JSON.stringify(new URL('../public/section-geometry.js',import.meta.url).href));
const {showCrustProfile}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('crust overlay preserves layer radii and drops late section responses',async t=>{
 const frame=makeSection({lat:0,lon:179,bearing:90,lengthKm:100,halfWidthKm:10}),data={samples:[-50,50].map(alongKm=>({alongKm,layers:Array.from({length:8},(_,i)=>({present:i===0,topDepthKm:-2,bottomDepthKm:10}))}))};let finish;
 t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>data})));
 const geology={section:true,frame,cap:new THREE.Group(),earth:{clear(group){for(const child of [...group.children]){child.geometry.dispose();child.material.dispose();group.remove(child);}}},updateCaption(){}};
 const pending=showCrustProfile(geology);finish();assert.equal(await pending,true);const vertices=geology.crustGroup.children[0].geometry.attributes.position;
 assert.equal(vertices.count,12);for(let i=0;i<vertices.count;i++){const radius=new THREE.Vector3().fromBufferAttribute(vertices,i).length();assert.ok(Math.min(Math.abs(radius-(1+2/6371.0088)),Math.abs(radius-(1-10/6371.0088)))<1e-7);}
 const original=geology.crustGroup,late=showCrustProfile(geology);geology.frame={...frame};finish();assert.equal(await late,false);assert.equal(geology.crustGroup,original);
});
