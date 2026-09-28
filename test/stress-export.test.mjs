import test from 'node:test';
import assert from 'node:assert/strict';
import {stressGeoJSON,ruptureOBJ} from '../public/stress-export.js';
import {destination} from '../server/geo.mjs';
test('geographic samples preserve depth, masks, differences and source linkage',()=>{
 const source={id:'s',receipt:{sha256:'hash'},model:{origin:{lat:30,lon:179.99}}},projection={id:'p',sourceId:'s',sourceHash:'hash',validation:{supported:true,earthRadiusKm:6371.0088}};
 const points=[[-20,20],[20,20],[-20,-20],[20,-20]].map(([xKm,yKm])=>({xKm,yKm,depthKm:10})),values=points.map((p,i)=>i?{coulombPa:2e6,shearPa:3e6,unclampingPa:-1e6}:null),record={id:'r',sourceId:'s',options:{friction:.4},report:{points,values}},before=structuredClone(record);
 const result=stressGeoJSON(source,record,projection);
 assert.equal(result.features.length,4);assert.equal(result.features[0].properties.coulombPa,null);assert.equal(result.features[0].properties.masked,true);
 result.features.forEach((f,i)=>{const p=points[i],expected=destination(source.model.origin,Math.atan2(p.xKm,p.yKm)*180/Math.PI,Math.hypot(p.xKm,p.yKm));assert.equal(f.geometry.coordinates.length,2);assert.ok(Math.abs(f.geometry.coordinates[0]-expected.lon)<1e-9);assert.ok(Math.abs(f.geometry.coordinates[1]-expected.lat)<1e-9);assert.equal(f.properties.depthKm,10);});
 assert.equal(result.features[1].properties.coulombPa,2e6);assert.deepEqual(record,before);
 const baseline=structuredClone(record);baseline.id='b';baseline.report.values[1].coulombPa=1e6;
 assert.equal(stressGeoJSON(source,record,projection,baseline).features[1].properties.coulombPa,1e6);
 assert.throws(()=>stressGeoJSON(source,record,{...projection,sourceHash:'wrong'}));
 assert.throws(()=>stressGeoJSON(source,record,{...projection,validation:{supported:false}}));
});

test('editable rupture mesh retains independent patches, true depth and source parameters',()=>{
 const patch={number:1,label:'FFM0',xStartKm:0,yStartKm:0,xEndKm:0,yEndKm:12,topKm:2,bottomKm:5,dipDeg:45,slipM:.5,rakeDeg:90};
 const source={id:'source',receipt:{sha256:'hash'},model:{origin:{lat:-31,lon:-71},patches:[patch,{...patch,label:'FFM1',xStartKm:10,xEndKm:10}]}},before=structuredClone(source),obj=ruptureOBJ(source),lines=obj.trim().split('\n');
 const vertices=lines.filter(l=>l.startsWith('v ')).map(l=>l.split(' ').slice(1).map(Number)),faces=lines.filter(l=>l.startsWith('f ')).map(l=>l.split(' ').slice(1).map(Number));
 assert.equal(vertices.length,8);assert.deepEqual(faces,[[1,2,3],[1,3,4],[5,6,7],[5,7,8]]);
 assert.deepEqual(vertices[0],[0,0,-2]);assert.deepEqual(vertices[1],[0,12,-2]);
 assert.ok(Math.abs(vertices[2][0]-3)<1e-12);assert.equal(vertices[2][2],-5);
 assert.deepEqual(lines.filter(l=>l.startsWith('# parameters ')).map(l=>JSON.parse(l.slice(13))),source.model.patches);
 assert.equal(lines.filter(l=>l.startsWith('o patch_')).length,2);assert.deepEqual(source,before);
 assert.throws(()=>ruptureOBJ({...source,model:{...source.model,patches:[{...patch,dipDeg:0}]}}));
 assert.throws(()=>ruptureOBJ({...source,receipt:null}));
});
