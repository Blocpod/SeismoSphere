import {stressIntegrity} from './rupture-inputs.mjs';
import {stressGrid,stressDifference} from '../public/stress-grid.js';
import {finiteFaultAvailability} from '../public/finite-fault.js';
export function stressContext(inputs,id,baselineId,sample,asOf,mode){
 const record=inputs.stress(id),source=inputs.get(record.sourceId),baseline=baselineId?inputs.stress(baselineId):null;
 for(const r of [record,baseline].filter(Boolean)){
  if(!Object.values(stressIntegrity(r,source)).every(v=>v===true))throw new Error('Stress evidence integrity failed');
  if(r.createdAt>asOf)throw new Error('This calculation was unavailable at the requested cutoff');
 }
 const reason=finiteFaultAvailability(source,source.product,{asOf,mode});if(reason)throw new Error(reason);
 const report=baseline?stressDifference(record,baseline):stressGrid(record).report;
 if(!Number.isInteger(sample)||sample<0||sample>=report.points.length)throw new Error('Choose a valid stress sample');
 const point=report.points[sample],value=report.values[sample],r=record.options.receiver;
 const sourceSentence=`Sample ${sample+1}/${report.points.length}: east ${point.xKm} km, north ${point.yKm} km, depth ${point.depthKm} km. `+(value?`${baseline?'Current minus baseline: ':'Calculated change: '}Coulomb ${(value.coulombPa/1e6).toPrecision(6)} MPa; shear ${(value.shearPa/1e6).toPrecision(6)} MPa; unclamping ${(value.unclampingPa/1e6).toPrecision(6)} MPa.`:'Masked near a source patch; no stress value is available.');
 return {resultId:record.id,sourceId:source.id,sourceHash:source.receipt.sha256,event:source.event,createdAt:new Date(record.createdAt).toISOString(),cutoffUtc:new Date(asOf).toISOString(),solver:report.solver,solverVersion:report.solverVersion,options:record.options,baseline:baseline?{id:baseline.id,options:baseline.options,createdAt:new Date(baseline.createdAt).toISOString()}:null,sample:point,value,sourceSentence,interpretationSentence:(baseline?'A baseline comparison is selected; values are current minus baseline.':'This is one calculation; no baseline comparison is selected.')+' '+(value?'This sample is not masked.':'This sample is masked; no numerical stress is reported.'),receiverSentence:`Receiver strike ${r.strike}°, dip ${r.dip}°, rake ${r.rake}°; effective friction ${record.options.friction}.`,limitations:['Static homogeneous elastic half-space calculation, not observed stress or an earthquake forecast.','Receiver orientation, elastic properties and friction are assumptions. Positive unclamping means tension; positive Coulomb change promotes slip only on the assumed receiver.',(baseline?'Comparison values measure sensitivity, not accuracy. ':'')+'No timing, earthquake probability or predictive skill follows from these values.','No topography, dynamic stress, pore-pressure or viscoelastic simulation. The AI receives one computed sample and metadata, not an independently validated physical reconstruction.']};
}
