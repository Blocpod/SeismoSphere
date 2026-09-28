const DAY=86400000;
export function analogueFrame(report,index,day=0){
 if(!Number.isInteger(index)||index<0||index>=report.matches.length)throw new Error('Choose a returned analogue.');
 const source=report.matches[index].source,windowDays=report.windowDays;
 if(!Number.isFinite(day)||day<0||day>windowDays||!Number.isFinite(source.time)||!Number.isFinite(report.cutoff)||!(windowDays>=7&&windowDays<=10)||source.time+windowDays*DAY>report.cutoff)throw new Error('The complete analogue window is unavailable at the search cutoff.');
 return {source,cutoff:source.time+day*DAY,index,day,windowDays,total:report.matches.length};
}

export function setupAnalogueReplay({showEarth,selectEvent,toast}){
 let report=null,busy=false;
 async function open(index,day=0){
  if(busy)return;
  busy=true;
  try{
   const snapshot=report,frame=analogueFrame(snapshot,index,day);
   await showEarth(frame.cutoff,()=>{
    selectEvent(frame.source);
    const controls=document.createElement('section');controls.className='evidence';controls.id='analogue-replay-controls';
    const title=document.createElement('h3');title.textContent=`Analogue ${index+1} of ${frame.total} · day ${day}/${frame.windowDays}`;controls.append(title);
    const note=document.createElement('p');note.className='muted';note.textContent=`Search cutoff ${new Date(snapshot.cutoff).toISOString()}. Globe cutoff ${new Date(frame.cutoff).toISOString()}. Revised-catalog replay; background data and model drafts are recalculated at each step. The selected source comes from the retained search result. This is not a frozen historical forecast or a rerun of the search.`;controls.append(note);
    const actions=document.createElement('div');actions.className='selection-actions';
    for(const [label,i,d,disabled] of [['Previous analogue',index-1,0,index===0],['Next analogue',index+1,0,index===frame.total-1],['Source time',index,0,day===0],['Previous day',index,Math.max(0,day-1),day===0],['Next day',index,Math.min(frame.windowDays,day+1),day===frame.windowDays],['Window end',index,frame.windowDays,day===frame.windowDays]]){
     const button=document.createElement('button');button.className='secondary';button.textContent=label;button.disabled=disabled;button.onclick=()=>open(i,d);actions.append(button);
    }
    const back=document.createElement('button');back.className='secondary';back.textContent='Return to analogue results';back.onclick=()=>document.querySelector('#research-dialog').showModal();actions.append(back);controls.append(actions);
    document.querySelector('#selection').append(controls);
   });
  }catch(error){toast(error.message,true);}finally{busy=false;}
 }
 return {set(value){report=structuredClone(value);},open};
}
