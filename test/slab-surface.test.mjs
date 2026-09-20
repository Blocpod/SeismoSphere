import test from 'node:test';
import assert from 'node:assert/strict';
import {slabPosition,slabTriangles} from '../public/slab-surface-geometry.js';
import {chat} from '../server/ai.mjs';
test('slab mesh retains depth and dateline coordinates without bridging masked source cells',()=>{
 const values=new Float32Array(25).fill(300),copy=values.slice();assert.equal(slabTriangles(5,5,values,2).length,24);values[1]=NaN;assert.equal(slabTriangles(5,5,values,2).length,18);values[12]=NaN;assert.equal(slabTriangles(5,5,values,4).length,0);assert.deepEqual(copy,new Float32Array(25).fill(300));
 const a=slabPosition(181,-22,600),b=slabPosition(-179,-22,600);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-14);assert.ok(Math.abs(Math.hypot(...a)-(1-600/6371.0088))<1e-14);assert.ok(Math.abs(Math.hypot(...slabPosition(181,-22,600,5))-(1-3000/6371.0088))<1e-14);assert.throws(()=>slabPosition(0,91,300));assert.throws(()=>slabTriangles(2,2,new Float32Array(3)));
 assert.ok(Math.hypot(...slabPosition(-67.24,17.38,-.087225385))>1);
});
test('slab AI withholds an explanation that reverses the supplied depth direction',async t=>{
 const depthText='below the reference radius';let answer=depthText.replace('below','above');
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({message:{content:JSON.stringify({answer,actions:[]})}})}));
 const context={slabEvidence:{depthText}};
 await assert.rejects(chat('Explain this node',context,{aiProvider:'ollama',localModel:'test'}),/withheld/);
 answer=depthText;assert.equal((await chat('Explain this node',context,{aiProvider:'ollama',localModel:'test'})).answer,depthText);
});
