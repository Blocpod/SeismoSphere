import test from 'node:test';
import assert from 'node:assert/strict';
import {containRect,wrapLegend} from '../public/recording.js';
test('video fitting preserves the viewport aspect, centers it and rejects invalid sizes',()=>{
 for(const [sw,sh,w,h]of [[1600,900,1280,560],[390,700,720,1120],[900,1600,1280,560]]){const r=containRect(sw,sh,w,h);assert.ok(Math.abs(r.width/r.height-sw/sh)<1e-12);assert.ok(r.x>=0&&r.y>=0);assert.ok(Math.abs(2*r.x+r.width-w)<1e-9);assert.ok(Math.abs(2*r.y+r.height-h)<1e-9);}
 assert.throws(()=>containRect(0,100,1280,560));assert.throws(()=>containRect(100,100,Infinity,560));
});

test('portrait stress legends wrap without compressing or dropping scientific labels',()=>{
 const original=['STATIC STRESS · CURRENT − BASELINE · blue −100 / orange +100 MPa','10 km samples · receiver 359/89/180° · 25× depth · NOT A FORECAST · amber outlines: source patches · white: patch 10000'];
 for(const width of [672,1232]){const lines=wrapLegend(original,s=>s.length*9,width);assert.ok(lines.every(s=>s.length*9<=width));assert.equal(lines.join(' '),original.join(' '));}
 assert.ok(wrapLegend(original,s=>s.length*9,672).length>2);assert.throws(()=>wrapLegend(original,s=>s.length,0));
});
