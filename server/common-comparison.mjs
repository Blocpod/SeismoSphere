import {distance,DAY,seeded} from './geo.mjs';
import {generate} from './engine.mjs';
import {tectonicCell} from './tectonic-baseline.mjs';
import {region,inverse,project,projectSpatialETAS} from './spatial-etas.mjs';

export function spatialRank(cells,observed){
  if(!Array.isArray(cells)||!Array.isArray(observed)||cells.length!==observed.length||!cells.length||Array.from(cells).some(x=>!Number.isFinite(x)||x<0)||Array.from(observed).some(x=>!Number.isSafeInteger(x)||x<0))throw new Error('Spatial ranks require matching finite nonnegative grids and integer observations');
  const order=cells.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value),events=observed.reduce((a,b)=>a+b,0);
  let weighted=0;
  for(let start=0;start<order.length;){let end=start+1;while(end<order.length&&order[end].value===order[start].value)end++;const rank=(start+(end-start)/2)/order.length;for(let i=start;i<end;i++)weighted+=observed[order[i].index]*rank;start=end;}
  return {events,eventWeightedSpatialRank:events?weighted/events:null,interpretation:'Fraction of equal-area cells ranked below each observed event, with half credit for ties, averaged over events. Higher is better; a uniform map scores 0.5. This is spatial ordering, not probability, magnitude accuracy or count calibration.'};
}

export function addComparisonModels(report,{learned=null,tectonic=null,calibrated=null}={}){
  const models={...report.models},evidence={};
  if(learned){
    const {projection:p,report:r}=learned;
    if(report.provider!=='USGS'||report.minMagnitude!==5||r.options.minMagnitude!==5||r.options.validationEnd>report.cutoff||p.cutoff!==report.cutoff||p.days!==7||r.grid.rows!==6||r.grid.columns!==12)throw new Error('Learned comparison requires USGS M5, the same seven-day cutoff, and a checkpoint selected before it');
    const components={Graph:p.componentCells?.graph,Ensemble:p.cells,Tectonic:tectonic?.report?.fit?.cells};
    if(!tectonic||tectonic.report.training.end>report.cutoff||tectonic.report.parentRunId!==r.id)throw new Error('Tectonic comparison must share the learned parent and precede the cutoff');
    for(const [name,cells]of Object.entries(components)){
      if(!Array.isArray(cells)||cells.length!==72||Array.from(cells).some(v=>!Number.isFinite(v)||v<=0))throw new Error('Learned models require 72 positive finite cell expectations');
      models[name]=report.grid.centers.map(p=>cells[tectonicCell(p.lat,p.lon)]);
    }
    evidence.learned=learned;evidence.tectonic=tectonic;
  }
  if(calibrated){
    if(calibrated.calibration.intervals.trainEnd>report.cutoff||calibrated.analysis.asOf!==report.cutoff||calibrated.analysis.config.windowDays!==7||calibrated.analysis.config.catalogProvider!==report.provider)throw new Error('Calibrated DS must use a selection interval before the shared cutoff and the same catalog/window');
    const watches=calibrated.analysis.candidates.filter(f=>f.magnitude.max>=report.minMagnitude);
    models['DS-AI']=report.grid.centers.map(p=>watches.some(f=>distance(p,f.center)<=f.radiusKm)?1:0);
    evidence.calibrated=calibrated;
  }
  return {...report,version:'paired-spatial-rank-2',models,modelEvidence:evidence,ranking:Object.entries(models).map(([name,cells])=>({name,...spatialRank(cells,report.observed)})).sort((a,b)=>(b.eventWeightedSpatialRank??-1)-(a.eventWeightedSpatialRank??-1)||a.name.localeCompare(b.name)),limitations:[...report.limitations.filter(s=>!s.includes('not included in this version.')),'This comparison measures spatial prioritization, not predictive significance, calibration or prospective skill.',...(learned?['Graph, ensemble and tectonic models retain their coarse 72-cell resolution. Each comparison-cell center inherits its parent cell value; no fine-scale structure is inferred. A region lying within one parent cell produces a tied spatial score. Counts are used only for ordering, not interpreted as regional expected counts.']:[]),...(calibrated?['DS-AI uses the selected depth-threshold variant and the same binary watch-support adapter as DS; calibrated refers to parameter selection, not a calibrated earthquake probability.']:[])]};
}

export function commonComparison({etas,events,config,routes,boundaries=[],size=16}){
  if(!etas.fit?.version?.startsWith('rectangular-gaussian-spatial-etas-'))throw new Error('Choose a saved spatial ETAS fit');
  if(!Number.isInteger(size)||size<4||size>64)throw new Error('Choose a 4–64 cell grid side');
  const cutoff=etas.fit.options.end,end=cutoff+7*DAY,provider=etas.fit.options.provider,minMagnitude=etas.fit.options.minMagnitude,r=region(etas.fit.options);
  if(end>Date.now())throw new Error('The complete seven-day comparison window has not elapsed');
  const conditioning=events.filter(e=>e.time<=cutoff),ds=generate(conditioning,cutoff,{...config,catalogProvider:provider,windowDays:7},routes,boundaries),grid=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)grid.push(inverse((x+.5)*r.xmax/size,r.ymin+(y+.5)*(r.ymax-r.ymin)/size,r));
  const watches=ds.candidates.filter(f=>f.magnitude.max>=minMagnitude),dsCells=grid.map(p=>watches.some(f=>distance(p,f.center)<=f.radiusKm)?1:0);
  const randomSeed=20260928,random=seeded(randomSeed);
  const models={Random:Array.from({length:size*size},()=>random()),DS:dsCells,ETAS:projectSpatialETAS(etas.fit,conditioning,[7],size).maps[0].cells,Uniform:Array(size*size).fill(1)},observed=Array(size*size).fill(0),outcomes=[];
  for(const e of events){
    if(e.provider!==provider||e.type!=='earthquake'||e.status==='deleted'||e.time<=cutoff||e.time>end||e.mag<minMagnitude||!Number.isFinite(e.lat)||!Number.isFinite(e.lon)||e.lat<r.south||e.lat>r.north||((e.lon-r.west+360)%360)>r.width)continue;
    const p=project(e,r),x=Math.min(size-1,Math.floor(p.x/r.xmax*size)),y=Math.min(size-1,Math.floor((p.y-r.ymin)/(r.ymax-r.ymin)*size));
    observed[y*size+x]++;outcomes.push(e);
  }
  return {version:'paired-spatial-rank-1',randomSeed,cutoff,end,provider,minMagnitude,grid:{size,region:r,centers:grid},models,observed,outcomes,watches,config:ds.config,engineVersion:ds.engineVersion,routeVersion:routes.version,etasId:etas.id,ranking:Object.entries(models).map(([name,cells])=>({name,...spatialRank(cells,observed)})).sort((a,b)=>(b.eventWeightedSpatialRank??-1)-(a.eventWeightedSpatialRank??-1)||a.name.localeCompare(b.name)),limitations:['Revised-catalog exploratory hindcast; current DS rules and route geometry are applied retrospectively. Model choices and region may have been selected after inspecting outcomes.','DS is the binary union of draft watch disks whose upper magnitude reaches the common catalog floor, sampled at cell centers; small disks may be missed by the grid. The metric does not evaluate each watch magnitude range or target count.','ETAS ranks integrated background and observed-parent triggering; future descendants are excluded. No outcome event changes either input map.','All models share exactly the same region, seven-day window, catalog floor, cells and outcome events. Uniform is an equal-priority reference; Random uses the fixed recorded seed without outcome-based seed selection.','This comparison measures spatial prioritization only. It does not establish predictive significance, calibration, independence or prospective skill. Learned and calibrated DS variants are not included in this version.']};
}
