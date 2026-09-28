export function depthRuler(depth){
 if(!Number.isFinite(depth))return '';
 const min=Math.min(0,Math.floor(depth/100)*100),max=Math.max(700,Math.ceil(depth/100)*100),y=value=>20+(value-min)/(max-min)*140;
 const step=max-min>1000?500:100,ticks=[];
 for(let value=min;value<=max;value+=step)ticks.push(`<path d="M62 ${y(value)}h12"/><text x="54" y="${y(value)+4}" text-anchor="end">${value} km</text>`);
 const label=`${depth.toFixed(1)} km catalog depth`,point=y(depth);
 return `<figure class="event-depth-ruler"><svg viewBox="0 0 250 185" role="img" aria-label="${label}. Linear kilometer scale, independent of globe depth exaggeration."><path d="M68 20V160"/>${ticks.join('')}<path class="depth-indicator" d="M80 ${point}H222"/><circle class="depth-indicator" cx="68" cy="${point}" r="4"/><text class="depth-value" x="92" y="${Math.max(14,point-8)}">${depth.toFixed(1)} km</text></svg><figcaption>Catalog depth below surface · linear km scale</figcaption></figure>`;
}
