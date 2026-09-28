export function volcanoAnimationState({enabled,eligible,live,scientific,reduced,checkedAt,publishedAt,weekly=false,error,now=Date.now()}){
 let reason='Animating dated source markers';
 if(!enabled)reason='Animation switched off';
 else if(!eligible)reason='Source unavailable at this cutoff';
 else if(!live)reason='Historical view: static source markers';
 else if(scientific||reduced)reason='Static markers for scientific or reduced-motion presentation';
 else if(error||!Number.isFinite(checkedAt)||now-checkedAt>(weekly?4*3600000:30*60000))reason='Stale or failed source check: static markers';
 else if(weekly&&(!Number.isFinite(publishedAt)||now-publishedAt>9*86400000||publishedAt>now))reason='Old or undated weekly publication: static markers';
 return {active:reason==='Animating dated source markers',reason,meaning:'Symbolic attention pulses, not eruption rate, plume height, lava flow, or measured ground motion.'};
}
