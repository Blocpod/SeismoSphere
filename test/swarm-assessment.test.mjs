import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessSwarm} from '../server/swarm-assessment.mjs';
test('swarm assessment respects frozen identity, time, provider and individual magnitudes',()=>{
 const event=(id,changes={})=>({id,type:'earthquake',provider:'USGS',time:20,lat:0,lon:0,mag:4.5,...changes});
 const events=[event('small'),event('hit',{mag:5.2}),event('future',{time:101}),event('deleted',{status:'deleted'}),event('explosion',{type:'explosion'}),event('other',{provider:'EMSC'}),event('source-alias',{aliases:['source']}),event('early',{time:9})];
 const swarm={eventIds:events.map(e=>e.id),migration:{from:{lat:0,lon:0},to:{lat:0,lon:1}}};
 const watch={id:'watch',hash:'frozen',engine:'DS',asOf:10,issuedAt:11,validFrom:11,validUntil:30,sources:['source'],center:{lat:0,lon:0},radiusKm:200,magnitude:{min:5,max:6,central:5.5}};
 const network={version:'route-version',captureKm:20,routes:[{id:'r',name:'Example',points:[{lat:0,lon:0},{lat:0,lon:1}],provenance:{status:'illustrative'}}]};
 const input=JSON.stringify({watch,events,swarm,network});
 const result=assessSwarm(swarm,events,[watch,{...watch,id:'late-issue',issuedAt:101},{...watch,id:'control',engine:'Null'}],network,100);
 assert.equal(result.targets.length,1);assert.deepEqual(result.targets[0].eventIds,['small','hit']);assert.deepEqual(result.targets[0].matchingEventIds,['hit']);assert.equal(result.movement[0].direction,'forward');assert.equal(result.routeVersion,'route-version');
 const small=assessSwarm(swarm,events.filter(e=>e.id!=='hit'),[watch],network,100);assert.deepEqual(small.targets[0].matchingEventIds,[]);assert.match(small.targets[0].assessment,/does not resolve/);
 assert.equal(JSON.stringify({watch,events,swarm,network}),input);
 assert.deepEqual(assessSwarm(swarm,events,[watch],{...network,routes:[]},100).movement,[]);
});
