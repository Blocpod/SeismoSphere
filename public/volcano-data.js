import {nearestOnSegment} from './fault-geometry.js';
const optionalNumber=v=>v===null||v===undefined||v===''?null:Number.isFinite(v)?v:NaN;
export function normalizeVolcanoes(data){
  if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length||data.features.length>10000)throw new Error('Invalid volcano feature collection');
  if(!/4326$/.test(data.crs?.properties?.name??''))throw new Error('Volcano coordinates must use EPSG:4326');
  for(const key of ['totalFeatures','numberMatched','numberReturned'])if(data[key]!==undefined&&data[key]!==data.features.length)throw new Error('Incomplete volcano WFS response');
  const volcanoes=data.features.map(f=>{
    const p=f.properties,c=f.geometry?.coordinates;if(f.geometry?.type!=='Point'||!Array.isArray(c)||!p||!Number.isInteger(p.Volcano_Number)||p.Volcano_Number<100000||p.Volcano_Number>999999||typeof p.Volcano_Name!=='string'||!p.Volcano_Name.trim())throw new Error('Invalid volcano identity or geometry');
    const [lon,lat]=c;if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||Math.abs(lat-p.Latitude)>1e-7||Math.abs(lon-p.Longitude)>1e-7||!Number.isFinite(p.Latitude)||!Number.isFinite(p.Longitude))throw new Error('Invalid or inconsistent volcano coordinates');
    const elevationM=optionalNumber(p.Elevation),lastEruptionYear=optionalNumber(p.Last_Eruption_Year);if(elevationM!==null&&(!Number.isFinite(elevationM)||elevationM< -12000||elevationM>10000)||lastEruptionYear!==null&&(!Number.isInteger(lastEruptionYear)||lastEruptionYear< -20000||lastEruptionYear>9999))throw new Error('Invalid volcano elevation or eruption year');
    if(p.Geologic_Epoch!=='Holocene')throw new Error('Unexpected volcano epoch in Holocene collection');
    return {id:'GVP:'+p.Volcano_Number,number:p.Volcano_Number,name:p.Volcano_Name,lat,lon,elevationM,lastEruptionYear,country:p.Country??null,region:p.Region??null,subregion:p.Subregion??null,landform:p.Volcanic_Landform??null,type:p.Primary_Volcano_Type??null,tectonicSetting:p.Tectonic_Setting??null,evidenceCategory:p.Evidence_Category??null,epoch:p.Geologic_Epoch,sourceProperties:Object.fromEntries(Object.keys(p).sort().map(k=>[k,p[k]])),url:'https://volcano.si.edu/volcano.cfm?vn='+p.Volcano_Number};
  }).sort((a,b)=>a.number-b.number);
  if(new Set(volcanoes.map(v=>v.id)).size!==volcanoes.length)throw new Error('Duplicate GVP volcano number');return volcanoes;
}
export function nearbyVolcanoes(volcanoes,point,limit=8,maxKm=500){
  if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180||!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(maxKm)||maxKm<0||maxKm>20020)throw new Error('Invalid volcano proximity query');
  return volcanoes.map(v=>({id:v.id,distanceKm:nearestOnSegment(point,v,v).distanceKm})).filter(m=>m.distanceKm<=maxKm).sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id)).slice(0,limit);
}
export const eruptionYear=y=>y===null?'Not supplied':y<0?`${Math.abs(y)} BCE`:y>0?`${y} CE`:'0 (source year convention)';
