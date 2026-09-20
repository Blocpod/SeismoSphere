import {DAY,distance} from './geo.mjs';

export const ETAS_VERSION='regional-temporal-etas-0.1.0';
export const ETAS_SOURCES=[
  'https://doi.org/10.1029/2006JB004697',
  'https://search.r-project.org/CRAN/refmans/ETAS/html/etas.html'
];
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const sum=a=>a.reduce((s,x)=>s+x,0);

// Normalized modified Omori density. Units: inverse days; total mass on (0,infinity) is one.
export function omori(t,c,p){return t>0?(p-1)/c*Math.pow(1+t/c,-p):0;}
export function omoriMass(a,b,c,p){return b>a?Math.pow(1+Math.max(0,a)/c,1-p)-Math.pow(1+Math.max(0,b)/c,1-p):0;}
export function productivity(m,parameters,mc){return parameters.A*Math.exp(parameters.alpha*(m-mc));}
export function intensity(t,history,parameters,mc){
  let value=parameters.mu;
  for(const e of history)if(e.t<t)value+=productivity(e.mag,parameters,mc)*omori(t-e.t,parameters.c,parameters.p);
  return value;
}
export function compensator(a,b,history,parameters,mc){
  let value=parameters.mu*(b-a);
  for(const e of history)if(e.t<b)value+=productivity(e.mag,parameters,mc)*omoriMass(Math.max(0,a-e.t),b-e.t,parameters.c,parameters.p);
  return value;
}
export function logLikelihood(history,start,end,parameters,mc){
  let value=-compensator(start,end,history,parameters,mc);
  for(const e of history)if(e.t>start&&e.t<=end)value+=Math.log(intensity(e.t,history,parameters,mc));
  return value;
}

// Bounded Nelder–Mead, three independent starts. Boundary/convergence diagnostics are returned.
export function minimize(fn,start,maxEvaluations=650){
  let calls=0;const evalAt=x=>({x:x.map(v=>clip(v,0,1)),f:0});
  const evaluate=x=>{const p=evalAt(x);p.f=fn(p.x);calls++;return p;};
  let simplex=[evaluate(start),...start.map((_,i)=>evaluate(start.map((v,j)=>i===j?v+.07:v)))];
  let converged=false;
  while(calls<maxEvaluations){
    simplex.sort((a,b)=>a.f-b.f);
    const best=simplex[0],worst=simplex.at(-1),n=start.length;
    if(Math.max(...simplex.map(p=>Math.abs(p.f-best.f)))<1e-6&&Math.max(...simplex.flatMap(p=>p.x.map((v,j)=>Math.abs(v-best.x[j]))))<.002){converged=true;break;}
    const center=start.map((_,j)=>sum(simplex.slice(0,n).map(p=>p.x[j]))/n);
    const reflected=evaluate(center.map((v,j)=>2*v-worst.x[j]));
    if(reflected.f<best.f){const expanded=evaluate(center.map((v,j)=>v+2*(reflected.x[j]-v)));simplex[n]=expanded.f<reflected.f?expanded:reflected;}
    else if(reflected.f<simplex[n-1].f)simplex[n]=reflected;
    else{
      const outside=reflected.f<worst.f,target=outside?reflected:worst;
      const contracted=evaluate(center.map((v,j)=>v+.5*(target.x[j]-v)));
      if(contracted.f<target.f)simplex[n]=contracted;
      else simplex=[best,...simplex.slice(1).map(p=>evaluate(p.x.map((v,j)=>best.x[j]+.5*(v-best.x[j]))))];
    }
  }
  simplex.sort((a,b)=>a.f-b.f);return {...simplex[0],evaluations:calls,converged};
}

export function prepareRegional(events,options){
  const {start,end,historyDays=5,minMagnitude=4.5,lat,lon,radiusKm=1000,provider='USGS'}=options;
  if(![start,end,historyDays,minMagnitude,lat,lon,radiusKm].every(Number.isFinite)||end<=start||end-start>180*DAY||historyDays<1||historyDays>90||Math.abs(lat)>90||Math.abs(lon)>180||radiusKm<50||radiusKm>5000||minMagnitude<0||minMagnitude>8)throw new Error('Invalid ETAS region, dates, threshold, or history length');
  return events.filter(e=>e.provider===provider&&e.type==='earthquake'&&e.status!=='deleted'&&e.time>=start-historyDays*DAY&&e.time<=end&&e.mag>=minMagnitude&&distance(e,{lat,lon})<=radiusKm).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)).map(e=>({id:e.id,time:e.time,t:(e.time-start)/DAY,mag:e.mag}));
}

export function fitTemporalETAS(events,options){
  const history=prepareRegional(events,options),duration=(options.end-options.start)/DAY,mc=options.minMagnitude??4.5;
  const training=history.filter(e=>e.t>0),count=training.length;
  if(count<30)throw new Error(`Only ${count} regional training events. Import a longer interval or select a larger region; at least 30 are required.`);
  if(history.length>1500)throw new Error(`The region has ${history.length} events. Raise the magnitude threshold or shorten the interval (1500-event fitting limit; no silent subsampling).`);
  const rate=count/duration,beta=1/(sum(training.map(e=>e.mag-mc))/count+.05);
  const upperMu=Math.max(1,rate*3),logLo=Math.log(1e-5),logHi=Math.log(upperMu);
  const decode=x=>{const mu=Math.exp(logLo+x[0]*(logHi-logLo)),n=x[1]*.98,alpha=x[2]*beta*.95,c=Math.exp(Math.log(.0001)+x[3]*Math.log(20000)),p=1.01+x[4]*1.79;return {mu,n,alpha,c,p,A:n*(1-alpha/beta),beta};};
  // Precompute positive lags. Coincident times cannot trigger each other.
  const rows=training.map(e=>history.filter(h=>h.t<e.t).map(h=>({lag:e.t-h.t,mag:h.mag})));
  function objective(x){
    const p=decode(x);let ll=-compensator(0,duration,history,p,mc);
    for(const row of rows){let r=p.mu;for(const h of row)r+=productivity(h.mag,p,mc)*omori(h.lag,p.c,p.p);ll+=Math.log(r);}
    return -ll;
  }
  const starts=[.2,.55,.85].map(n=>[(Math.log(Math.max(1e-5,rate*(1-n)))-logLo)/(logHi-logLo),n/.98,.5/.95,.48,.15]);
  const fits=starts.map(s=>minimize(objective,s)).sort((a,b)=>a.f-b.f),best=fits[0],parameters=decode(best.x);
  const poissonLogLikelihood=count*Math.log(rate)-rate*duration;
  const residuals=[];let previous=0;
  for(const e of training){residuals.push(compensator(previous,e.t,history,parameters,mc));previous=e.t;}
  const boundaryNames=['background rate','branching ratio','magnitude productivity','time offset','decay exponent'].filter((_,i)=>best.x[i]<.001||best.x[i]>.999);
  return {
    version:ETAS_VERSION,options:{...options,minMagnitude:mc,historyDays:options.historyDays??5},parameters,
    training:{events:count,conditioningEvents:history.length-count,durationDays:duration,first:training[0].time,last:training.at(-1).time,eventIds:training.map(e=>e.id),conditioningIds:history.filter(e=>e.t<=0).map(e=>e.id)},
    fit:{logLikelihood:-best.f,poissonLogLikelihood,poissonRate:rate,logLikelihoodGain:-best.f-poissonLogLikelihood,optimizerConverged:best.converged,evaluations:sum(fits.map(f=>f.evaluations)),starts:fits.map(f=>({logLikelihood:-f.f,converged:f.converged})),boundaryParameters:boundaryNames,timeRescaledResiduals:residuals,residualMean:sum(residuals)/residuals.length},
    sources:ETAS_SOURCES,
    limitations:[
      'Regional temporal ETAS: locations select a fixed region; there is no fitted spatial kernel or stress-transfer model.',
      'Magnitude completeness is assumed at the chosen threshold, not established by this fit. Magnitude scales are not homogenized.',
      'Gutenberg–Richter beta is estimated on training magnitudes with a 0.1 magnitude-bin correction. Branching ratio is constrained below 0.98 under this magnitude model.',
      'Finite conditioning history, region boundaries and catalog revisions can bias parameters. No parameter uncertainty intervals are currently estimated.',
      'Training likelihood improvement is not out-of-sample skill. The holdout uses frozen parameters and sequentially revealed events.',
      'Exploratory manual region/threshold selection can contaminate a holdout. This experiment is not prospectively registered.'
    ]
  };
}

export function evaluateTemporalETAS(model,events,holdoutEnd){
  const {options:o,parameters:p}=model;
  if(!Number.isFinite(holdoutEnd)||holdoutEnd<=o.end||holdoutEnd-o.end>30*DAY)throw new Error('Choose a holdout of 1–30 days after training');
  const history=prepareRegional(events,{...o,end:holdoutEnd}),a=(o.end-o.start)/DAY,b=(holdoutEnd-o.start)/DAY;
  const outcomes=history.filter(e=>e.t>a),ll=logLikelihood(history,a,b,p,o.minMagnitude),rate=model.fit.poissonRate;
  const baseline=outcomes.length*Math.log(rate)-rate*(b-a);
  return {start:o.end,end:holdoutEnd,events:outcomes.length,eventIds:outcomes.map(e=>e.id),logLikelihood:ll,poissonLogLikelihood:baseline,informationGainNats:ll-baseline,bitsPerEvent:outcomes.length?(ll-baseline)/outcomes.length/Math.LN2:null,method:'Prequential temporal log likelihood: parameters frozen at training end; each observed holdout event can trigger only later holdout events. Comparator: training-fitted constant Poisson rate.'};
}

export function projectTemporalETAS(model,events,horizonDays=10){
  const {options:o,parameters:p}=model,history=prepareRegional(events,o),cutoff=(o.end-o.start)/DAY;
  return {horizonDays,points:Array.from({length:101},(_,i)=>({time:o.end+i*horizonDays*DAY/100,rate:intensity(cutoff+i*horizonDays/100+1e-9,history,p,o.minMagnitude)})),backgroundRate:p.mu,integratedDirectIntensity:compensator(cutoff,cutoff+horizonDays,history,p,o.minMagnitude),method:'Conditional rate from background and parents observed by the cutoff. New future parents are excluded; this is not the expected total including all future cascades or a calibrated earthquake probability.'};
}
