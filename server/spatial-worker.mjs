import {parentPort,workerData} from 'node:worker_threads';
import {fitSpatialETAS,evaluateSpatialETAS,projectSpatialETAS} from './spatial-etas.mjs';
try{const {events,options,holdoutEnd}=workerData,fit=fitSpatialETAS(events,options);parentPort.postMessage({fit,holdout:holdoutEnd?evaluateSpatialETAS(fit,events,holdoutEnd):null,projection:projectSpatialETAS(fit,events)});}catch(error){parentPort.postMessage({error:error.message});}
