export function prospectiveCountLeaderboard(records){
 const cohorts=new Map();
 for(const r of records){
  let c=cohorts.get(r.cohort);if(!c){c={id:r.cohort,parentRunId:r.parentRunId,issued:0,scored:0,pending:0,excluded:{},forecastIds:[],assessmentIds:[],models:{},windows:[]};cohorts.set(r.cohort,c);}
  c.issued++;c.forecastIds.push(r.id);const a=r.assessment;
  if(!a){if(r.assessmentDueAt)c.pending++;else c.excluded.LEGACY_NO_ASSESSMENT=(c.excluded.LEGACY_NO_ASSESSMENT??0)+1;continue;}
  if(a.status!=='SCORED'){c.excluded[a.status]=(c.excluded[a.status]??0)+1;continue;}
  const names=Object.keys(a.scores??{}).sort();if(names.join(',')!=='ensemble,graph,noNeighbors,recentRate,tectonic,trainingMean')throw new Error('Incomplete six-model assessment');
  const events=a.scores.graph.events;
  if(!Number.isInteger(events)||events<0||names.some(n=>a.scores[n].events!==events||!['logLikelihood','meanAbsoluteError','expectedCount'].every(k=>Number.isFinite(a.scores[n][k]))))throw new Error('Incompatible count assessment scores');
  c.scored++;c.assessmentIds.push(a.id);c.windows.push([r.issuedAt,r.validUntil]);
  for(const name of names){const s=a.scores[name],total=c.models[name]??={name,logLikelihood:0,meanAbsoluteError:0,expectedCount:0,events:0};for(const key of ['logLikelihood','meanAbsoluteError','expectedCount','events'])total[key]+=s[key];}
 }
 return [...cohorts.values()].map(c=>{
  c.windows.sort((a,b)=>a[0]-b[0]);let end=-Infinity,overlap=false;for(const [start,until]of c.windows){if(start<end)overlap=true;end=Math.max(end,until);}
  const reference=c.models.trainingMean?.logLikelihood;c.ranking=Object.values(c.models).map(s=>({...s,meanAbsoluteError:s.meanAbsoluteError/c.scored,bitsPerEventVsTrainingMean:s.events?(s.logLikelihood-reference)/(s.events*Math.LN2):null})).sort((a,b)=>b.logLikelihood-a.logLikelihood||a.name.localeCompare(b.name));
  delete c.models;delete c.windows;return {...c,overlappingWindows:overlap,interpretation:'Same completed windows for all six models. Event totals count event-window occurrences, not unique earthquakes. Manual selection, overlapping windows and aftershocks limit interpretation; no independence, significance or calibrated probability claim.'};
 });
}
