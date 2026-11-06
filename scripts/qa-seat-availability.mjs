import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.QA_SITE || 'http://localhost:4185/';
const remote = new URL(url).hostname !== 'localhost';
const server = remote ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4185', '--strictPort'], { stdio: 'ignore' });
const widths = [[360,740],[375,812],[375,940],[390,844],[412,915],[430,932],[768,1024],[1023,800],[1024,800],[1366,650],[1440,800],[1920,950]];
const results = [];
let browser;
try {
  for (let i=0;i<40;i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
  browser = await chromium.launch();
  for(let i=0;i<widths.length;i+=3) await Promise.all(widths.slice(i,i+3).map(async ([width,height])=>{
    const fixture={'3-1':'booked','3-2':'booked','3-3':'booked','3-4':'booked','3-5':'booked','3-6':'booked','3-7':'booked','12-2':'held'};
    const name=`${width}x${height}`;
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<1024,isMobile:width<1024,reducedMotion:'reduce'});
    const page=await ctx.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(45000);
    await ctx.addInitScript(()=>sessionStorage.setItem('gnn-preloaded','1'));
    let mode='wait'; let release; const waiting=new Promise(r=>{release=r;}); let gets=0; let posts=0;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await ctx.route('https://functions.yandexcloud.net/**',async route=>{
      if(route.request().method()!=='GET'){posts++;return route.abort();}
      gets++;
      if(mode==='wait') await waiting;
      if(mode==='network') return route.abort('failed');
      if(mode==='timeout') return;
      const body=mode==='invalid'?{ok:true,seats:{'3-1':'unknown'}}:mode==='missing'?{ok:true}:mode==='error'?{ok:false}:{ok:true,seats:fixture};
      return route.fulfill({status:mode==='error'?503:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
    });
    const dir=`qa/seat-availability/${remote?'production':'local'}/${name}`;await mkdir(dir,{recursive:true});
    const ready=()=>page.waitForFunction(()=>document.querySelector('#seats').dataset.availability==='ready');
    const failed=()=>page.waitForFunction(()=>document.querySelector('#seats').dataset.availability==='error');
    const retry=()=>page.locator('.seats__mapcol > [data-availability] [data-status-retry]').click();
    const refresh=async()=>{await page.waitForTimeout(3100);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));};
    try{
      await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('.seat');
      assert.equal(await page.locator('.seat[aria-disabled="true"]').count(),120,'Initial request must block all chairs');
      await page.locator('.seat[data-t="1"][data-s="1"]').dispatchEvent('keydown',{key:'Enter'});
      assert.equal(await page.locator('.seat.is-sel').count(),0);
      await page.locator('[data-openlist]').click();await page.locator('#tables-dialog [data-open="3"]').click();
      assert.equal(await page.locator('#table-card [data-cs]:disabled').count(),8);
      assert.doesNotMatch(await page.locator('#table-card').innerText(),/свободно \d/);
      await page.locator('#table-card').screenshot({path:`${dir}/loading.png`,scale:'css'});
      mode='error';release();await failed();
      await page.locator('#table-card').screenshot({path:`${dir}/error-card.png`,scale:'css'});
      await page.locator('[data-cardclose]').click();
      await page.locator('.seats__mapcol > [data-availability]').screenshot({path:`${dir}/error-banner.png`,scale:'css'});
      for(const failure of ['network','invalid','missing']){
        mode=failure;await retry();await failed();assert.equal(await page.locator('.seat[aria-disabled="true"]').count(),120);
      }
      mode='valid';await retry();await ready();
      assert.equal(await page.locator('.seat.is-booked').count(),7);assert.equal(await page.locator('.seat.is-held').count(),1);
      assert.equal(await page.locator('.seat__no').count(),120);
      const seat=page.locator('.seat[data-t="1"][data-s="1"]');await seat.press('Enter');
      await page.locator('#seats-panel [data-open-booking]').click();
      assert.equal(await page.locator('#booking-dialog').isVisible(),true);
      mode='error';await refresh();await failed();
      assert.equal(await page.locator('.seat.is-booked').count(),7,'Never erase confirmed statuses on a failed refresh');
      assert.equal(await seat.getAttribute('aria-pressed'),'true','Preserve existing selection');
      await page.locator('#booking-form').dispatchEvent('submit');
      assert.equal(posts,0,'Unavailable status prevents submission even through an open form');
      assert.match(await page.locator('#booking-form [data-status]').innerText(),/Не удалось проверить/);
      assert.equal(await page.locator('[data-bk-availability]').isVisible(),true);
      mode='valid';await page.locator('[data-bk-status-retry]').click();await ready();assert.equal(await seat.getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-bk-availability]').isVisible(),false);
      await page.locator('#booking-dialog [data-bk-close]').first().click();
      fixture['1-1']='booked';await refresh();await ready();
      assert.equal(await seat.getAttribute('aria-pressed'),'false','Refresh removes a seat now booked by someone else');
      if(width===360){mode='timeout';await refresh();await failed();assert.equal(await page.locator('.seat[aria-disabled="true"]').count(),120,'Timeout must block selection');}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
      assert.deepEqual(errors,[]);
      results.push({viewport:name,passed:true,gets,posts});
    }catch(e){await page.screenshot({path:`${dir}/failure.png`,scale:'css'}).catch(()=>{});results.push({viewport:name,passed:false,error:e.message});}
    finally{await ctx.close();}
    console.log(JSON.stringify(results.at(-1)));
  }));
}finally{await browser?.close();server?.kill();}
await writeFile(`qa/seat-availability/${remote?'production':'local'}-results.json`,JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
