// Reorder for display only; archived point order and result identity stay intact.
export function stressGrid(record){
  const report=record.report,points=report.points,values=report.values,n=Math.sqrt(points.length);
  if(!Number.isInteger(n)||n<2||values.length!==points.length)throw new Error('This saved sampling set is not a square grid; use its JSON export');
  const xs=[...new Set(points.map(p=>p.xKm))].sort((a,b)=>a-b),ys=[...new Set(points.map(p=>p.yKm))].sort((a,b)=>b-a),depth=points[0].depthKm;
  if(xs.length!==n||ys.length!==n||points.some(p=>![p.xKm,p.yKm,p.depthKm].every(Number.isFinite)||p.depthKm!==depth))throw new Error('Saved grid coordinates are irregular');
  const width=xs.at(-1)-xs[0],height=ys[0]-ys.at(-1),step=width/(n-1),close=(a,b)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
  if(width<=0||!close(width,height)||xs.some((x,i)=>!close(x,xs[0]+i*step))||ys.some((y,i)=>!close(y,ys[0]-i*step)))throw new Error('Saved grid spacing is irregular');
  const cells=new Map(points.map((p,i)=>[`${p.xKm},${p.yKm}`,i]));if(cells.size!==points.length)throw new Error('Saved grid has duplicate samples');
  const order=ys.flatMap(y=>xs.map(x=>cells.get(`${x},${y}`)));if(order.some(i=>i===undefined))throw new Error('Saved grid has missing samples');
  return {grid:{n,depth,east:(xs[0]+xs.at(-1))/2,north:(ys[0]+ys.at(-1))/2,extent:width/2},report:{...report,points:order.map(i=>points[i]),values:order.map(i=>values[i])}};
}

// A difference is meaningful only for the same source and exact sample locations.
export function stressDifference(current,baseline){
  if(current.sourceId!==baseline.sourceId)throw new Error('Compare calculations from the same archived source');
  const a=stressGrid(current).report,b=stressGrid(baseline).report;
  if(a.points.length!==b.points.length||a.points.some((p,i)=>['xKm','yKm','depthKm'].some(k=>p[k]!==b.points[i][k])))throw new Error('Comparison requires identical sampling locations and depth');
  const values=a.values.map((v,i)=>{
    const other=b.values[i];if(!v||!other)return null;
    const delta={};for(const key of ['coulombPa','shearPa','unclampingPa']){
      if(!Number.isFinite(v[key])||!Number.isFinite(other[key]))throw new Error('Comparison contains invalid stress values');
      delta[key]=v[key]-other[key];
    }return delta;
  });
  return {...a,values,excludedCount:values.filter(v=>!v).length};
}
