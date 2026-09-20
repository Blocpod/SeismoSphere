import {DAY,R} from './geo.mjs';
import {omori,omoriMass,productivity,minimize} from './etas.mjs';
export const SPATIAL_ETAS_VERSION='rectangular-gaussian-spatial-etas-0.1.0';
const rad=Math.PI/180,clip=(x,a,b)=>Math.max(a,Math.min(b,x));
export function region(options){
  const {south,north,west,east}=options,width=(east-west+360)%360;
  if(![south,north,west,east].every(Number.isFinite)||south>=north||south< -70||north>70||north-south>20||Math.abs(west)>180||Math.abs(east)>180||width<.1||width>30)throw new Error('Spatial ETAS requires a 0.1–30° longitude span and ≤20° latitude span within 70° of the equator. West > east crosses the dateline.');
  const cos=Math.cos((south+north)/2*rad),xmax=R*cos*width*rad,ymin=R*Math.sin(south*rad)/cos,ymax=R*Math.sin(north*rad)/cos;
  return {south,north,west,east,width,cos,xmin:0,xmax,ymin,ymax,areaKm2:xmax*(ymax-ymin)};
}
export function project(point,r){return {x:R*r.cos*((point.lon-r.west+360)%360)*rad,y:R*Math.sin(point.lat*rad)/r.cos};}
export function inverse(x,y,r){return {lon:((r.west+x/(R*r.cos*rad)+540)%360)-180,lat:Math.asin(clip(y*r.cos/R,-1,1))/rad};}
// Normal CDF via the five-term erf approximation; absolute error below ~1.5e-7.
export function normalCDF(z){const x=Math.abs(z)/Math.SQRT2,t=1/(1+.3275911*x),erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return .5*(1+(z<0?-erf:erf));}
export function gaussianMass(parent,sigma,box){return Math.max(0,(normalCDF((box.xmax-parent.x)/sigma)-normalCDF((box.xmin-parent.x)/sigma))*(normalCDF((box.ymax-parent.y)/sigma)-normalCDF((box.ymin-parent.y)/sigma)));}
export function gaussianDensity(r2,sigma){return Math.exp(-r2/(2*sigma*sigma))/(2*Math.PI*sigma*sigma);}
const widthFor=(event,p,mc)=>p.sigmaKm*Math.exp(.5*p.gamma*(event.mag-mc));
export function prepareSpatial(events,options){
  const {start,end,historyDays=5,minMagnitude=4.5,provider='USGS'}=options,r=region(options);
  if(![start,end,historyDays,minMagnitude].every(Number.isFinite)||end<=start||end-start>180*DAY||historyDays<1||historyDays>90||minMagnitude<0||minMagnitude>8)throw new Error('Invalid spatial ETAS interval, history or magnitude threshold');
  const history=events.filter(e=>e.provider===provider&&e.type==='earthquake'&&e.status!=='deleted'&&e.time>=start-historyDays*DAY&&e.time<=end&&e.mag>=minMagnitude&&e.lat>=r.south&&e.lat<=r.north&&((e.lon-r.west+360)%360)<=r.width).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)).map(e=>({id:e.id,time:e.time,t:(e.time-start)/DAY,mag:e.mag,lat:e.lat,lon:e.lon,...project(e,r)}));
  return {history,region:r};
}
export function spatialIntensity(t,point,history,p,mc,r){
  let value=p.mu/r.areaKm2;
  for(const e of history)if(e.t<t)value+=productivity(e.mag,p,mc)*omori(t-e.t,p.c,p.p)*gaussianDensity((e.x-point.x)**2+(e.y-point.y)**2,widthFor(e,p,mc));
  return value;
}
export function spatialCompensator(a,b,history,p,mc,r){
  let total=p.mu*(b-a);
  for(const e of history)if(e.t<b)total+=productivity(e.mag,p,mc)*omoriMass(Math.max(0,a-e.t),b-e.t,p.c,p.p)*gaussianMass(e,widthFor(e,p,mc),r);
  return total;
}
export function spatialLikelihood(history,a,b,p,mc,r){let ll=-spatialCompensator(a,b,history,p,mc,r);for(const e of history)if(e.t>a&&e.t<=b)ll+=Math.log(spatialIntensity(e.t,e,history,p,mc,r));return ll;}
function kdeAt(point,training,bandwidth,r,exclude=-1){let value=0;for(let i=0;i<training.length;i++)if(i!==exclude){const e=training[i];value+=gaussianDensity((e.x-point.x)**2+(e.y-point.y)**2,bandwidth)/gaussianMass(e,bandwidth,r);}return Math.max(1e-300,value/(training.length-(exclude>=0?1:0)));}
function fitKDE(training,r){const trials=[10,25,50,100,200].map(bandwidthKm=>({bandwidthKm,leaveOneOutLogDensity:training.reduce((sum,e,i)=>sum+Math.log(kdeAt(e,training,bandwidthKm,r,i)),0)})).sort((a,b)=>b.leaveOneOutLogDensity-a.leaveOneOutLogDensity);return {...trials[0],trials,method:'Static Poisson rate with spatial Gaussian KDE, normalized inside the region. Bandwidth selected by training-only leave-one-out location likelihood.'};}
export function fitSpatialETAS(events,options){
  const {history,region:r}=prepareSpatial(events,options),training=history.filter(e=>e.t>0),count=training.length,duration=(options.end-options.start)/DAY,mc=options.minMagnitude??4.5;
  if(count<30)throw new Error(`Only ${count} spatial training events; at least 30 are required.`);
  if(history.length>1500)throw new Error('Spatial fit exceeds 1500 conditioning/training events. Shorten the interval or raise M; no events are silently sampled.');
  const beta=1/(training.reduce((s,e)=>s+e.mag-mc,0)/count+.05),rate=count/duration,logLo=Math.log(1e-5),logHi=Math.log(Math.max(1,rate*3));
  const decode=x=>{const n=x[1]*.98,alpha=x[2]*beta*.95;return {mu:Math.exp(logLo+x[0]*(logHi-logLo)),n,alpha,c:Math.exp(Math.log(.0001)+x[3]*Math.log(20000)),p:1.01+x[4]*1.79,sigmaKm:Math.exp(Math.log(2)+x[5]*Math.log(150)),gamma:x[6]*2,A:n*(1-alpha/beta),beta};};
  const rows=training.map(e=>history.flatMap((h,i)=>h.t<e.t?[{i,lag:e.t-h.t,r2:(e.x-h.x)**2+(e.y-h.y)**2}]:[]));
  function objective(x){const p=decode(x),sigma=history.map(e=>widthFor(e,p,mc)),k=history.map(e=>productivity(e.mag,p,mc));let ll=-p.mu*duration;
    history.forEach((e,i)=>ll-=k[i]*omoriMass(Math.max(0,-e.t),duration-e.t,p.c,p.p)*gaussianMass(e,sigma[i],r));
    for(const row of rows){let lambda=p.mu/r.areaKm2;for(const h of row)lambda+=k[h.i]*omori(h.lag,p.c,p.p)*gaussianDensity(h.r2,sigma[h.i]);ll+=Math.log(lambda);}return -ll;
  }
  const starts=[.2,.55,.85].map((n,i)=>[(Math.log(Math.max(1e-5,rate*(1-n)))-logLo)/(logHi-logLo),n/.98,.5/.95,.48,.15,[.3,.5,.7][i],.35]);
  const fits=starts.map(s=>minimize(objective,s,1000)).sort((a,b)=>a.f-b.f),best=fits[0],parameters=decode(best.x),kde=fitKDE(training,r);
  return {version:SPATIAL_ETAS_VERSION,options:{...options,historyDays:options.historyDays??5,minMagnitude:mc},region:r,parameters,frozenHistory:history,
    training:{events:count,conditioningEvents:history.length-count,durationDays:duration,eventIds:training.map(e=>e.id),conditioningIds:history.filter(e=>e.t<=0).map(e=>e.id)},
    fit:{logLikelihood:-best.f,uniformPoissonLogLikelihood:count*Math.log(rate/r.areaKm2)-count,poissonRate:rate,optimizerConverged:best.converged,evaluations:fits.reduce((s,f)=>s+f.evaluations,0),starts:fits.map(f=>({logLikelihood:-f.f,converged:f.converged})),boundaryParameters:['background rate','branching ratio','magnitude productivity','time offset','decay exponent','spatial scale','spatial magnitude scaling'].filter((_,i)=>best.x[i]<.001||best.x[i]>.999),kde},
    sources:['https://doi.org/10.1023/A:1003403601725','https://search.r-project.org/CRAN/refmans/ETAS/html/etas.html','https://proj.org/en/stable/operations/projections/cea.html','https://doi.org/10.1007/s00477-022-02221-2'],
    limitations:['Gaussian space-time ETAS with uniform background and isotropy in a regional cylindrical equal-area projection; this is not the full semiparametric R ETAS implementation.','Likelihood integrates each triggering kernel over the finite region. Parents outside the region and before the finite conditioning history remain unobserved.','Spatial distance is projected epicentral distance; depth, fault geometry, anisotropy and location uncertainty are not modeled. Projection preserves area but distorts distance away from its standard latitude.','M completeness is assumed, including during dense aftershock sequences; magnitude scales are not homogenized. Beta uses training magnitudes with 0.1-bin correction.','The implied full-plane branching ratio is constrained below 0.98; it is not the actual regional offspring fraction. Bounds and local optimizer solutions need scrutiny; no confidence intervals or global optimality claim.','Holdout parameters and spatial KDE are frozen at training end. Previously observed holdout events may trigger later ones; this is not advance prediction of a mainshock.','Region, threshold and model were selected exploratorily. Results are retrospective, not prospectively registered or probability-calibrated.']};
}
export function evaluateSpatialETAS(model,events,end){
  const o=model.options;if(!Number.isFinite(end)||end<=o.end||end-o.end>30*DAY)throw new Error('Spatial holdout must end within 30 days after training');
  const prepared=prepareSpatial(events,{...o,start:o.end,end,historyDays:1}),r=model.region,a=(o.end-o.start)/DAY,b=(end-o.start)/DAY,outcomes=prepared.history.filter(e=>e.time>o.end).map(e=>({...e,t:(e.time-o.start)/DAY})),history=[...model.frozenHistory,...outcomes],training=model.frozenHistory.filter(e=>e.t>0),rate=model.fit.poissonRate;
  const ll=spatialLikelihood(history,a,b,model.parameters,o.minMagnitude,r),uniform=outcomes.length*Math.log(rate/r.areaKm2)-rate*(b-a),kde=outcomes.reduce((sum,e)=>sum+Math.log(rate)+Math.log(kdeAt(e,training,model.fit.kde.bandwidthKm,r)),0)-rate*(b-a);
  return {start:o.end,end,events:outcomes.length,eventIds:outcomes.map(e=>e.id),logLikelihood:ll,uniformPoissonLogLikelihood:uniform,kdePoissonLogLikelihood:kde,bitsPerEventVsUniform:outcomes.length?(ll-uniform)/outcomes.length/Math.LN2:null,bitsPerEventVsKDE:outcomes.length?(ll-kde)/outcomes.length/Math.LN2:null,method:'Prequential joint time-location likelihood in events/day/km², parameters frozen; compared with a training-fitted uniform Poisson model and training-only spatial KDE Poisson model.'};
}
export function projectSpatialETAS(model,events,horizons=[1,7,10],size=32){
  const history=model.frozenHistory,r=model.region,cutoff=(model.options.end-model.options.start)/DAY,p=model.parameters,mc=model.options.minMagnitude,dx=r.xmax/size,dy=(r.ymax-r.ymin)/size;
  return {size,cutoff:model.options.end,region:r,units:'Integrated background + observed-parent triggering intensity per cell; excludes future cascades',method:'Cell integrals use Gaussian rectangle masses and analytic Omori time integrals. Only parents observed at training cutoff contribute. These are not calibrated probabilities or the expected total including future descendants.',maps:horizons.map(days=>{
    const weights=history.map(e=>productivity(e.mag,p,mc)*omoriMass(Math.max(0,cutoff-e.t),cutoff+days-e.t,p.c,p.p)),sigmas=history.map(e=>widthFor(e,p,mc)),cells=[];
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){const box={xmin:i*dx,xmax:(i+1)*dx,ymin:r.ymin+j*dy,ymax:r.ymin+(j+1)*dy};let value=p.mu*days/(size*size);history.forEach((e,k)=>value+=weights[k]*gaussianMass(e,sigmas[k],box));cells.push(value);}
    return {days,cells,totalDirectIntensity:spatialCompensator(cutoff,cutoff+days,history,p,mc,r),cellSum:cells.reduce((a,b)=>a+b,0)};
  })};
}
