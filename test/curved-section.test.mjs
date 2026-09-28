import test from 'node:test';import assert from 'node:assert/strict';
import {curvedSection,curvedCoordinates,curvedTrack} from '../public/curved-section.js';
import {SECTION_EARTH_KM as R} from '../public/section-geometry.js';
test('curved profiles preserve path distance, choose nearest bounded arc once and cross dateline',()=>{
 const p=curvedSection([{lat:0,lon:170},{lat:0,lon:-170},{lat:20,lon:-170}],100);
 const corner=curvedCoordinates({lat:0,lon:-170},p);assert.ok(corner.inside);assert.equal(corner.segmentIndex,0);assert.ok(Math.abs(corner.alongKm)<1e-6);
 const along=curvedCoordinates({lat:10,lon:-170},p);assert.equal(along.segmentIndex,1);assert.ok(Math.abs(along.alongKm-10*Math.PI/180*R)<1e-6);
 assert.ok(curvedCoordinates({lat:0,lon:179},p).inside);assert.equal(curvedCoordinates({lat:0,lon:168},p).inside,false);
 assert.ok(curvedCoordinates({lat:0,lon:169.5},p).inside);assert.equal(curvedCoordinates({lat:3,lon:170},p).inside,false);
 const track=curvedTrack(p,100);assert.ok(track.every(v=>Math.abs(Math.hypot(...v)-(1-100/R))<1e-12));
 const reversed=curvedSection([...p.waypoints].reverse(),100);assert.ok(Math.abs(curvedCoordinates({lat:10,lon:-170},reversed).alongKm+along.alongKm)<1e-6);
 assert.throws(()=>curvedSection([{lat:0,lon:0}]),/2–32/);assert.throws(()=>curvedSection([{lat:0,lon:0},{lat:0,lon:0}]),/coincident/);
});

test('curved figure evidence identifies projected observations without claiming a planar cutaway',async()=>{
 const {sceneEvidence}=await import('../public/figure.js');const frame=curvedSection([{lat:0,lon:170},{lat:0,lon:-170}],100),events=[{id:'test',lat:0,lon:179,depth:300,mag:5,...curvedCoordinates({lat:0,lon:179},frame)}];
 const section={schema:'seismosphere.curved-section.v1',frame,events};
 const earth={events:[],asOf:1000,xray:true,depthScale:1,geology:{section:false,evidence:()=>section},plates:{visible:true},pathGroup:{visible:false},field:{visible:false},forecastGroup:{visible:false},presentationEvidence:()=>({style:'scientific'})};
 const out=sceneEvidence(earth,{analysis:{asOf:1000},asOf:1000,status:{config:{catalogProvider:'USGS'}}},'Curved',{camera:{}});
 assert.equal(out.layers.section,false);assert.equal(out.layers.curvedSection,true);assert.equal(out.render.actualPointEvents.length,1);assert.equal(out.geologicalSection.events[0].depth,300);
 events[0].depth=999;assert.equal(out.geologicalSection.events[0].depth,300);
});

test('curved sonification uses only projected profile observations',async()=>{
 const {plottedAudioEvents}=await import('../public/sonification.js');const event={id:'inside',depth:600};const earth={geology:{curvedPath:{},evidence:()=>({events:[event]})},eventGroup:{children:[{visible:true,userData:{events:[{id:'outside'}]}}]}};
 assert.deepEqual(plottedAudioEvents(earth),[event]);earth.geology.curvedPath=null;assert.equal(plottedAudioEvents(earth)[0].id,'outside');
});
