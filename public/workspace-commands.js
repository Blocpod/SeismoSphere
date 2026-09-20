// Explicit local view controls never ask a language model to invent targets or parameters.
export function workspaceCommand(text){
 const s=String(text).trim().replace(/^please\s+/i,'').replace(/[.!]$/,'');let m;
 if((m=s.match(/^(?:use|show|switch to|enable) (?:the )?(scientific|cinematic)(?: view| rendering| mode)?$/i)))return {type:'action',action:m[1].toLowerCase()};
 if((m=s.match(/^(?:use|show|switch to|enable) (?:the )?(hemisphere|wedge)(?: cutaway| view)?$/i)))return {type:'action',action:m[1].toLowerCase()};
 if(/^show (?:all )?(?:earthquakes|events) deeper than 300 km (?:during|in) the last 72 hours$/i.test(s))return {type:'action',action:'deep'};
 if(/^(?:use|show|enable) (?:the )?x-ray(?: view)?$/i.test(s))return {type:'action',action:'xray'};
 if(/^(?:use|show|restore) (?:the )?surface(?: view)?$/i.test(s))return {type:'action',action:'surface'};
 if((m=s.match(/^(hide|remove|show|restore) (?:the )?plate labels$/i)))return {type:'plateLabels',visible:/show|restore/i.test(m[1])};
 if(/^show (?:all|unfiltered) (?:model )?(?:targets|watches|forecasts)$/i.test(s))return {type:'watches',reset:true};
 if((m=s.match(/^(?:show|display|filter to) (?:only )?(?:targets|watches|forecasts) (above|over|at least) m(?:agnitude)?\s*(\d+(?:\.\d+)?)$/i))){const magnitude=Number(m[2]);if(magnitude<0||magnitude>10)return {type:'error',message:'Choose a magnitude from 0 to 10.'};return {type:'watches',magnitude,inclusive:m[1].toLowerCase()==='at least'};}
 if(/^(?:find|show) (?:the )?unresolved fulcrums$/i.test(s))return {type:'watches',kind:'midpoint'};
 if((m=s.match(/^trace (?:the )?(?:model )?paths? from ([\p{L}\p{N}][\p{L}\p{N}\s,'’().-]{0,79})$/iu)))return {type:'watches',origin:m[1].trim()};
 return null;
}
export function filterWatches(watches,filter){
 if(!filter)return watches;
 return watches.filter(f=>(filter.magnitude===undefined||(filter.inclusive?f.magnitude.central>=filter.magnitude:f.magnitude.central>filter.magnitude))&&(!filter.kind||f.kind.includes(filter.kind))&&(!filter.origin||(f.sourceEvents??[]).some(e=>String(e.place??'').toLocaleLowerCase().includes(filter.origin.toLocaleLowerCase()))));
}
export function watchFilterText(filter){return !filter?'All model watches':filter.origin?'Source location contains “'+filter.origin+'”':filter.kind?'Unissued midpoint / fulcrum drafts':'Central magnitude '+(filter.inclusive?'≥':'>')+' M'+filter.magnitude;}
