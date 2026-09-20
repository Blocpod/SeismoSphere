import {parentPort,workerData} from 'node:worker_threads';
import {randomizedCatalog,scoreCatalog} from './randomization.mjs';
import {hash} from './store.mjs';
try{
  const {events,input,checkpoint}=workerData,{options,config,routes,boundaries}=input;
  if(!checkpoint.observed)parentPort.postMessage({type:'observed',result:scoreCatalog(events,options,config,routes,boundaries)});
  for(let i=checkpoint.replicates.length;i<options.replicates;i++){const catalog=randomizedCatalog(events,options,config,i);parentPort.postMessage({type:'replicate',result:{index:i,catalogDigest:hash(catalog),...scoreCatalog(catalog,options,config,routes,boundaries)}});}
  parentPort.postMessage({type:'complete'});
}catch(error){parentPort.postMessage({type:'error',error:error.message});}
