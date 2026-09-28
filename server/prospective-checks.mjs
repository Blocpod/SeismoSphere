// Run independent experiment domains without delaying their execution behind model inference.
export async function runProspectiveChecks(managers,feed,onChange=()=>{}){
 const entries=await Promise.all(Object.entries(managers).map(async([name,manager])=>{
  try{const result=await manager.tick(feed);if(result.changes)onChange();return [name,result];}
  catch(error){onChange();return [name,{changes:null,error:error.message}];}
 }));
 const results=Object.fromEntries(entries),complete=entries.every(([,r])=>!r.error),completedChanges=entries.reduce((sum,[,r])=>sum+(r.changes??0),0);
 return {changes:complete?completedChanges:null,completedChanges,complete,...results};
}
