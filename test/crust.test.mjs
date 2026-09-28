import test from 'node:test';
import assert from 'node:assert/strict';
import {crustCell,crustColumn,crustProfilePoints} from '../server/crust.mjs';
import {sectionCoordinates} from '../public/section-geometry.js';
test('crust profile follows the section across the dateline with bounded sampling',()=>{
 const {frame,points}=crustProfilePoints({lat:0,lon:179,bearing:90,lengthKm:1000,halfWidthKm:50});assert.equal(points.length,21);assert.ok(points.some(p=>p.lon<0));
 for(const point of points){const projected=sectionCoordinates(point,frame);assert.ok(Math.abs(projected.alongKm-point.alongKm)<1e-8);assert.ok(Math.abs(projected.crossKm)<1e-8);}
 assert.equal(points[0].alongKm,-500);assert.equal(points.at(-1).alongKm,500);assert.throws(()=>crustProfilePoints({...frame,lengthKm:20000}));
});
test('crust cells cover poles and dateline using source row order',()=>{
 assert.deepEqual(crustCell(90,-180),{row:0,column:0,index:0,lat:89.5,lon:-179.5});assert.equal(crustCell(-90,180).index,179*360);
 assert.deepEqual(crustCell(5.5,150.5),{row:84,column:330,index:30570,lat:5.5,lon:150.5});assert.equal(crustCell(0,0).index,90*360+180);
 assert.deepEqual(crustCell(5,180),crustCell(5,-180));for(const point of [[NaN,0],[0,Infinity],[91,0],[0,-181]])assert.throws(()=>crustCell(...point));
});
test('crust columns preserve above-sea-level boundaries, absent layers and open mantle',()=>{
 const values={bnds:[2,2,2,1,0,-2,-10,-20,-35],vp:Array(9).fill(6),vs:Array(9).fill(3),rho:Array(9).fill(2.7)},copy=structuredClone(values),layers=crustColumn(Array.from({length:9},(_,i)=>String(i)),values);
 assert.equal(layers[0].topDepthKm,-2);assert.equal(layers[0].present,false);assert.equal(layers[2].thicknessKm,1);assert.equal(layers[7].bottomDepthKm,35);assert.equal(layers[8].bottomDepthKm,null);assert.equal(layers[8].thicknessKm,null);assert.deepEqual(values,copy);
 assert.throws(()=>crustColumn([], {...values,bnds:[...values.bnds.slice(0,8),0]}));
});
