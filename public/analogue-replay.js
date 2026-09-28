const DAY=86400000;
export function replaySearchStillCurrent(start,state){
 return state.selectedEvent?.id===start.eventId&&state.live===start.live&&state.mode===start.mode&&(start.live||state.asOf===start.asOf);
}
export function analogueFrame(report,index,day=0){
 if(!Number.isInteger(index)||index<0||index>=report.matches.length)throw new Error('Choose a returned analogue.');
 const source=report.matches[index].source,windowDays=report.windowDays;
 if(!Number.isFinite(day)||day<0||day>windowDays||!Number.isFinite(source.time)||!Number.isFinite(report.cutoff)||!(windowDays>=7&&windowDays<=10)||source.time+windowDays*DAY>report.cutoff)throw new Error('The complete analogue window is unavailable at the search cutoff.');
 return {source,cutoff:source.time+day*DAY,index,day,windowDays,total:report.matches.length};
}

export function nextAnalogueFrame(frame){
 return frame.day<frame.windowDays?{index:frame.index,day:Math.min(frame.windowDays,frame.day+1)}:frame.index+1<frame.total?{index:frame.index+1,day:0}:null;
}

export function setupAnalogueReplay({showEarth,selectEvent,toast,isActive}){
 let report=null,busy=false,playing=false,timer=null,current=null,panel=null;
 function pause(){playing=false;clearTimeout(timer);const button=document.querySelector('#analogue-play-all');if(button)button.textContent='Play all returned analogues';}
 function schedule(){
  clearTimeout(timer);if(!playing)return;
  timer=setTimeout(async()=>{
   if(document.hidden||!panel?.isConnected||document.querySelector('#selection').hidden||!isActive(current)){pause();return;}
   const next=nextAnalogueFrame(current);if(!next){pause();toast('Finished every returned analogue.');return;}
   await open(next.index,next.day,true);
  },2000);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 async function open(index,day=0,automatic=false){
  if(!automatic)pause();
  if(busy)return;
  busy=true;
  try{
   const snapshot=report,frame=analogueFrame(snapshot,index,day);
   await showEarth(frame.cutoff,()=>{
    selectEvent(frame.source);
    if(snapshot!==report)return;
    current=frame;
    const controls=document.createElement('section');controls.className='evidence';controls.id='analogue-replay-controls';panel=controls;
    const title=document.createElement('h3');title.textContent=`Analogue ${index+1} of ${frame.total} · day ${day}/${frame.windowDays}`;controls.append(title);
    const note=document.createElement('p');note.className='muted';note.textContent=`Search cutoff ${new Date(snapshot.cutoff).toISOString()}. Globe cutoff ${new Date(frame.cutoff).toISOString()}. Revised-catalog replay; background data and model drafts are recalculated at each step. The selected source comes from the retained search result. This is not a frozen historical forecast or a rerun of the search.`;controls.append(note);
    const actions=document.createElement('div');actions.className='selection-actions';
    for(const [label,i,d,disabled] of [['Previous analogue',index-1,0,index===0],['Next analogue',index+1,0,index===frame.total-1],['Source time',index,0,day===0],['Previous day',index,Math.max(0,day-1),day===0],['Next day',index,Math.min(frame.windowDays,day+1),day===frame.windowDays],['Window end',index,frame.windowDays,day===frame.windowDays]]){
     const button=document.createElement('button');button.className='secondary';button.textContent=label;button.disabled=disabled;button.onclick=()=>open(i,d);actions.append(button);
    }
    const play=document.createElement('button');play.className='secondary';play.id='analogue-play-all';play.textContent=playing?'Pause analogue playback':'Play all returned analogues';play.onclick=()=>{if(playing)pause();else{playing=true;play.textContent='Pause analogue playback';if(!nextAnalogueFrame(current))void open(0,0,true);else schedule();}};actions.append(play);
    const back=document.createElement('button');back.className='secondary';back.textContent='Return to analogue results';back.onclick=()=>{pause();document.querySelector('#research-dialog').showModal();};actions.append(back);controls.append(actions);
    document.querySelector('#selection').append(controls);
   });
   schedule();
  }catch(error){pause();toast(error.message,true);}finally{busy=false;}
 }
 return {set(value){pause();report=structuredClone(value);},open,pause,async start(){pause();if(!report?.matches.length)throw new Error('No completed analogue matches to replay.');playing=true;await open(0,0,true);}};
}
