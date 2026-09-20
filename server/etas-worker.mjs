import {parentPort,workerData} from 'node:worker_threads';
import {fitTemporalETAS,evaluateTemporalETAS,projectTemporalETAS} from './etas.mjs';
try{
  const {events,options,holdoutEnd}=workerData;
  const fit=fitTemporalETAS(events,options);
  parentPort.postMessage({fit,holdout:holdoutEnd?evaluateTemporalETAS(fit,events,holdoutEnd):null,projection:projectTemporalETAS(fit,events)});
}catch(e){parentPort.postMessage({error:e.message});}
