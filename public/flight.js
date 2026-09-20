export function setupFlight({earth,getForecast,toast}){
  if(!earth)return;
  const button=document.createElement('button');button.id='flight-open';button.textContent='↗ Fly path';button.setAttribute('aria-label','Fly selected model path');document.querySelector('.globe-toolbar').appendChild(button);
  const panel=document.createElement('section');panel.className='flight-panel panel';panel.hidden=true;panel.setAttribute('aria-label','Model path flight');
  panel.innerHTML='<span class="eyebrow">ILLUSTRATIVE MODEL PATH</span><strong id="flight-name"></strong><p id="flight-progress" role="status"></p><div><button id="flight-pause" class="secondary">Pause</button><button id="flight-next" class="secondary">Next stop</button><button id="flight-stop" class="secondary">End flight</button></div><small>Camera travel is not pressure propagation or elapsed model time.</small>';
  document.querySelector('#workspace').appendChild(panel);
  const pause=panel.querySelector('#flight-pause'),next=panel.querySelector('#flight-next'),progress=panel.querySelector('#flight-progress');let points=[],index=0,timer=null,paused=false,active=false;
  function clear(){clearTimeout(timer);timer=null;}
  function schedule(){clear();if(active&&!paused&&!earth.reduced&&!earth.scientific&&index<points.length-1)timer=setTimeout(()=>go(index+1),3200);}
  function describe(){progress.textContent=`Stop ${index+1} of ${points.length} · ${points[index].lat.toFixed(2)}°, ${points[index].lon.toFixed(2)}°${paused?' · paused':''}${index===points.length-1?' · route end':''}`;pause.textContent=paused?'Resume':'Pause';pause.disabled=earth.reduced||earth.scientific||index===points.length-1;next.disabled=index===points.length-1;}
  function go(value){index=value;earth.focus(points[index],3.1,true);describe();schedule();}
  function stop(){clear();active=false;earth.targetCamera=null;earth.showTravelPath([]);panel.hidden=true;}
  function hold(){if(!active)return;clear();paused=true;earth.targetCamera=null;describe();}
  earth.onExternalFocus=stop;earth.controls.addEventListener('start',stop);
  window.addEventListener('resize',hold);document.addEventListener('visibilitychange',()=>{if(document.hidden)hold();});
  // Other scene modes and orbit take control immediately; a flight never fights user input.
  for(const id of ['section-toggle','xray-toggle','orbit-toggle'])document.querySelector('#'+id)?.addEventListener('click',stop);
  button.onclick=()=>{
    const forecast=getForecast();points=(forecast?.path??[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>({lat:p.lat,lon:p.lon}));
    if(points.length<2){toast('Select a model watch with at least two path stops.');return;}
    stop();earth.spatialLayer?.clear();earth.setXray(false);earth.pathGroup.visible=true;document.querySelector('#paths-toggle').classList.add('active');document.querySelector('#paths-toggle').setAttribute('aria-pressed','true');document.querySelector('#xray-toggle').classList.remove('active');document.querySelector('#xray-toggle').setAttribute('aria-pressed','false');
    earth.showTravelPath(points);panel.querySelector('#flight-name').textContent=forecast.region;active=true;paused=earth.reduced||earth.scientific;panel.hidden=false;go(0);
  };
  pause.onclick=()=>{if(paused){paused=false;go(index);}else hold();};next.onclick=()=>go(Math.min(points.length-1,index+1));panel.querySelector('#flight-stop').onclick=stop;
}
