import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/blocp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const reports=[];
for(const [name,width,height] of [['small-phone',320,740],['phone',390,844],['phone-landscape',844,390],['tablet',768,1024],['laptop',1366,768],['desktop',1920,1080]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4318');await page.locator('#event-count').filter({hasText:/\d/}).waitFor({state:'attached'});
  await page.screenshot({path:`artifacts/${name}.png`});
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('.mobile-nav button')].map(e=>({name:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),canvas:!!document.querySelector('canvas')}));
  if(width<=820){await page.locator('[data-mobile="watches"]').click();await page.locator('.forecast-row').first().click();await page.getByRole('button',{name:'Close selection'}).click();await page.locator('[data-mobile="research"]').click();await page.getByRole('button',{name:'Close research lab'}).click();}
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#settings-dialog').waitFor();await page.keyboard.press('Escape');
  reports.push({name,...layout,errors});await page.close();
}
const page=await browser.newPage({viewport:{width:1536,height:1024}});await page.goto('http://127.0.0.1:4318');await page.locator('.event-row').first().waitFor();
await page.getByRole('button',{name:'Research lab',exact:true}).click();await page.locator('#replay-date').fill('2011-03-01T00:00');await page.getByRole('button',{name:'Open historical Earth →'}).click();await page.locator('#timeline-time').filter({hasText:'Mar 01'}).waitFor();const replayCount=await page.locator('#event-count').textContent();await page.screenshot({path:'artifacts/replay-2011.png'});await page.locator('[data-hours="-24"]').click();await page.locator('#timeline-time').filter({hasText:'Feb 28'}).waitFor();await page.getByRole('button',{name:'Go live'}).click();await page.locator('#timeline-mode').filter({hasText:'LIVE CATALOG'}).waitFor();
await page.locator('.event-row').nth(0).click();await page.getByRole('button',{name:'Use as first midpoint endpoint'}).click();await page.locator('.event-row').nth(3).click();await page.getByRole('button',{name:'Calculate midpoint with first endpoint'}).click();await page.getByRole('heading',{name:'Between two observations'}).waitFor();await page.screenshot({path:'artifacts/midpoint.png'});
reports.push({replayCount,historicalScrubPassed:true,midpointPassed:true});writeFileSync('artifacts/device-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));await browser.close();
