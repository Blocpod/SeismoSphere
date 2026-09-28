import {parentPort,workerData} from 'node:worker_threads';
import {calibrateDepth} from './calibration.mjs';
try{parentPort.postMessage(calibrateDepth(workerData));}catch(error){parentPort.postMessage({error:error.message});}
