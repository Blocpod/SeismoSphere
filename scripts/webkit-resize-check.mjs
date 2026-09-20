import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {webkit}=createRequire(import.meta.url)('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:1536,height:1024}});
try{
  await page.setContent('<style>body{margin:0;background:blue}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>');
  await page.evaluate(()=>{const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');function resize(){canvas.width=innerWidth;canvas.height=innerHeight;gl.viewport(0,0,canvas.width,canvas.height);}resize();addEventListener('resize',resize);function draw(){gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);requestAnimationFrame(draw);}draw();});
  async function sample(name){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const png=await page.screenshot({path:'artifacts/webkit-minimal-'+name+'.png'});return page.evaluate(async source=>{const img=new Image();img.src=source;await img.decode();const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);},'data:image/png;base64,'+png.toString('base64'));}
  const before=await sample('before');assert.deepEqual(before,[255,0,0]);await page.setViewportSize({width:390,height:844});const after=await sample('after');
  const report={runtime:'Installed Playwright WebKit on Windows',browserVersion:browser.version(),before,after,resizeRenderingSupported:after[0]>240&&after[2]<15,method:'Plain continuous red WebGL2 clear over blue HTML background. No Three.js or SeismoSphere code. Blue after resize means the compositor omitted the canvas.'};writeFileSync('artifacts/webkit-resize-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
