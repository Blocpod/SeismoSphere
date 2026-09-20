import {parentPort,workerData} from 'node:worker_threads';
import {completenessAnalysis} from './completeness.mjs';
try{parentPort.postMessage(completenessAnalysis(workerData.events,workerData.options));}catch(error){parentPort.postMessage({error:error.message});}
