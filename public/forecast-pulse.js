export function pulseForecasts(children,time,asOf,enabled){
  const wave=enabled ? .88+.12*Math.sin(time/4500*Math.PI*2) : 1;
  for(const child of children){
    const pulse=child.userData.forecastPulse;if(!pulse)continue;
    const active=asOf>=pulse.from&&asOf<pulse.until;
    child.material.opacity=pulse.opacity*(active?wave:1);
  }
}
