import {distance,interpolate} from './geo.mjs';
export const TECTONIC_VERSION='pb2002-weekly-counts-1';
export const tectonicCell=(lat,lon)=>Math.min(5,Math.floor((Math.sin(lat*Math.PI/180)+1)*3))*12+Math.floor(((lon+180)%360+360)%360/30);
export function boundaryExposure(geojson){
 const lengthKm=Array(72).fill(0);let segments=0;
 for(const feature of geojson.features??[]){const g=feature.geometry,lines=g?.type==='LineString'?[g.coordinates]:g?.type==='MultiLineString'?g.coordinates:[];
  for(const line of lines)for(let i=1;i<line.length;i++){
   const [lon,lat]=line[i-1],[lon2,lat2]=line[i];if(![lon,lat,lon2,lat2].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lat2)>90)throw new Error('Invalid boundary coordinates');
   const a={lat,lon},b={lat:lat2,lon:lon2},length=distance(a,b);if(!length)continue;if(length>19000)throw new Error('Ambiguous boundary segment');const pieces=Math.ceil(length/25);
   for(let j=0;j<pieces;j++){const p=interpolate(a,b,(j+.5)/pieces);lengthKm[tectonicCell(p.lat,p.lon)]+=length/pieces;}segments++;
  }
 }
 const totalLengthKm=lengthKm.reduce((a,b)=>a+b,0);if(!totalLengthKm)throw new Error('No usable plate boundaries');return {lengthKm,totalLengthKm,segments,maxPieceKm:25};
}
export function fitTectonic(trainCounts,trainWeeks,exposure){
 if(trainCounts.length!==72||trainCounts.some(x=>!Number.isInteger(x)||x<0)||!Number.isInteger(trainWeeks)||trainWeeks<1)throw new Error('Invalid training counts');
 const total=trainCounts.reduce((a,b)=>a+b,0);if(!total)throw new Error('No training events');
 const trials=[];let best=null;
 for(let step=0;step<=99;step++){const alpha=step/100,probability=exposure.lengthKm.map(k=>alpha*k/exposure.totalLengthKm+(1-alpha)/72),score=trainCounts.reduce((s,y,i)=>s+y*Math.log(probability[i]),0);trials.push({alpha,score});if(!best||score>best.score+1e-9)best={alpha,score,probability};}
 return {alpha:best.alpha,atGridBoundary:best.alpha===0||best.alpha===.99,weeklyRate:total/trainWeeks,cells:best.probability.map(p=>p*total/trainWeeks),trainEvents:total,trainWeeks,trials};
}
export function tectonicComparison(parent,events,boundaries){
 const train=parent.scores.train,trainCounts=Array(72).fill(0);
 for(const e of events)if(e.type==='earthquake'&&e.mag>=parent.options.minMagnitude&&e.time>train.firstCutoff&&e.time<=train.lastEnd)trainCounts[tectonicCell(e.lat,e.lon)]++;
 const exposure=boundaryExposure(boundaries),fit=fitTectonic(trainCounts,train.windows,exposure);
 if(fit.trainEvents!==train.models.graph.events)throw new Error('Training snapshot does not reproduce parent event count');
 let gain=0,absoluteError=0,observed=0;
 for(const w of parent.testWindows)for(let i=0;i<72;i++){const y=w.observed[i],rate=fit.cells[i],graph=w.graph[i];gain+=y*(Math.log(rate)-Math.log(graph))-rate+graph;absoluteError+=Math.abs(y-rate);observed+=y;}
 const graph=parent.scores.test.models.graph,windows=parent.testWindows.length;
 return {version:TECTONIC_VERSION,parentRunId:parent.id,exposure,fit,training:{start:train.firstCutoff,end:train.lastEnd,counts:trainCounts},test:{start:parent.scores.test.firstCutoff,end:parent.scores.test.lastEnd,windows,events:observed,logLikelihood:graph.logLikelihood+gain,logLikelihoodGainVsGraph:gain,bitsPerEventVsGraph:observed?gain/(observed*Math.LN2):null,expectedCount:fit.weeklyRate*windows,meanAbsoluteError:absoluteError/(windows*72)},method:'Static seven-day M≥5 count baseline on 72 equal-area cells. Boundary length is distributed by great-circle subsegment midpoints at ≤25 km spacing. Training-only mixture alpha is selected on a fixed 0.00–0.99 grid; ties favor smaller alpha. At least 1% uniform background remains. Global rate is training events per week.',limitations:['Geometry is the modern PB2002 reference, not reconstructed historical knowledge.','A boundary-length prior is a coarse tectonic-context heuristic; slip rates, boundary types, inland faults, local crust and transient stress are not modeled.','Static expected counts are not calibrated probabilities or forecasts of precise time, magnitude or epicenter.','Test outcomes never fit the rate or mixture; the previously examined historical interval is exploratory, not fresh prospective validation.','M5 completeness, stationarity and Poisson assumptions remain unvalidated.'],source:{citation:'Bird (2003), An updated digital model of plate boundaries, doi:10.1029/2001GC000252; GeoJSON conversion by Hugo Ahlenius / fraxen.',url:'https://github.com/fraxen/tectonicplates',license:'Open Data Commons Attribution 1.0'}};
}
