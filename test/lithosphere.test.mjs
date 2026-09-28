import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/lithosphere.js',import.meta.url),'utf8').replace("'three'",JSON.stringify(new URL('../public/vendor/three.module.js',import.meta.url).href));
const {lithospherePositions}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('lithosphere mesh preserves original boundary depths and scales only radial depth',()=>{
 const data=new Float32Array(39);data[0]=30;data[2]=-120;for(let i=0;i<4;i++)data[3+i*9]=[17000,72000,72000,172000][i];
 for(const scale of [1,5,10,25])for(let boundary=0;boundary<4;boundary++){
  const [x,y,z]=lithospherePositions(data,boundary,scale),radius=Math.hypot(x,y,z);
  assert.ok(Math.abs(radius-Math.max(.04,1-data[3+boundary*9]*scale/6371008.8))<1e-7);
  assert.ok(Math.abs(Math.atan2(-z,x)*180/Math.PI+120)<1e-5);
 }
 assert.throws(()=>lithospherePositions(data,4));assert.throws(()=>lithospherePositions(new Float32Array(38),0));assert.throws(()=>lithospherePositions(data,0,0));
});
