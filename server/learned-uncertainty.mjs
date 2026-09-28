import {createHash} from 'node:crypto';
import {hash} from './store.mjs';
const WEEK=7*86400000;
export const UNCERTAINTY_VERSION='paired-week-blocks-1';
// Fixed sensitivity choices; never select a block length from favorable endpoints.
export function learnedUncertainty(report){
 const windows=report.testWindows;
 if(!Array.isArray(windows)||windows.length<26)throw new Error('At least 26 saved test weeks are required');
 const pairs=[['graph','noNeighbors'],...(windows[0].ensemble?[['ensemble','graph'],['ensemble','recentRate']]:[])];
 const weekly=windows.map((w,i)=>{
  if(w.end-w.cutoff!==WEEK||(i&&w.cutoff!==windows[i-1].end))throw new Error('Test weeks must be consecutive and nonoverlapping');
  if(!Array.isArray(w.observed)||w.observed.length!==72||w.observed.some(y=>!Number.isInteger(y)||y<0))throw new Error('Expected 72 nonnegative integer observed counts');
  for(const name of new Set(pairs.flat()))if(!Array.isArray(w[name])||w[name].length!==72||w[name].some(v=>!Number.isFinite(v)||v<=0))throw new Error('Expected 72 positive finite model counts');
  return {events:w.observed.reduce((a,b)=>a+b,0),differences:pairs.map(([a,b])=>w.observed.reduce((sum,y,k)=>sum+y*(Math.log(w[a][k])-Math.log(w[b][k]))-w[a][k]+w[b][k],0))};
 });
 const totalEvents=weekly.reduce((s,w)=>s+w.events,0);if(!totalEvents)throw new Error('No observed test events');
 const replicates=2000,seed=20260928,n=weekly.length;
 const quantile=(a,p)=>{const x=(a.length-1)*p,l=Math.floor(x);return a[l]+(a[Math.ceil(x)]-a[l])*(x-l);};
 const blocks=[1,4,13].map(blockWeeks=>{
  const samples=pairs.map(()=>[]);let emptyReplicates=0;
  for(let r=0;r<replicates;r++){
   let events=0,used=0,counter=0;const sums=pairs.map(()=>0);
   while(used<n){
    // Rejection sampling avoids modulo bias; wrap preserves equal start eligibility.
    let start;do{start=createHash('sha256').update(`${UNCERTAINTY_VERSION}:${seed}:${blockWeeks}:${r}:${counter++}`).digest().readUInt32BE(0);}while(start>=Math.floor(4294967296/n)*n);start%=n;
    for(let j=0;j<blockWeeks&&used<n;j++,used++){const w=weekly[(start+j)%n];events+=w.events;w.differences.forEach((d,k)=>sums[k]+=d);}
   }
   if(!events){emptyReplicates++;continue;}
   sums.forEach((sum,k)=>samples[k].push(sum/(events*Math.LN2)));
  }
  return {blockWeeks,emptyReplicates,comparisons:pairs.map(([model,reference],k)=>{samples[k].sort((a,b)=>a-b);return {model,reference,bitsPerEvent:weekly.reduce((s,w)=>s+w.differences[k],0)/(totalEvents*Math.LN2),lower:samples[k].length?quantile(samples[k],.025):null,upper:samples[k].length?quantile(samples[k],.975):null,validReplicates:samples[k].length};})};
 });
 return {version:UNCERTAINTY_VERSION,runId:report.id,weightsSha256:report.weightsSha256,testWindowsSha256:hash(windows),seed,replicates,weeks:n,events:totalEvents,start:windows[0].cutoff,end:windows.at(-1).end,blocks,method:'Paired circular moving-block bootstrap; all 72 cells and competing models stay together within each sampled week. Percentile endpoints at 2.5% and 97.5%; linear interpolation.',units:'Log-likelihood difference in bits per observed event; positive favors the first model.',limitations:['Conditional on frozen fits, selected weights and this revised catalog; training and selection uncertainty are excluded.','One-week blocks ignore serial dependence; four- and thirteen-week blocks are sensitivity choices, not validated dependence lengths. Circular wrapping joins the final week to the first.','Stationarity and sufficient decay of temporal dependence are assumptions, not established properties. Missing events and magnitude errors are excluded.','Exploratory historical intervals, not p-values, multiplicity-adjusted tests, calibrated earthquake probabilities or evidence of prospective skill.'],reference:'https://stat.cmu.edu/~cshalizi/uADA/16/lectures/26.pdf'};
}
