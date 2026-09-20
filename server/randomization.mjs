import {createHash} from 'node:crypto';
import {backtest,VERSION as ENGINE_VERSION,validateConfig} from './engine.mjs';
import {DAY} from './geo.mjs';
import {hash} from './store.mjs';
export const RANDOMIZATION_VERSION='catalog-time-permutation-1';
export function randomizationOptions(input,now=Date.now()){
  const o={start:typeof input.start==='number'?input.start:Date.parse(input.start),end:typeof input.end==='number'?input.end:Date.parse(input.end),stepDays:Number(input.stepDays??5),replicates:Number(input.replicates??99),seed:Number(input.seed??71),blockDays:Number(input.blockDays??7)};
  if(!Object.values(o).every(Number.isFinite)||o.start<Date.UTC(1900,0,1)||o.end>now||o.start>=o.end||o.end-o.start>90*DAY||!Number.isInteger(o.stepDays)||o.stepDays<1||o.stepDays>30||!Number.isInteger(o.replicates)||o.replicates<19||o.replicates>999||!Number.isInteger(o.seed)||o.seed<0||o.seed>0xffffffff||!Number.isInteger(o.blockDays)||o.blockDays<0||o.blockDays>90)throw new Error('Use elapsed dates spanning at most 90 days, step 1–30 days, 19–999 replicates, integer seed 0–4294967295 and block size 0–90 days.');
  return o;
}
// Counter-based SHA-256 draws, with rejection to avoid modulo bias in Fisher–Yates.
function randomInteger(seed,replicate){let counter=0,bytes=Buffer.alloc(0),offset=0;return n=>{const limit=Math.floor(4294967296/n)*n;for(;;){if(offset>=bytes.length){bytes=createHash('sha256').update(`${RANDOMIZATION_VERSION}:${seed}:${replicate}:${counter++}`).digest();offset=0;}const x=bytes.readUInt32BE(offset);offset+=4;if(x<limit)return x%n;}};}
export function randomizedCatalog(events,options,config,replicate){
  const begin=options.start-config.lookbackDays*DAY,groups=new Map(),out=events.map(e=>({...e})),draw=randomInteger(options.seed,replicate);
  for(let i=0;i<events.length;i++){const e=events[i];if(e.time<begin||e.time>options.end)continue;const group=options.blockDays?Math.floor((e.time-begin)/(options.blockDays*DAY)):0;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(i);}
  for(const indices of groups.values()){const times=indices.map(i=>events[i].time);for(let i=times.length-1;i>0;i--){const j=draw(i+1);[times[i],times[j]]=[times[j],times[i]];}indices.forEach((index,i)=>{out[index]={...events[index],time:times[i],synthetic:true,originalTime:events[index].time};});}
  return out.sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id));
}
export function scoreCatalog(events,options,config,routes,boundaries,compute=backtest){
  const result=compute(events,options.start,options.end,config,routes,boundaries,options.stepDays),steps=Math.floor((options.end-options.start-config.windowDays*DAY)/(options.stepDays*DAY))+1,ds=result.summary.find(s=>s.engine==='DS'),recent=result.summary.find(s=>s.engine==='Recent-rate');
  return {summary:result.summary,issuanceSteps:steps,extraHitsPerIssuance:(ds.hits-recent.hits)/steps,hitFractionDifference:ds.precision===null?null:ds.precision-recent.precision,forecastDigest:hash(result.trials)};
}
const quantile=(a,p)=>{const i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);};
export function randomizationSummary(observed,replicates){
  const scores=replicates.map(r=>r.extraHitsPerIssuance).sort((a,b)=>a-b),n=scores.length,b=scores.filter(s=>s>=observed.extraHitsPerIssuance).length,p=b/n,z=1.959963984540054,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  if(!n)throw new Error('Completed randomizations are required.');
  return {statistic:'(DS hits − matched recent-rate hits) / issuance steps; larger favors DS',observed:observed.extraHitsPerIssuance,replicates:n,atLeastObserved:b,monteCarloTail:(b+1)/(n+1),minimumTail:1/(n+1),simulationTailEstimate:p,simulationTailWilson95:[Math.max(0,center-half),Math.min(1,center+half)],randomizedRange95:[quantile(scores,.025),quantile(scores,.975)],randomizedMedian:quantile(scores,.5),randomizedMean:scores.reduce((a,b)=>a+b,0)/n};
}
export function randomizationInput(events,options,config){
  validateConfig(config);if(options.end-options.start<config.windowDays*DAY)throw new Error('The interval must contain at least one complete forecast window.');
  const selected=events.filter(e=>e.time<=options.end&&e.type==='earthquake'&&e.status!=='deleted'&&(!e.provider||e.provider===config.catalogProvider)).sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id));
  if(!selected.length||selected.length>100000)throw new Error('Use a catalog with 1–100,000 eligible earthquakes.');
  if(!selected.some(e=>e.time>=options.start-config.lookbackDays*DAY))throw new Error('The randomization interval has no catalog events.');return selected;
}
export function randomizationReport(input,observed,replicates){
  if(replicates.length!==input.options.replicates)throw new Error('The requested replicate count is incomplete.');
  return {version:RANDOMIZATION_VERSION,engineVersion:ENGINE_VERSION,options:input.options,inputSnapshotId:input.inputSnapshotId,provider:input.config.catalogProvider,observed,replicates,comparison:randomizationSummary(observed,replicates),
    method:'Regenerate DS and both matched baselines for the observed catalog and every time-permuted catalog. Only synthetic event times at or before each issuance enter generation. Score the full forecast envelopes; partial hits are not counted as hits.',
    nullHypothesis:input.options.blockDays?`Event times are exchangeable within fixed ${input.options.blockDays}-day blocks, anchored at the conditioning start. Joint location, depth, magnitude and event identity are retained; exact time counts per block are retained.`:'Event times are exchangeable throughout the conditioning and evaluation interval. Joint location, depth, magnitude and event identity, and the exact collection of timestamps, are retained.',
    limitations:['Time permutation breaks space-time aftershock association within the chosen blocks. This null is not a complete physical or ETAS seismicity model.','A small Monte Carlo tail is conditional on the exchangeability assumption; it does not prove prospective skill, physical pressure transfer or earthquake probability.','Forecasts are regenerated in every catalog. Overlapping forecasts remain together in each replicate; they are not treated as independent Bernoulli trials.','The primary statistic compares DS with the matched recent-rate control; zero-forecast steps contribute zero extra hits.','The randomized 95% range describes the null distribution. The Wilson interval describes Monte Carlo sampling uncertainty only, not uncertainty in real-world forecast skill.','Frozen settings prevent changes within this run, but searching many intervals, seeds, blocks or rules requires separate multiple-testing control and prospective validation.','Revised catalog data include later corrections. Imported pre-conditioning history stays fixed and can be incomplete; magnitude completeness and measurement uncertainties are not solved by randomization.','Seeded SHA-256 counter streams and unbiased Fisher–Yates swaps are reproducible. Replicate catalogs and forecast digests can be reconstructed from the exported inputs.']};
}
export function randomizationContext(report,asOf,mode='catalog-replay'){
  if(!Number.isFinite(asOf)||!['strict','catalog-replay'].includes(mode))throw new Error('Choose a valid analysis time and replay mode.');
  if(asOf<report.options.end)throw new Error('Randomization outcomes extend beyond this cutoff.');if(mode==='strict'&&report.createdAt>asOf)throw new Error('This run was unavailable at the strict observation cutoff.');
  return {id:report.id,version:report.version,createdAt:report.createdAt,options:report.options,provider:report.provider,observed:report.observed,comparison:report.comparison,method:report.method,nullHypothesis:report.nullHypothesis,limitations:report.limitations};
}
