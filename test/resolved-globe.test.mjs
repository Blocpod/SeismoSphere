import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/globe.js',import.meta.url),'utf8');
const method=source.slice(source.indexOf('  showResolvedForecast('),source.indexOf('  captureFigure('));
const render=new Function('position','return ({'+method+'}).showResolvedForecast')((event,radius)=>({toArray:()=>[event.lat,event.lon,radius]}));
test('resolved globe uses frozen geometry and retained event revisions without altering records',()=>{
 for(const [status,color] of [['HIT',0x72ddd0],['MISS',0xff8f9a],['PARTIAL HIT',0xffb85f],['AMBIGUOUS',0xb6c4d0]]){
  const event={id:'retained',lat:1,lon:2,mag:5,depth:12},f={id:'f',center:{lat:0,lon:0},radiusKm:400,path:[{lat:0,lon:0},{lat:1,lon:1}]},review={id:'r',createdAt:200,observationCutoff:190,result:{status,...(status==='MISS'?{}:{event})}},before=structuredClone({f,review}),rings=[],points=[];
  const group={children:[],userData:{},add(...objects){this.children.push(...objects);}},earth={mobile:true,baseDistance:3,selectionGroup:group,setXray(value){assert.equal(value,false);},clear(g){g.children=[];g.userData={};},ring(...args){rings.push(args);return {};},drawForecastPath(g,path){assert.equal(path,f.path);},eventPoints(events){points.push(...events);return {};},focus(center,distance){assert.equal(center,f.center);assert.equal(distance,3);},syncPresentation(){}};
  render.call(earth,f,review);
  assert.equal(rings[0][1],400);assert.equal(rings[0][2],color);assert.equal(group.userData.reviewEvent.reviewId,'r');assert.equal(group.userData.reviewEvent.status,status);
  assert.deepEqual(points,status==='MISS'?[]:[event]);assert.deepEqual({f,review},before);
 }
});
