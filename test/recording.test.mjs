import test from 'node:test';
import assert from 'node:assert/strict';
import {containRect} from '../public/recording.js';
test('video fitting preserves the viewport aspect, centers it and rejects invalid sizes',()=>{
 for(const [sw,sh,w,h]of [[1600,900,1280,560],[390,700,720,1120],[900,1600,1280,560]]){const r=containRect(sw,sh,w,h);assert.ok(Math.abs(r.width/r.height-sw/sh)<1e-12);assert.ok(r.x>=0&&r.y>=0);assert.ok(Math.abs(2*r.x+r.width-w)<1e-9);assert.ok(Math.abs(2*r.y+r.height-h)<1e-9);}
 assert.throws(()=>containRect(0,100,1280,560));assert.throws(()=>containRect(100,100,Infinity,560));
});
