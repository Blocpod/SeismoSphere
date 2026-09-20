import https from 'node:https';
import http from 'node:http';
import {networkInterfaces,hostname,homedir} from 'node:os';
import {randomBytes,createHash,timingSafeEqual,X509Certificate,createPrivateKey} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const HOUR=3600000,DAY=24*HOUR;
const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const localAddress=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const privateIP=ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function lanAddresses(){return Object.entries(networkInterfaces()).flatMap(([name,values])=>values.filter(v=>v.family==='IPv4'&&!v.internal&&privateIP(v.address)).map(v=>({name,address:v.address})));}
export class Access {
  constructor(store,{localPort=4318,directory='data/private/tls',test=false}={}){
    this.store=store;this.localPort=localPort;this.directory=path.resolve(directory);this.test=test;
    this.settings=store.get('sharing',{enabled:false,host:lanAddresses()[0]?.address??null,port:4438,bootstrapPort:4319});
    this.limits=new Map();this.sockets=new Map();this.timer=setInterval(()=>this.expire(),60000);this.timer.unref();
  }
  info(){
    let certificate=null;try{certificate=this.certificateInfo();}catch{}
    const state=this.store.get('tlsState',{});
    return {enabled:!!this.tls,busy:!!this.busy,settings:this.settings,addresses:lanAddresses(),certificate,certificateGeneration:state.active??null,pendingRotation:state.pending??null,replacedTrust:state.replacedTrust??null,
      url:this.settings.host?`https://${this.settings.host}:${this.settings.port}`:null,
      setupUrl:this.settings.host?`http://${this.settings.host}:${this.settings.bootstrapPort}`:null,
      sessions:Object.values(this.store.get('deviceSessions',{})).map(({tokenHash,...s})=>s),
      invitationExpiresAt:this.store.get('deviceInvite')?.expiresAt??null,lastError:this.lastError??null};
  }
  generationDirectory(id){if(id==null)return this.directory;if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Invalid certificate generation');return path.join(this.directory,'generations',id);}
  get certificateDirectory(){return this.generationDirectory(this.store.get('tlsState',{}).active);}
  certificateInfo(directory=this.certificateDirectory){
    const metadata=JSON.parse(readFileSync(path.join(directory,'metadata.json'),'utf8')),root=new X509Certificate(readFileSync(path.join(directory,'root.pem'))),issuer=new X509Certificate(readFileSync(path.join(directory,'issuer.pem'))),leaf=new X509Certificate(readFileSync(path.join(directory,'server-chain.pem')));
    return {...metadata,rootFingerprint:root.fingerprint256.replaceAll(':',''),expiresAt:leaf.validToDate.toISOString(),issuerExpiresAt:issuer.validToDate.toISOString(),rootExpiresAt:root.validToDate.toISOString(),rotationDue:issuer.validToDate.getTime()<Date.now()+100*DAY};
  }
  // ponytail: one owner-side lifecycle operation at a time; no distributed coordination is needed for this local process.
  async exclusive(operation){if(this.busy)throw new Error('A phone-access operation is already running');this.busy=true;try{return await operation();}finally{this.busy=false;}}
  removeKeys(directory){for(const file of ['issuer-key.pem','server-key.pem'])rmSync(path.join(directory,file),{force:true});}
  async generateCertificate(host,fresh=false){
    if(!(lanAddresses().some(a=>a.address===host)||this.test&&host==='127.0.0.1'))throw new Error('Select a current private LAN address');
    const id=randomBytes(16).toString('hex'),directory=this.generationDirectory(id);mkdirSync(directory,{recursive:true,mode:0o700});
    try{
      if(process.platform==='win32')await run('icacls',[directory,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`]);
      if(!fresh&&existsSync(path.join(this.certificateDirectory,'issuer.pem')))for(const file of ['issuer.pem','issuer-key.pem','root.pem','root.cer'])copyFileSync(path.join(this.certificateDirectory,file),path.join(directory,file));
      const local=path.resolve('data/model-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python'),bundled=path.join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),python=process.env.SEISMO_PYTHON??(existsSync(local)?local:existsSync(bundled)?bundled:'python');
      await run(python,['scripts/create-local-tls.py'],JSON.stringify({directory,host,machine:hostname()}));
      const certificate=this.validateCertificate(directory,host);return {id,certificate};
    }catch(error){this.removeKeys(directory);throw error;}
  }
  validateCertificate(directory,host){
    const root=new X509Certificate(readFileSync(path.join(directory,'root.pem'))),issuer=new X509Certificate(readFileSync(path.join(directory,'issuer.pem'))),leaf=new X509Certificate(readFileSync(path.join(directory,'server-chain.pem'))),now=Date.now();
    const chain=readFileSync(path.join(directory,'server-chain.pem'),'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)??[];
    if(chain.length!==2||!new X509Certificate(chain[1]).raw.equals(issuer.raw)||!new X509Certificate(readFileSync(path.join(directory,'root.cer'))).raw.equals(root.raw))throw new Error('The prepared certificate chain failed validation');
    if(!root.ca||!issuer.ca||leaf.ca||!root.verify(root.publicKey)||!issuer.verify(root.publicKey)||!leaf.verify(issuer.publicKey)||!leaf.checkIP(host)||![root,issuer,leaf].every(c=>Date.parse(c.validFrom)<=now&&Date.parse(c.validTo)>now+14*DAY)||!leaf.checkPrivateKey(createPrivateKey(readFileSync(path.join(directory,'server-key.pem'))))||!issuer.checkPrivateKey(createPrivateKey(readFileSync(path.join(directory,'issuer-key.pem')))))throw new Error('The prepared certificate chain failed validation');
    return this.certificateInfo(directory);
  }
  async prepareRotation(host){return this.exclusive(async()=>{
    if(this.tls)throw new Error('Turn off phone access before replacing phone trust');
    const state=this.store.get('tlsState',{});if(state.pending)throw new Error('Review or discard the prepared replacement first');
    const previous=this.certificateInfo(),replacement=await this.generateCertificate(host,true);
    this.store.set('tlsState',{...state,pending:{...replacement,previousFingerprint:previous.rootFingerprint,preparedAt:Date.now()}});return this.info();
  });}
  async cancelRotation(){return this.exclusive(async()=>{
    const state=this.store.get('tlsState',{});if(state.pending)this.removeKeys(this.generationDirectory(state.pending.id));this.store.set('tlsState',{...state,pending:null});return this.info();
  });}
  async activateRotation(id,fingerprint){return this.exclusive(async()=>{
    if(this.tls)throw new Error('Turn off phone access before replacing phone trust');
    const state=this.store.get('tlsState',{}),pending=state.pending,previous=this.certificateInfo();
    if(!pending||pending.id!==id||pending.certificate.rootFingerprint!==fingerprint||pending.previousFingerprint!==previous.rootFingerprint)throw new Error('The trust review is stale. Review the current replacement before activating it');
    const certificate=this.validateCertificate(this.generationDirectory(id),pending.certificate.host);
    if(certificate.rootFingerprint!==fingerprint)throw new Error('The prepared trust certificate changed; discard it and prepare again');
    if(!(lanAddresses().some(a=>a.address===certificate.host)||this.test&&certificate.host==='127.0.0.1'))throw new Error('The prepared LAN address is no longer on this PC');
    const oldDirectory=this.certificateDirectory,settings={...this.settings,host:certificate.host,enabled:false};
    this.store.db.exec('BEGIN IMMEDIATE');try{this.store.set('tlsState',{active:id,pending:null,replacedTrust:{rootFingerprint:previous.rootFingerprint,replacedAt:Date.now()}});this.store.set('sharing',settings);this.store.set('deviceSessions',{});this.store.set('deviceInvite',null);this.store.db.exec('COMMIT');}catch(error){this.store.db.exec('ROLLBACK');throw error;}
    this.settings=settings;this.removeKeys(oldDirectory);return this.info();
  });}
  invite(role='controller'){
    if(!this.tls)throw new Error('Enable phone access before generating a pairing code');
    if(!['controller','viewer'].includes(role))throw new Error('Invalid device role');
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=randomBytes(12);
    const code=[...bytes].map(v=>alphabet[v%32]).join('');
    const expiresAt=Date.now()+10*60000;
    this.store.set('deviceInvite',{codeHash:digest(code),role,expiresAt});
    return {code:code.match(/.{1,4}/g).join('-'),expiresAt,role};
  }
  rateLimit(address){
    const now=Date.now();for(const [k,v] of this.limits)if(v.until<now)this.limits.delete(k);
    for(const key of ['global',address]){const limit=key==='global'?60:6,p=this.limits.get(key)??{count:0,until:now+60000};p.count++;this.limits.set(key,p);if(p.count>limit||this.limits.size>1024)throw new Error('Too many pairing attempts. Wait one minute.');}
  }
  pair(code,name,address){
    this.rateLimit(address);
    const invite=this.store.get('deviceInvite'),normalized=String(code??'').replace(/[-\s]/g,'').toUpperCase();
    if(!invite||invite.expiresAt<Date.now()||normalized.length!==12||!equal(digest(normalized),invite.codeHash))throw new Error('Pairing code is invalid or expired');
    if(typeof name!=='string'||name.trim().length<1||name.length>80)throw new Error('Give this device a name of 1–80 characters');
    const token=randomBytes(32).toString('base64url'),tokenHash=digest(token),id=randomBytes(12).toString('hex'),now=Date.now();
    const sessions=this.store.get('deviceSessions',{});sessions[tokenHash]={id,name:name.trim(),role:invite.role,createdAt:now,lastSeen:now,expiresAt:now+7*DAY};
    this.store.set('deviceSessions',sessions);this.store.set('deviceInvite',null);
    return {token,session:sessions[tokenHash]};
  }
  session(req){
    const token=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-seismo='))?.slice(14);
    if(!token||! /^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const key=digest(token),sessions=this.store.get('deviceSessions',{}),session=sessions[key],now=Date.now();
    if(!session||session.expiresAt<=now||session.lastSeen+12*HOUR<=now)return null;
    if(now-session.lastSeen>60000){session.lastSeen=now;this.store.set('deviceSessions',sessions);}
    if(!this.sockets.has(session.id))this.sockets.set(session.id,new Set());
    const sockets=this.sockets.get(session.id);
    if(!sockets.has(req.socket)){sockets.add(req.socket);req.socket.once('close',()=>sockets.delete(req.socket));}
    return session;
  }
  revoke(id){
    const sessions=this.store.get('deviceSessions',{});
    for(const [key,s] of Object.entries(sessions))if(s.id===id)delete sessions[key];
    this.store.set('deviceSessions',sessions);
    for(const socket of this.sockets.get(id)??[])socket.destroy();this.sockets.delete(id);
  }
  expire(){for(const s of Object.values(this.store.get('deviceSessions',{})))if(s.expiresAt<Date.now()||s.lastSeen+12*HOUR<Date.now())this.revoke(s.id);}
  cookie(token){return `__Host-seismo=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800`;}
  async guard(req,res,pathname){
    const tls=!!req.socket.encrypted,expected=tls?`${this.settings.host}:${this.settings.port}`:null;
    const allowed=tls?[expected]:[`127.0.0.1:${this.localPort}`,`localhost:${this.localPort}`];
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return false;};
    if(!allowed.includes(req.headers.host)||!tls&&!localAddress(req.socket.remoteAddress))return send(403,{error:'Unrecognized workspace address'});
    const origin=(tls?'https://':'http://')+req.headers.host;
    if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Cross-origin access denied'});
    if(tls&&req.method==='POST'&&req.headers.origin!==origin)return send(403,{error:'Same-origin browser request required'});
    if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Cross-site access denied'});
    if(!tls){req.access={role:'owner',local:true};return true;}
    res.setHeader('Referrer-Policy','no-referrer');
    if(pathname.startsWith('/api/sharing/')||pathname.startsWith('/api/system/'))return send(403,{error:'Manage this setting on the host PC'});
    if(req.method==='POST'&&pathname==='/api/pair'){
      if(req.headers['content-type']!=='application/json')return send(415,{error:'JSON required'});
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(413,{error:'Pairing request too large'});}
      try{const b=JSON.parse(raw),r=this.pair(b.code,b.name,req.socket.remoteAddress);res.setHeader('Set-Cookie',this.cookie(r.token));return send(200,{session:r.session});}
      catch(e){return send(e.message.startsWith('Too many')?429:400,{error:e.message});}
    }
    req.access=this.session(req);
    if(pathname==='/api/access'&&req.method==='GET')return send(200,{authenticated:!!req.access,local:false,session:req.access});
    if(req.method==='GET'&&['/pair.html','/pair.js','/pair.css','/icon.svg'].includes(pathname))return true;
    if(!req.access){if(pathname.startsWith('/api/'))return send(401,{error:'Pair this device to access the workspace'});res.writeHead(303,{Location:'/pair.html','Cache-Control':'no-store'});res.end();return false;}
    if(pathname==='/api/logout'&&req.method==='POST'){
      const id=req.access.id;res.setHeader('Set-Cookie',this.cookie('').replace('Max-Age=604800','Max-Age=0'));send(200,{loggedOut:true});setTimeout(()=>this.revoke(id),20);return false;
    }
    if(req.access.role==='viewer'&&req.method!=='GET'&&!['/api/midpoint','/api/analogues'].includes(pathname))return send(403,{error:'This device has view-only access'});
    return true;
  }
  async prepare(host){
    return this.exclusive(()=>this.prepareCertificate(host));
  }
  async prepareCertificate(host){
    if(this.tls)throw new Error('Turn off phone access before preparing its certificate');
    const previous=this.certificateDirectory,state=this.store.get('tlsState',{}),replacement=await this.generateCertificate(host);
    const settings={...this.settings,host,enabled:false};this.store.db.exec('BEGIN IMMEDIATE');try{this.store.set('tlsState',{...state,active:replacement.id});this.store.set('sharing',settings);this.store.db.exec('COMMIT');}catch(error){this.store.db.exec('ROLLBACK');throw error;}
    this.settings=settings;this.removeKeys(previous);
    return this.info().certificate;
  }
  async start(handler,settings=this.settings){
    return this.exclusive(()=>this.startListeners(handler,settings));
  }
  async startListeners(handler,settings){
    if(this.tls)throw new Error('Phone access is already running');
    if(!(lanAddresses().some(a=>a.address===settings.host)||this.test&&settings.host==='127.0.0.1'))throw new Error('The configured LAN address is no longer on this PC. Choose its current address.');
    for(const value of [settings.port,settings.bootstrapPort])if(!Number.isInteger(value)||value<1024||value>65535||value===this.localPort)throw new Error('Invalid sharing port');
    if(settings.port===settings.bootstrapPort)throw new Error('HTTPS and setup ports must differ');
    if(existsSync(path.join(this.certificateDirectory,'server-chain.pem'))){const previous=new X509Certificate(readFileSync(path.join(this.certificateDirectory,'server-chain.pem')));if(Date.parse(previous.validTo)<Date.now()+14*DAY)await this.prepareCertificate(settings.host);}
    const key=readFileSync(path.join(this.certificateDirectory,'server-key.pem')),cert=readFileSync(path.join(this.certificateDirectory,'server-chain.pem'));
    const leaf=new X509Certificate(cert);
    if(!leaf.checkIP(settings.host)||Date.parse(leaf.validTo)<Date.now())throw new Error('The local TLS certificate needs preparation for this address');
    this.settings={...settings,enabled:true};
    const tls=https.createServer({key,cert,minVersion:'TLSv1.2'},handler),bootstrap=http.createServer((req,res)=>this.bootstrap(req,res));
    tls.headersTimeout=15000;tls.requestTimeout=30000;bootstrap.headersTimeout=10000;bootstrap.requestTimeout=10000;
    try{await listen(tls,settings.port,settings.host);await listen(bootstrap,settings.bootstrapPort,settings.host);this.tls=tls;this.publicSetup=bootstrap;this.store.set('sharing',this.settings);this.lastError=null;}
    catch(e){tls.closeAllConnections();tls.close();bootstrap.closeAllConnections();bootstrap.close();this.settings.enabled=false;throw e;}
  }
  bootstrap(req,res){
    const expected=`${this.settings.host}:${this.settings.bootstrapPort}`;
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'||req.headers.host!==expected){res.writeHead(403);res.end();return;}
    if(req.url==='/certificate.cer'){res.writeHead(200,{'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="SeismoSphere-Local-Trust.cer"','Cache-Control':'no-store'});res.end(readFileSync(path.join(this.certificateDirectory,'root.cer')));return;}
    if(req.url!=='/'){res.writeHead(404);res.end();return;}
    const info=this.info(),fingerprint=info.certificate.rootFingerprint.match(/.{1,4}/g).join(' ');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Connect to SeismoSphere</title><style>body{background:#0b151c;color:#d5e7e7;font:16px/1.6 system-ui;max-width:640px;padding:30px;margin:auto}h1{font-size:30px}a{color:#a4e9d4}code{display:block;overflow-wrap:anywhere;padding:15px;background:#172830}li{margin:16px 0}</style><h1>Connect your phone</h1><p>This setup page carries no earthquake workspace data or pairing credentials.</p><ol><li>Compare this certificate fingerprint with Phone access in SeismoSphere on your PC. Install it only if every group matches.<code>${escape(fingerprint)}</code></li><li><a href="/certificate.cer">Download the local trust certificate</a>. On iPhone/iPad, install the downloaded profile in Settings, then enable it under General → About → Certificate Trust Settings. On Android, use Settings → Security → Encryption & credentials → Install a certificate → CA certificate; labels vary by device.</li><li><a href="${escape(info.url)}/pair.html">Open the encrypted workspace</a> and enter the one-time code shown on your PC.</li></ol><p>The certificate issuer is restricted to private LAN addresses and local names. Remove this trust certificate from your device if you stop using SeismoSphere.</p></html>`);
  }
  async stop(){
    return this.exclusive(()=>this.stopListeners());
  }
  async stopListeners(){
    this.store.set('deviceInvite',null);
    for(const s of Object.values(this.store.get('deviceSessions',{})))this.revoke(s.id);
    for(const server of [this.tls,this.publicSetup])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    this.tls=null;this.publicSetup=null;this.settings.enabled=false;this.store.set('sharing',this.settings);
  }
  close(){clearInterval(this.timer);for(const server of [this.tls,this.publicSetup])if(server){server.closeAllConnections();server.close();}}
}
function listen(server,port,host){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});}
function run(command,args,input){return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let errors='';child.stdout.resume();child.stderr.on('data',b=>errors+=b);const timeout=setTimeout(()=>{child.kill();reject(new Error('Certificate preparation timed out'));},45000);child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('close',code=>{clearTimeout(timeout);if(code)reject(new Error(errors.trim()||'Certificate preparation failed'));else resolve();});child.stdin.end(input??'');});}
