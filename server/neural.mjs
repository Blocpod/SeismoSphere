import {nearestBoundary} from './boundary-context.mjs';
import {analogueEvents} from './catalog.mjs';
import {distance,midpoint,DAY} from './geo.mjs';
import {routeWalks} from './routes.mjs';
import {hash} from './store.mjs';
const MODEL='nomic-embed-text:latest';
export function fingerprint(source,events,network=null,boundaries=null,boundaryCache=new Map()){
  const context=events.filter(e=>e.id!==source.id&&e.time<=source.time&&e.time>=source.time-10*DAY&&distance(source,e)<=3500);
  const neighbors=[...context].sort((a,b)=>b.mag-a.mag||a.id.localeCompare(b.id)).slice(0,7).sort((a,b)=>a.time-b.time);
  const nodes=[...neighbors,source];
  const text=['Seismic sequence graph. Trigger magnitude '+source.mag.toFixed(1)+', depth '+Math.round(source.depth/25)*25+' km.'];
  nodes.forEach((e,i)=>text.push(`Node ${i}: magnitude offset ${(e.mag-source.mag).toFixed(1)}, depth ${Math.round(e.depth/25)*25} km, time ${((e.time-source.time)/DAY).toFixed(1)} days, source distance ${Math.round(distance(e,source)/100)*100} km.`));
  const edges=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const d=Math.round(distance(nodes[i],nodes[j])/100)*100;edges.push([i,j,d]);}
  text.push('Pair distances in km: '+edges.map(([a,b,d])=>`${a}-${b}:${d}`).join(', '));
  const midpointStructure=[];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const span=distance(nodes[i],nodes[j]);if(span<500||span>3500)continue;
    const center=midpoint(nodes[i],nodes[j]),support=[...context,source].filter(e=>e.id!==nodes[i].id&&e.id!==nodes[j].id&&distance(e,center)<=200);
    midpointStructure.push({endpoints:[i,j],spanKm:span,center,supportIds:support.map(e=>e.id)});
  }
  const local=context.filter(e=>distance(source,e)<=400),early=local.filter(e=>e.time<source.time-5*DAY),late=local.filter(e=>e.time>=source.time-5*DAY),meanDepth=a=>a.length?a.reduce((n,e)=>n+e.depth,0)/a.length:null;
  const activity={radiusKm:400,windowDays:10,earlyIds:early.map(e=>e.id),lateIds:late.map(e=>e.id),earlyPerDay:early.length/5,latePerDay:late.length/5,depthChangeKm:early.length&&late.length?meanDepth(late)-meanDepth(early):null};
  text.push('Geodesic midpoint support within 200 km, endpoint pairs 500–3500 km apart: '+(midpointStructure.map(m=>`${m.endpoints.join('-')}:${m.supportIds.length} other prior events`).join(', ')||'no eligible pairs')+'. Absence of catalog support is not proven seismic silence.');
  text.push(`Local activity within 400 km before trigger: earlier five days ${early.length} events, later five days ${late.length} events. Mean depth change ${activity.depthChangeKm===null?'unavailable':activity.depthChangeKm.toFixed(1)+' km (positive deeper)'}. Descriptive catalog counts, not a fitted swarm or completeness-corrected rate.`);
  const routeContext={version:network?.version??null,createdAt:network?.createdAt??null,retrospective:!!network&&network.createdAt>source.time,nodes:[]};
  if(network){
    for(let i=0;i<nodes.length;i++){
      const walks=routeWalks(network,nodes[i]);
      const routes=[...new Map(walks.map(w=>[w.route.id,w.route])).values()];
      const reached=nodes.flatMap((e,j)=>j===i?[]:walks.filter(w=>distance(w.center,e)<=network.captureKm).map(w=>({node:j,hops:w.hops,reflected:w.reflected,routeIds:w.routeIds})));
      routeContext.nodes.push({node:i,routes:routes.map(r=>({id:r.id,kind:r.kind,direction:r.direction,next:r.next,termination:r.termination,provenance:r.provenance})),reached});
      text.push(`Configured route node ${i}: ${walks.length} bounded walks, ${walks.filter(w=>w.reflected).length} reflected; reachable graph nodes ${reached.map(r=>`${r.node} at ${r.hops} hops${r.reflected?' reflected':''}`).join(', ')||'none'}; corridor kinds ${[...new Set(routes.map(r=>r.kind))].sort().join(', ')||'none'}; ${routes.filter(r=>r.termination).length} terminal routes, ${routes.reduce((n,r)=>n+r.next.length,0)} explicit outgoing links. Research hypothesis geometry, not measured transfer.`);
    }
  }else text.push('Configured route context unavailable at the analysis cutoff.');
  const boundaryContext=nodes.map((e,node)=>{
    if(!boundaryCache.has(e.id))boundaryCache.set(e.id,boundaries?nearestBoundary(e,boundaries.steps):null);
    const nearest=boundaryCache.get(e.id);
    text.push(`Tectonic reference node ${node}: ${nearest?nearest.label+', '+Math.round(nearest.distanceKm/25)*25+' km to nearest bounded PB2002 step':'classification unavailable'}. Static reference geometry, not causal association.`);
    return {node,...nearest};
  });
  return {version:'relative-sequence-graph-4',text:text.join('\n'),nodeIds:nodes.map(e=>e.id),nodeCount:nodes.length,edges,midpointStructure,activity,routeContext,boundaryContext};
}
function vectorNorm(v){if(!Array.isArray(v)||!v.length||v.some(n=>!Number.isFinite(n)))return null;const squared=v.reduce((s,n)=>s+n*n,0);return squared>0&&Number.isFinite(squared)?Math.sqrt(squared):null;}
function cosine(a,b){const aa=vectorNorm(a),bb=vectorNorm(b);if(!aa||!bb||a.length!==b.length)throw new Error('Incompatible local embedding vectors');let dot=0;for(let i=0;i<a.length;i++)dot+=(a[i]/aa)*(b[i]/bb);return Math.max(-1,Math.min(1,dot));}
async function embed(texts){
  const r=await fetch('http://127.0.0.1:11434/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:texts,truncate:false,keep_alive:'5m'}),signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw new Error(`Local embedding model returned HTTP ${r.status}: ${(await r.text()).slice(0,150)}`);
  const j=await r.json();if(!Array.isArray(j.embeddings)||j.embeddings.length!==texts.length||j.embeddings.some(v=>!vectorNorm(v)))throw new Error('Invalid local embedding response: expected finite, nonzero vectors');return j.embeddings;
}
export async function neuralAnalogues(source,events,asOf,store,{windowDays=10,radiusKm=400,network=null,boundaries=null}={}){
  const catalog=analogueEvents(source,events,asOf);
  const pool=catalog.filter(e=>e.time<source.time-30*DAY&&e.time+windowDays*DAY<asOf&&Math.abs(e.mag-source.mag)<1&&Math.abs(e.depth-source.depth)<200).sort((a,b)=>Math.abs(a.mag-source.mag)+Math.abs(a.depth-source.depth)/200-Math.abs(b.mag-source.mag)-Math.abs(b.depth-source.depth)/200||b.time-a.time).slice(0,160);
  if(!pool.length)return {model:MODEL,matches:[],searched:0,method:'No eligible completed historical sequences in this imported catalog.'};
  const tags=await(await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(4000)})).json();const digest=tags.models?.find(m=>m.name===MODEL)?.digest;if(!digest)throw new Error('Install nomic-embed-text in Ollama to enable neural sequence search');
  const boundaryCache=new Map();
  const graphs=[source,...pool].map(e=>({source:e,...fingerprint(e,catalog,network,boundaries,boundaryCache)}));
  for(const g of graphs){g.cacheKey='embedding:'+hash({model:MODEL,digest,text:g.text,version:g.version});g.vector=store.get(g.cacheKey);if(!vectorNorm(g.vector))g.vector=null;}
  // A mixed-width cache cannot identify which entry is correct; rebuild this bounded search.
  if(new Set(graphs.filter(g=>g.vector).map(g=>g.vector.length)).size>1)for(const g of graphs)g.vector=null;
  let dimensions=graphs.find(g=>g.vector)?.vector.length;
  const missing=graphs.filter(g=>!g.vector);
  for(let i=0;i<missing.length;i+=16){const batch=missing.slice(i,i+16);const vectors=await embed(batch.map(g=>'search_document: '+g.text));dimensions??=vectors[0].length;if(vectors.some(v=>v.length!==dimensions))throw new Error('Incompatible local embedding dimensions; no similarity results were produced');for(let n=0;n<batch.length;n++){batch[n].vector=vectors[n];store.set(batch[n].cacheKey,vectors[n]);}}
  const q=graphs[0];
  const matches=graphs.slice(1).map(g=>({source:g.source,similarity:cosine(q.vector,g.vector),nodeIds:g.nodeIds,nodeCount:g.nodeCount,graph:g.text,midpointStructure:g.midpointStructure,activity:g.activity,routeContext:g.routeContext,boundaryContext:g.boundaryContext})).sort((a,b)=>b.similarity-a.similarity).slice(0,12);
  for(const match of matches){const outcomes=catalog.filter(e=>e.time>match.source.time&&e.time<=match.source.time+windowDays*DAY&&distance(e,match.source)<=radiusKm&&e.mag>=source.mag-1);match.followUps=outcomes.length;match.largest=outcomes.length?Math.max(...outcomes.map(e=>e.mag)):null;}
  return {model:MODEL,modelDigest:digest,windowDays,radiusKm,searched:pool.length,indexed:missing.length,graphVersion:q.version,queryGraph:q.text,queryFeatures:{nodeIds:q.nodeIds,midpointStructure:q.midpointStructure,activity:q.activity,routeContext:q.routeContext,boundaryContext:q.boundaryContext},routeNetwork:network,boundaryReference:boundaries?.provenance??null,matches,method:'Local neural embeddings of relative event-sequence graphs, ranked by cosine similarity. This pretrained text embedding model is not a trained seismic GNN and its similarity is not predictive probability. Encodes preceding midpoint support and local five-day activity/depth changes. These summaries are not fitted swarm classifications. Configured directed route walks, explicit links and reflection are encoded using one network frozen at the analysis cutoff, applied retrospectively to older sequences; this is not proof those routes were known at each historical trigger. Route kinds are hypotheses, not tectonic boundary types. Tectonic type and nearest-step distance use the pinned static PB2002 reference, including for historical events; they do not identify the causative fault or imply contemporary source availability. Outcomes are excluded from graph encoding.',cutoff:asOf};
}
