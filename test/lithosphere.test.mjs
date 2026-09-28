import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/lithosphere.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href));
const {lithospherePositions,lithosphereSection}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('lithosphere mesh preserves original boundary depths and scales only radial depth',()=>{
 const data=new Float32Array(39);data[0]=30;data[2]=-120;for(let i=0;i<4;i++)data[3+i*9]=[17000,72000,72000,172000][i];
 for(const scale of [1,5,10,25])for(let boundary=0;boundary<4;boundary++){
  const [x,y,z]=lithospherePositions(data,boundary,scale),radius=Math.hypot(x,y,z);
  assert.ok(Math.abs(radius-Math.max(.04,1-data[3+boundary*9]*scale/6371008.8))<1e-7);
  assert.ok(Math.abs(Math.atan2(-z,x)*180/Math.PI+120)<1e-5);
 }
 assert.throws(()=>lithospherePositions(data,4));assert.throws(()=>lithospherePositions(new Float32Array(38),0));assert.throws(()=>lithospherePositions(data,0,0));
});

test('filled sections lie on the section plane and stop at corridor endpoints',async()=>{
 const {makeSection}=await import('../public/section-geometry.js');
 const frame=makeSection({lat:0,lon:0,bearing:0,lengthKm:1000,halfWidthKm:100}),top=new Float32Array([1,-.2,-.2,1,.2,-.2,1,0,.2]),bottom=top.map(v=>v*.9),faces=new Uint32Array([0,1,2]);
 const positions=lithosphereSection(top,bottom,faces,frame);assert.ok(positions.length>=18);
 for(let i=0;i<positions.length;i+=3){const [x,y,z]=positions.slice(i,i+3);assert.ok(Math.abs(z)<1e-7);assert.ok(Math.abs(Math.atan2(y,x)*6371.0088)<=500.001);assert.ok(x>=.899999&&x<=1.000001);}
 // A source edge exactly on the section plane must retain its filled band.
 const edge=new Float32Array([1,-.05,0,1,.05,0,1,0,.2]);assert.equal(lithosphereSection(edge,edge.map(v=>v*.9),faces,frame).length,18);
 assert.equal(lithosphereSection(new Float32Array([1,0,.1,1,.1,.1,1,-.1,.1]),new Float32Array([.9,0,.09,.9,.09,.09,.9,-.09,.09]),faces,frame).length,0);
});
