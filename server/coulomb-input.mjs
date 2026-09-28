// USGS finite-fault rake/net-slip Coulomb input subset. Reject other encodings.
export function parseCoulombInput(raw){
  const lines=raw.split(/\r?\n/),header=lines.findIndex(s=>/^\s*#\s+X-start\s+Y-start\s+X-fin\s+Y-fin\s+Kode\s+rake\s+netslip\s+dip angle\s+top\s+bot\s*$/i.test(s));
  if(header<0||!/^\s*xxx\s+x+/i.test(lines[header+1]??''))throw new Error('Unsupported Coulomb format: explicit rake/net-slip columns are required');
  const fixed=Number(raw.match(/#fixed\s*=\s*(\d+)/)?.[1]);
  if(!Number.isInteger(fixed)||fixed<1||fixed>10000)throw new Error('Invalid Coulomb source count');
  if(!/#reg1\s*=\s*0\b/.test(raw)||!/#reg2\s*=\s*0\b/.test(raw))throw new Error('Regional fault encodings are not supported');
  const patches=[];let i=header+2;
  for(;i<lines.length&&lines[i].trim();i++){
    const fields=lines[i].trim().split(/\s+/),v=fields.slice(0,11).map(Number);
    if(fields.length<11||v.some(n=>!Number.isFinite(n)))throw new Error('Invalid Coulomb source row');
    const [number,xStartKm,yStartKm,xEndKm,yEndKm,kode,rakeDeg,slipM,dipDeg,topKm,bottomKm]=v;
    if(!Number.isInteger(number)||kode!==100||Math.abs(rakeDeg)>180||slipM<0||dipDeg<=0||dipDeg>90||topKm<0||bottomKm<=topKm||bottomKm>1000||Math.hypot(xEndKm-xStartKm,yEndKm-yStartKm)===0)throw new Error('Unsupported or invalid Coulomb fault geometry/slip');
    patches.push({number,xStartKm,yStartKm,xEndKm,yEndKm,kode,rakeDeg,slipM,dipDeg,topKm,bottomKm,label:fields.slice(11).join(' ')});
    if(patches.length>fixed)throw new Error('Coulomb source count mismatch');
  }
  if(patches.length!==fixed)throw new Error('Coulomb source count mismatch');
  const read=(name)=>{const values=[...raw.slice(0,raw.indexOf(lines[header])).matchAll(new RegExp('\\b'+name+'\\s*=\\s*([^\\s]+)','g'))];if(values.length!==1||!Number.isFinite(Number(values[0][1])))throw new Error('Missing or ambiguous Coulomb '+name);return Number(values[0][1]);};
  const poisson=read('PR1'),poisson2=read('PR2'),youngSource=read('E1'),youngSource2=read('E2'),friction=read('FRIC');
  if(poisson<=-1||poisson>=.5||poisson!==poisson2||youngSource<=0||youngSource!==youngSource2||friction<0||friction>1)throw new Error('Unsupported elastic constants or friction');
  const mapStart=lines.findIndex(s=>s.trim()==='Map info');
  const coordinate=name=>{const matches=lines.slice(mapStart+1).map(s=>s.match(new RegExp('zero '+name+'\\s*=\\s*([^\\s]+)'))).filter(Boolean);if(mapStart<0||matches.length!==1||!Number.isFinite(Number(matches[0][1])))throw new Error('Missing Coulomb map origin');return Number(matches[0][1]);};
  const origin={lat:coordinate('lat'),lon:coordinate('lon')};if(Math.abs(origin.lat)>90||Math.abs(origin.lon)>180)throw new Error('Invalid Coulomb map origin');
  return {version:'usgs-coulomb-input-1',title:lines[0],origin,patches,elasticInput:{poisson,youngSource,friction},units:{horizontal:'km',depth:'km positive down',slip:'m',angles:'degrees'},limitations:['Only explicit rake/net-slip Kode 100 rows are supported.','Source-file elastic values are retained without unit conversion or stress computation.','This is published inversion geometry and slip, not a measured stress field.']};
}
