import {buildFaultIndex,nearestFaults} from './fault-geometry.js';
let index;
self.onmessage=({data})=>{try{
  if(data.type==='init'){index=buildFaultIndex(data.features);self.postMessage({id:data.id,ready:true});}
  else{if(!index)throw new Error('Fault index is still loading');self.postMessage({id:data.id,matches:nearestFaults(index,data.point,6,500)});}
}catch(error){self.postMessage({id:data.id,error:error.message});}};
