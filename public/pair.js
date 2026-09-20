const form=document.querySelector('#pair-form'),message=document.querySelector('#pair-result');
const access=await(await fetch('/api/access',{cache:'no-store'})).json();
if(access.authenticated)location.replace('/');
form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='Connecting securely…';
  try{const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await r.json();if(!r.ok)throw new Error(data.error);location.replace('/');}
  catch(e){message.textContent=e.message;button.disabled=false;}
};
