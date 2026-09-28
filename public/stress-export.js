import {stressPosition,ruptureCorners} from './stress-geometry.js';
import {stressGrid,stressDifference} from './stress-grid.js';
export function stressGeoJSON(source,record,projection,baseline=null){
  if(record.sourceId!==source.id||projection.sourceId!==source.id||projection.sourceHash!==source.receipt.sha256||!projection.validation.supported||projection.validation.earthRadiusKm!==6371.0088)throw new Error('Verified geographic source linkage is required');
  const report=baseline?stressDifference(record,baseline):stressGrid(record).report;
  return {type:'FeatureCollection',metadata:{schema:'seismosphere.stress-geojson.v1',sourceId:source.id,sourceHash:source.receipt.sha256,resultId:record.id,baselineId:baseline?.id??null,projectionId:projection.id,projectionValidation:projection.validation,options:record.options,baselineOptions:baseline?.options??null,valueMode:baseline?'current-minus-baseline':'current',units:'Pa',policy:'Static model samples, not observations or earthquake probabilities. Longitude/latitude use the companion-checked spherical mapping; no ellipsoidal datum transformation. Depth is source-model km, not GeoJSON ellipsoidal height. Masked samples retain null values. No interpolation, color clipping or visual depth exaggeration.'},features:report.points.map((point,i)=>{
    const p=stressPosition(source.model.origin,point),radius=Math.hypot(...p),v=report.values[i];
    if(v&&![v.coulombPa,v.shearPa,v.unclampingPa].every(Number.isFinite))throw new Error('Non-finite stress value');
    return {type:'Feature',id:i+1,geometry:{type:'Point',coordinates:[Math.atan2(-p[2],p[0])*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,p[1]/radius)))*180/Math.PI]},properties:{sample:i+1,eastKm:point.xKm,northKm:point.yKm,depthKm:point.depthKm,masked:!v,coulombPa:v?.coulombPa??null,shearPa:v?.shearPa??null,unclampingPa:v?.unclampingPa??null}};
  })};
}

export function ruptureOBJ(source){
  if(!source?.id||!source.receipt?.sha256||!source.model?.patches?.length)throw new Error('An archived rupture source is required');
  const lines=['# SeismoSphere published rupture geometry', '# Local Cartesian coordinates in kilometres: X east, Y north, Z up (negative source depth).', '# No visual exaggeration, geographic transformation or stress values. Not a forecast.', '# source '+JSON.stringify({id:source.id,sha256:source.receipt.sha256,origin:source.model.origin})];
  source.model.patches.forEach((patch,i)=>{
    const corners=ruptureCorners(patch),offset=i*4+1;
    lines.push('o patch_'+(i+1),'# parameters '+JSON.stringify(patch));
    for(const p of corners)lines.push(`v ${p.xKm} ${p.yKm} ${-p.depthKm}`);
    lines.push(`f ${offset} ${offset+1} ${offset+2}`,`f ${offset} ${offset+2} ${offset+3}`);
  });
  return lines.join('\n')+'\n';
}
