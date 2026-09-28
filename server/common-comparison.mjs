import {distance,DAY} from './geo.mjs';
import {generate} from './engine.mjs';
import {region,inverse,project,projectSpatialETAS} from './spatial-etas.mjs';

export function spatialRank(cells,observed){
  if(!Array.isArray(cells)||!Array.isArray(observed)||cells.length!==observed.length||!cells.length||Array.from(cells).some(x=>!Number.isFinite(x)||x<0)||Array.from(observed).some(x=>!Number.isSafeInteger(x)||x<0))throw new Error('Spatial ranks require matching finite nonnegative grids and integer observations');
  const order=cells.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value),events=observed.reduce((a,b)=>a+b,0);
  let weighted=0;
  for(let start=0;start<order.length;){let end=start+1;while(end<order.length&&order[end].value===order[start].value)end++;const rank=(start+(end-start)/2)/order.length;for(let i=start;i<end;i++)weighted+=observed[order[i].index]*rank;start=end;}
  return {events,eventWeightedSpatialRank:events?weighted/events:null,interpretation:'Fraction of equal-area cells ranked below each observed event, with half credit for ties, averaged over events. Higher is better; a uniform map scores 0.5. This is spatial ordering, not probability, magnitude accuracy or count calibration.'};
}

export function commonComparison({etas,events,config,routes,boundaries=[],size=16}){
  if(!etas.fit?.version?.startsWith('rectangular-gaussian-spatial-etas-'))throw new Error('Choose a saved spatial ETAS fit');
  if(!Number.isInteger(size)||size<4||size>64)throw new Error('Choose a 4–64 cell grid side');
  const cutoff=etas.fit.options.end,end=cutoff+7*DAY,provider=etas.fit.options.provider,minMagnitude=etas.fit.options.minMagnitude,r=region(etas.fit.options);
  if(end>Date.now())throw new Error('The complete seven-day comparison window has not elapsed');
  const conditioning=events.filter(e=>e.time<=cutoff),ds=generate(conditioning,cutoff,{...config,catalogProvider:provider,windowDays:7},routes,boundaries),grid=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)grid.push(inverse((x+.5)*r.xmax/size,r.ymin+(y+.5)*(r.ymax-r.ymin)/size,r));
  const watches=ds.candidates.filter(f=>f.magnitude.max>=minMagnitude),dsCells=grid.map(p=>watches.some(f=>distance(p,f.center)<=f.radiusKm)?1:0);
  const models={DS:dsCells,ETAS:projectSpatialETAS(etas.fit,conditioning,[7],size).maps[0].cells,Uniform:Array(size*size).fill(1)},observed=Array(size*size).fill(0),outcomes=[];
  for(const e of events){
    if(e.provider!==provider||e.type!=='earthquake'||e.status==='deleted'||e.time<=cutoff||e.time>end||e.mag<minMagnitude||!Number.isFinite(e.lat)||!Number.isFinite(e.lon)||e.lat<r.south||e.lat>r.north||((e.lon-r.west+360)%360)>r.width)continue;
    const p=project(e,r),x=Math.min(size-1,Math.floor(p.x/r.xmax*size)),y=Math.min(size-1,Math.floor((p.y-r.ymin)/(r.ymax-r.ymin)*size));
    observed[y*size+x]++;outcomes.push(e);
  }
  return {version:'paired-spatial-rank-1',cutoff,end,provider,minMagnitude,grid:{size,region:r,centers:grid},models,observed,outcomes,watches,config:ds.config,engineVersion:ds.engineVersion,routeVersion:routes.version,etasId:etas.id,ranking:Object.entries(models).map(([name,cells])=>({name,...spatialRank(cells,observed)})).sort((a,b)=>(b.eventWeightedSpatialRank??-1)-(a.eventWeightedSpatialRank??-1)||a.name.localeCompare(b.name)),limitations:['Revised-catalog exploratory hindcast; current DS rules and route geometry are applied retrospectively. Model choices and region may have been selected after inspecting outcomes.','DS is the binary union of draft watch disks whose upper magnitude reaches the common catalog floor, sampled at cell centers; small disks may be missed by the grid. The metric does not evaluate each watch magnitude range or target count.','ETAS ranks integrated background and observed-parent triggering; future descendants are excluded. No outcome event changes either input map.','All models share exactly the same region, seven-day window, catalog floor, cells and outcome events. Uniform is an equal-priority reference, not a seeded random forecast.','This comparison measures spatial prioritization only. It does not establish predictive significance, calibration, independence or prospective skill. Learned and calibrated DS variants are not included in this version.']};
}
