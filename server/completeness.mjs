import {DAY,insideBounds,validateBounds,longitudeWidth,seeded} from './geo.mjs';
export const COMPLETENESS_VERSION='regional-magnitude-diagnostics-0.1.0';
export function completenessOptions(input,now=Date.now()){
  const value={start:typeof input.start==='number'?input.start:Date.parse(input.start),end:typeof input.end==='number'?input.end:Date.parse(input.end),minMagnitude:Number(input.minMagnitude??2),binWidth:Number(input.binWidth??.1),windowDays:Number(input.windowDays??30),magType:input.magType??'all',provider:input.provider??'USGS',bounds:validateBounds(input.bounds)};
  if(![value.start,value.end,value.minMagnitude,value.windowDays].every(Number.isFinite)||value.start<Date.UTC(1900,0,1)||value.end>now||value.start>=value.end||value.end-value.start>50*366*DAY||value.minMagnitude<0||value.minMagnitude>8||![.05,.1,.2].includes(value.binWidth)||value.windowDays<7||value.windowDays>366||Math.ceil((value.end-value.start)/(value.windowDays*DAY))>600||!['USGS','EMSC'].includes(value.provider)||typeof value.magType!=='string'||!/^[-a-zA-Z0-9_]{1,16}$/.test(value.magType))throw new Error('Choose elapsed dates, a 0–8 catalog floor, 0.05/0.1/0.2 bins and 7–366 day windows (maximum 600 windows)');
  if(Math.sin(value.bounds.north*Math.PI/180)-Math.sin(value.bounds.south*Math.PI/180)<1e-12)throw new Error('Choose a larger latitude extent for equal-area diagnostics');
  return {...value,minEvents:100,stabilityBins:Math.ceil(.5/value.binWidth),maxcCorrection:.2,bootstrapReplicates:200,seed:20260913};
}
const tidy=n=>Math.round(n*1e8)/1e8;
export function completenessContext(report,asOf,mode='catalog-replay',sample='pooled'){
  if(!['strict','catalog-replay'].includes(mode))throw new Error('Choose strict or revised-catalog replay');
  if(!Number.isFinite(asOf)||report.options.end>asOf)throw new Error('This diagnostic includes observations after the analysis cutoff');
  if(mode==='strict'&&report.createdAt>asOf)throw new Error('This diagnostic was unavailable at the strict observation cutoff');
  const match=typeof sample==='string'?/^(time|cell)-(\d+)$/.exec(sample):null,value=sample==='pooled'?report.pooled:match?(match[1]==='time'?report.temporal:report.spatial)[Number(match[2])]:null;
  if(!value)throw new Error('Select an existing diagnostic sample');
  const summary=v=>{const {histogram,candidates,...rest}=v;return rest;},variation=groups=>{const stable=groups.filter(g=>g.mbs);return {samples:groups.length,stableSamples:stable.length,mcRange:stable.length?[Math.min(...stable.map(g=>g.mbs.mc)),Math.max(...stable.map(g=>g.mbs.mc))]:null};};
  return structuredClone({id:report.id,version:report.version,createdAt:report.createdAt,inputSnapshotId:report.inputSnapshotId,options:report.options,events:report.events,magnitudeTypes:report.magnitudeTypes,pooled:summary(report.pooled),selectedSample:{id:sample,...summary(value)},variation:{temporal:variation(report.temporal),spatial:variation(report.spatial)},method:report.method,sources:report.sources,limitations:report.limitations,catalogMode:report.catalogMode});
}
function fromHistogram(counts,first,o){
  const n=counts.reduce((a,b)=>a+b,0),histogram=[],candidates=[];let count=0,sum=0,squares=0;
  for(let k=counts.length-1;k>=0;k--){const index=first+k,c=counts[k];count+=c;sum+=c*index;squares+=c*index*index;const mc=tidy(index*o.binWidth),excess=count?sum/count-index:0,b=count>=o.minEvents&&excess>0?Math.log1p(1/excess)/(o.binWidth*Math.LN10):null;
    const sigma=b===null?null:Math.LN10*b*b*o.binWidth*Math.sqrt(Math.max(0,squares-sum*sum/count)/(count*(count-1)));
    histogram.unshift({magnitude:mc,count:c,cumulative:count});
    candidates.unshift({mc,events:count,b,sigma,fullyRetrievedBin:mc-o.binWidth/2>=o.minMagnitude-1e-9,stabilityRatio:null});
  }
  const peak=counts.length?counts.indexOf(Math.max(...counts)):-1,rawMaxc=n?tidy((first+peak)*o.binWidth):null;
  for(let i=0;i<candidates.length;i++){
    const c=candidates[i],window=candidates.slice(i,i+o.stabilityBins);
    if(c.fullyRetrievedBin&&c.sigma>0&&window.length===o.stabilityBins&&window.every(v=>v.b!==null))c.stabilityRatio=Math.abs(window.reduce((s,v)=>s+v.b,0)/window.length-c.b)/c.sigma;
  }
  const mbs=candidates.find(c=>c.stabilityRatio!==null&&c.stabilityRatio<1)??null;
  const floorLimited=n>0&&(rawMaxc-o.binWidth/2<o.minMagnitude||mbs&&mbs.mc<=o.minMagnitude+o.binWidth+1e-9);
  return {events:n,histogram,candidates,rawMaxc,maxc:rawMaxc===null?null:tidy(rawMaxc+o.maxcCorrection),mbs,floorLimited:!!floorLimited,status:n<o.minEvents?'insufficient-events':mbs?'estimated':'no-stable-threshold'};
}
function percentile(values,p){if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);}
export function magnitudeSummary(magnitudes,options,{bootstrap=false}={}){
  const o={minMagnitude:2,binWidth:.1,minEvents:100,stabilityBins:5,maxcCorrection:.2,bootstrapReplicates:200,seed:20260913,...options};
  if(![.05,.1,.2].includes(o.binWidth)||!Number.isFinite(o.minMagnitude)||o.minMagnitude<0||o.minMagnitude>8||!Number.isInteger(o.minEvents)||o.minEvents<2||!Number.isInteger(o.stabilityBins)||o.stabilityBins<1||o.stabilityBins>20)throw new Error('Invalid magnitude diagnostic options');
  const indices=magnitudes.filter(m=>Number.isFinite(m)&&m>=o.minMagnitude&&m<=11).map(m=>Math.round(m/o.binWidth)),first=Math.round(o.minMagnitude/o.binWidth),last=indices.reduce((m,i)=>Math.max(m,i),first),counts=Array(last-first+1).fill(0);
  for(const i of indices)counts[i-first]++;
  const result=fromHistogram(counts,first,o);
  if(bootstrap&&indices.length>=o.minEvents){
    const rng=seeded(o.seed),mcs=[],bs=[];
    // ponytail: pooled IID resampling only; clustered/space-time block uncertainty requires a separate protocol.
    for(let i=0;i<o.bootstrapReplicates;i++){const sample=Array(counts.length).fill(0);for(let j=0;j<indices.length;j++)sample[indices[Math.floor(rng()*indices.length)]-first]++;const fit=fromHistogram(sample,first,o).mbs;if(fit){mcs.push(fit.mc);bs.push(fit.b);}}
    result.bootstrap={replicates:o.bootstrapReplicates,successes:mcs.length,mcPercentiles:[percentile(mcs,.025),percentile(mcs,.975)],bPercentiles:[percentile(bs,.025),percentile(bs,.975)],method:'Seeded IID resampling of observed magnitudes. Percentiles are conditional on a stable fit; failures are counted. They do not include clustering, missing-event or magnitude-scale uncertainty.'};
  }
  return result;
}
export function completenessAnalysis(input,options){
  const o=completenessOptions(options),eligible=input.filter(e=>e.provider===o.provider&&e.type==='earthquake'&&e.status!=='deleted'&&e.time>=o.start&&e.time<o.end&&e.mag>=o.minMagnitude&&insideBounds(e,o.bounds));
  if(eligible.length>250000)throw new Error('Limit diagnostics to 250,000 regional earthquakes per run');
  const magnitudeTypes=eligible.reduce((a,e)=>(a[e.magType??'unknown']=(a[e.magType??'unknown']??0)+1,a),{}),events=eligible.filter(e=>o.magType==='all'||e.magType===o.magType),pooled=magnitudeSummary(events.map(e=>e.mag),o,{bootstrap:true}),temporal=[];
  for(let start=o.start;start<o.end;start+=o.windowDays*DAY){const end=Math.min(o.end,start+o.windowDays*DAY);temporal.push({start,end,...magnitudeSummary(events.filter(e=>e.time>=start&&e.time<end).map(e=>e.mag),o)});}
  const {south,north,west}=o.bounds,width=longitudeWidth(o.bounds),sinSouth=Math.sin(south*Math.PI/180),sinNorth=Math.sin(north*Math.PI/180),groups=Array.from({length:16},()=>[]),wrap=lon=>((lon+540)%360)-180;
  for(const e of events){const row=Math.min(3,Math.floor((Math.sin(e.lat*Math.PI/180)-sinSouth)/(sinNorth-sinSouth)*4)),col=Math.min(3,Math.floor(((e.lon-west+360)%360)/width*4));groups[row*4+col].push(e.mag);}
  const spatial=groups.map((mags,i)=>{const row=Math.floor(i/4),col=i%4;return {index:i,bounds:{south:Math.asin(sinSouth+(sinNorth-sinSouth)*row/4)*180/Math.PI,north:Math.asin(sinSouth+(sinNorth-sinSouth)*(row+1)/4)*180/Math.PI,west:wrap(west+width*col/4),east:wrap(west+width*(col+1)/4)},...magnitudeSummary(mags,o)};});
  return {version:COMPLETENESS_VERSION,options:o,events:events.length,eligibleEvents:eligible.length,magnitudeTypes,pooled,temporal,spatial,
    method:'MAXC is the modal incremental magnitude bin plus 0.2. MBS is the first fully retrieved bin with |mean next K b-values − b| / sigma_b < 1. Each b-fit needs 100 events; b uses the discrete geometric maximum likelihood and sigma_b the Shi–Bolt approximation. These are catalog diagnostics, not proof of complete detection.',
    sources:['https://seismostats.readthedocs.io/latest/user/estimate_mc.html','https://seismostats.readthedocs.io/latest/user/estimate_b.html','https://doi.org/10.1785/0120040007'],
    limitations:['A magnitude-frequency fit cannot prove all earthquakes were detected. Retrieval coverage and detection completeness are different.',
      'A peak or stable estimate at the retrieval floor is censored; import lower magnitudes to examine the turnover. The partially retrieved lowest rounded bin is excluded from MBS candidates.',
      'Pooled estimates can hide time, depth and location differences. Temporal and 4×4 equal-area panels expose variation but may have too few events.',
      'Magnitudes are rounded to the selected bin width. Native magnitude types are retained; mixed scales are not homogenized. Use the magnitude-type filter to examine sensitivity.',
      'MAXC +0.2 is a heuristic correction. Stability depends on bin width, sample size and the configured 0.5-unit-or-wider look-ahead; neither establishes a calibrated detection probability.',
      'IID bootstrap intervals condition on observed magnitudes and successful fits, ignoring earthquake clustering and missing observations.',
      'All intervals are revised-catalog diagnostics. Do not use results from later dates to choose thresholds for an earlier claimed prospective experiment.']};
}
