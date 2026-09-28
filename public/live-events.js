// Session-local arrival detection: revisions and the initial catalog are not new events.
export class LiveEventTracker {
 constructor(){this.reset();}
 reset(){this.provider=null;this.started=null;this.seen=new Set();}
 update(events,{live,provider,now,feed,triggerDepth,minMagnitude}){
  if(!live||provider!=='USGS'){this.reset();return [];}
  if(feed?.status!=='live'||!Number.isFinite(feed.fetchedAt)||now-feed.fetchedAt>900000||feed.fetchedAt>now)return [];
  if(this.provider!==provider||this.started===null){this.provider=provider;this.started=now;this.seen=new Set(events.map(e=>e.id));return [];}
  const arrivals=events.filter(e=>!this.seen.has(e.id)&&e.type==='earthquake'&&e.time>this.started&&e.time<=now&&e.depth>=triggerDepth&&e.mag>=minMagnitude);
  for(const e of events)this.seen.add(e.id);
  return arrivals.sort((a,b)=>b.mag-a.mag||b.time-a.time);
 }
}
export function setupLiveEvents({getState,selectEvent}){
 const tracker=new LiveEventTracker(),setting=document.createElement('label');setting.className='check';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='live-event-notices';
 setting.append(toggle,document.createTextNode('Show new deep-source event notices on this device'));
 const help=document.createElement('p');help.className='muted';help.textContent='Uses live USGS observations and the configured source depth and minimum magnitude. Only earthquakes occurring after live monitoring starts are announced. Initial catalogs, revisions and replay are excluded. Notices are observations, not official alerts or forecasts.';
 document.querySelector('#settings-form').after(setting,help);
 try{toggle.checked=localStorage.getItem('seismosphere-live-notices')==='true';}catch{}
 const panel=document.createElement('section');panel.className='live-event-notice panel';panel.hidden=true;panel.setAttribute('aria-label','New source earthquake');
 const text=document.createElement('p');text.setAttribute('role','status');
 const inspect=document.createElement('button');inspect.className='secondary';inspect.textContent='Inspect hypocenter';
 const dismiss=document.createElement('button');dismiss.className='secondary';dismiss.textContent='Dismiss';panel.append(text,inspect,dismiss);document.querySelector('#workspace').append(panel);
 let eventId=null;
 const hide=()=>{eventId=null;panel.hidden=true;};dismiss.onclick=hide;
 toggle.onchange=()=>{tracker.reset();hide();try{localStorage.setItem('seismosphere-live-notices',String(toggle.checked));}catch{}update();};
 inspect.onclick=()=>{const state=getState(),event=state.live&&state.events.find(e=>e.id===eventId);hide();if(event)selectEvent(event);};
 function update(){
  const s=getState();if(!toggle.checked){tracker.reset();hide();return;}
  const arrivals=tracker.update(s.events,{live:s.live,provider:s.status?.config.catalogProvider,now:s.asOf,feed:s.status?.feed,triggerDepth:s.status?.config.triggerDepth,minMagnitude:s.status?.config.minMagnitude});
  if(!s.live||eventId&&!s.events.some(e=>e.id===eventId))hide();
  if(!arrivals.length)return;
  const event=arrivals[0];eventId=event.id;text.textContent=`NEW CATALOG OBSERVATION · M${event.mag.toFixed(1)} · ${Math.round(event.depth)} km · ${event.place} · ${new Date(event.time).toISOString()}${arrivals.length>1?` · ${arrivals.length} new qualifying events`:''}`;panel.hidden=false;
 }
 return {update};
}
