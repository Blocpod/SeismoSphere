import {chat,providers} from '../server/ai.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const config=JSON.parse(readFileSync('config/default.json','utf8'));
const context={asOf:Date.now(),stats:{recentEvents:12,deepTriggers:2},candidates:[],limitations:['No candidate forecasts supplied. Do not invent one.']};
console.log(await providers());
const provider=process.argv[2]??'ollama';const start=Date.now();
try{const result=await chat('Show deep events and explain why a model match score is not an earthquake probability. Do not invent a forecast.',context,{...config,aiProvider:provider});mkdirSync('artifacts',{recursive:true});writeFileSync(`artifacts/ai-${provider}.json`,JSON.stringify({elapsedSeconds:(Date.now()-start)/1000,...result},null,2));console.log(JSON.stringify({elapsedSeconds:(Date.now()-start)/1000,...result}));}catch(e){console.error(e.message);process.exitCode=1;}
