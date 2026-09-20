import {distance,DAY} from './geo.mjs';
import {hash} from './store.mjs';
const MODEL='nomic-embed-text:latest';
export function fingerprint(source,events){
  const neighbors=events.filter(e=>e.id!==source.id&&e.time<=source.time&&e.time>=source.time-10*DAY&&distance(source,e)<=3500).sort((a,b)=>b.mag-a.mag||a.id.localeCompare(b.id)).slice(0,7).sort((a,b)=>a.time-b.time);
  const nodes=[...neighbors,source];
  const text=['Seismic sequence graph. Trigger magnitude '+source.mag.toFixed(1)+', depth '+Math.round(source.depth/25)*25+' km.'];
  nodes.forEach((e,i)=>text.push(`Node ${i}: magnitude offset ${(e.mag-source.mag).toFixed(1)}, depth ${Math.round(e.depth/25)*25} km, time ${((e.time-source.time)/DAY).toFixed(1)} days, source distance ${Math.round(distance(e,source)/100)*100} km.`));
  const edges=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const d=Math.round(distance(nodes[i],nodes[j])/100)*100;edges.push([i,j,d]);}
  text.push('Pair distances in km: '+edges.map(([a,b,d])=>`${a}-${b}:${d}`).join(', '));
  return {version:'relative-sequence-graph-1',text:text.join('\n'),nodeIds:nodes.map(e=>e.id),nodeCount:nodes.length,edges};
}
function cosine(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;}return dot/Math.max(1e-12,Math.sqrt(aa*bb));}
async function embed(texts){
  const r=await fetch('http://127.0.0.1:11434/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:texts,truncate:false,keep_alive:'5m'}),signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw new Error(`Local embedding model returned HTTP ${r.status}: ${(await r.text()).slice(0,150)}`);
  const j=await r.json();if(!Array.isArray(j.embeddings)||j.embeddings.length!==texts.length||j.embeddings.some(v=>!Array.isArray(v)||!v.length||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid embedding response');return j.embeddings;
}
export async function neuralAnalogues(source,events,asOf,store,{windowDays=10,radiusKm=400}={}){
  const catalog=events.filter(e=>e.time<=asOf&&e.provider===source.provider&&e.type==='earthquake');
  const pool=catalog.filter(e=>e.time<source.time-30*DAY&&e.time+windowDays*DAY<asOf&&Math.abs(e.mag-source.mag)<1&&Math.abs(e.depth-source.depth)<200).sort((a,b)=>Math.abs(a.mag-source.mag)+Math.abs(a.depth-source.depth)/200-Math.abs(b.mag-source.mag)-Math.abs(b.depth-source.depth)/200||b.time-a.time).slice(0,160);
  if(!pool.length)return {model:MODEL,matches:[],searched:0,method:'No eligible completed historical sequences in this imported catalog.'};
  const tags=await(await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(4000)})).json();const digest=tags.models?.find(m=>m.name===MODEL)?.digest;if(!digest)throw new Error('Install nomic-embed-text in Ollama to enable neural sequence search');
  const graphs=[source,...pool].map(e=>({source:e,...fingerprint(e,catalog)}));
  for(const g of graphs){g.cacheKey='embedding:'+hash({model:MODEL,digest,text:g.text,version:g.version});g.vector=store.get(g.cacheKey);}
  const missing=graphs.filter(g=>!g.vector);
  for(let i=0;i<missing.length;i+=16){const batch=missing.slice(i,i+16);const vectors=await embed(batch.map(g=>'search_document: '+g.text));for(let n=0;n<batch.length;n++){batch[n].vector=vectors[n];store.set(batch[n].cacheKey,vectors[n]);}}
  const q=graphs[0];
  const matches=graphs.slice(1).map(g=>({source:g.source,similarity:cosine(q.vector,g.vector),nodeIds:g.nodeIds,nodeCount:g.nodeCount,graph:g.text})).sort((a,b)=>b.similarity-a.similarity).slice(0,12);
  for(const match of matches){const outcomes=catalog.filter(e=>e.time>match.source.time&&e.time<=match.source.time+windowDays*DAY&&distance(e,match.source)<=radiusKm&&e.mag>=source.mag-1);match.followUps=outcomes.length;match.largest=outcomes.length?Math.max(...outcomes.map(e=>e.mag)):null;}
  return {model:MODEL,modelDigest:digest,searched:pool.length,indexed:missing.length,queryGraph:q.text,matches,method:'Local neural embeddings of relative event-sequence graphs, ranked by cosine similarity. This pretrained text embedding model is not a trained seismic GNN and its similarity is not predictive probability. Outcomes are excluded from graph encoding.',cutoff:asOf};
}
