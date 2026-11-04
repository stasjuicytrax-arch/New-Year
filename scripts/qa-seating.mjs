import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const site = process.env.QA_SITE || 'http://localhost:4183/';
const production = new URL(site).hostname !== 'localhost';
const fixture = process.env.QA_STATUS_FILE
  ? JSON.parse(await readFile(process.env.QA_STATUS_FILE, 'utf8')).seats
  : { '12-1': 'booked', '12-2': 'held', '10-6': 'booked' };
const viewports = [[360,740],[375,812],[375,940],[390,844],[412,915],[430,932],[768,1024],[1023,800],[1024,800],[1366,650],[1440,800],[1920,950]];
const server = production ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
const results = [];
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(site)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch();
  for (let i = 0; i < viewports.length; i += 2) {
    await Promise.all(viewports.slice(i, i + 2).map(async ([width, height]) => {
      const name = `${width}x${height}`;
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024, deviceScaleFactor: width < 1024 ? 3 : 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      const posts = [];
      let seats = { ...fixture };
      // Every booking request is intercepted, including when checking the deployed website.
      await ctx.route('https://functions.yandexcloud.net/**', (route) => {
        if (route.request().method() === 'POST') posts.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, seats }) });
      });
      await ctx.addInitScript(() => sessionStorage.setItem('gnn-preloaded', '1'));
      page.on('pageerror', (e) => errors.push(e.message));
      const dir = `qa/seating-approved/${production ? 'production' : 'local'}/${name}`;
      await mkdir(dir, { recursive: true });
      try {
        await page.goto(site, { waitUntil: 'networkidle' });
        await page.locator('[data-view-btn="schema"]').click();
        await page.waitForFunction((count) => document.querySelectorAll('.seat.is-booked,.seat.is-held').length === count, Object.keys(fixture).length);
        assert.equal(await page.locator('.seat').count(), 120);
        assert.equal(await page.locator('.seat__no').count(), 120);
        const layout = await page.evaluate(() => {
          const svg = document.querySelector('.hallmap');
          const door = document.querySelector('.hall__door .hall__gap').getBoundingClientRect();
          const table = document.querySelector('.tbl[data-table="11"] .tbl__body').getBoundingClientRect();
          return {
            doorGap: svg.dataset.orient === 'h' ? Math.abs((door.left + door.right - table.left - table.right) / 2) : Math.abs((door.top + door.bottom - table.top - table.bottom) / 2),
            kidsHeight: document.querySelector('.kids').getBoundingClientRect().height,
          };
        });
        assert.ok(layout.doorGap <= 2, 'Entrance stays aligned with table 11');
        if (width >= 1024) assert.ok(layout.kidsHeight <= 96, 'Children ticket row stays compact');
        for (const [key, value] of Object.entries(fixture)) {
          const [t, s] = key.split('-');
          const seat = page.locator(`.seat[data-t="${t}"][data-s="${s}"]`);
          assert.equal(await seat.getAttribute('aria-disabled'), 'true', key);
          assert.ok((await seat.getAttribute('class')).includes(`is-${value}`));
        }
        await page.locator('[data-map]').screenshot({ path: `${dir}/map.png`, scale: 'css' });
        // All 120 enlarged chairs must keep the map's position, label and status.
        for (let n = 1; n <= 15; n++) {
          await page.locator('[data-openlist]').click();
          const row = page.locator(`[data-open="${n}"]:visible`).first();
          await row.click();
          assert.equal(await page.locator('#table-card').isVisible(), true);
          const checks = await page.evaluate((table) => {
            const g = document.querySelector(`.tbl[data-table="${table}"]`);
            const tb = g.querySelector('.tbl__body');
            const tx = Number(tb.getAttribute('cx'));
            const ty = Number(tb.getAttribute('cy'));
            const dialog = document.querySelector('#table-card');
            const frame = dialog.getBoundingClientRect();
            return [...dialog.querySelectorAll('[data-cs]')].map((button) => {
              const seat = g.querySelector(`.seat[data-s="${button.dataset.cs}"]`);
              const hit = seat.querySelector('.seat__hit');
              const dx = Number(hit.getAttribute('cx')) - tx;
              const dy = Number(hit.getAttribute('cy')) - ty;
              const b = button.getBoundingClientRect();
              const cx = (b.left + b.right) / 2;
              const cy = (b.top + b.bottom) / 2;
              return {
                number: button.textContent,
                seat: button.dataset.cs,
                aligned: Math.abs(parseFloat(button.style.left) - (50 + dx)) < 0.07 && Math.abs(parseFloat(button.style.top) - (50 + dy)) < 0.07,
                disabled: button.disabled === (seat.getAttribute('aria-disabled') === 'true'),
                inside: b.left >= frame.left - 1 && b.right <= frame.right + 1 && b.top >= frame.top && b.bottom <= frame.bottom,
                touch: b.width >= 44 && b.height >= 44,
                topmost: document.elementFromPoint(cx, cy)?.closest('[data-cs]') === button,
              };
            });
          }, n);
          for (const c of checks) {
            assert.equal(c.number, c.seat);
            assert.ok(c.aligned, `${n}-${c.seat} card/map alignment`);
            assert.ok(c.disabled, `${n}-${c.seat} card/map status`);
            assert.ok(c.inside && c.touch, `${n}-${c.seat} visible touch target`);
            // Disabled native buttons still occupy the correct geometric target.
            assert.ok(c.topmost, `${n}-${c.seat} chair is not covered`);
          }
          assert.equal(checks.length, 8);
          if ([1,5,12].includes(n)) await page.locator('#table-card').screenshot({ path: `${dir}/table-${n}.png`, scale: 'css' });
          await page.locator('[data-cardclose]').click();
        }
        if (width < 1024) {
          // Drive synthesized touch, not only desktop mouse clicks in a narrow viewport.
          await page.locator('.tbl__hit[data-hit="12"]').tap();
          assert.equal(await page.locator('#table-card').isVisible(), true);
          const button = page.locator('#table-card [data-cs]:not([disabled])').first();
          const seat = await button.getAttribute('data-cs');
          await button.tap();
          assert.equal(await page.locator(`.seat[data-t="12"][data-s="${seat}"]`).getAttribute('aria-pressed'), 'true');
          await page.locator(`#table-card [data-cs="${seat}"]`).tap();
          await page.locator('[data-cardclose]').tap();
        }
        const [key] = await page.locator('.seat:not([aria-disabled])').evaluateAll((els) => els.map((e) => `${e.dataset.t}-${e.dataset.s}`));
        const [t, s] = key.split('-');
        const chair = page.locator(`.seat[data-t="${t}"][data-s="${s}"]`);
        await chair.press('Enter');
        assert.equal(await chair.getAttribute('aria-pressed'), 'true');
        // Rebuild across the desktop breakpoint without losing selection or occupied seats.
        await page.setViewportSize({ width: width >= 1024 ? 390 : 1440, height: 844 });
        assert.equal(await chair.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.seat.is-booked,.seat.is-held').count(), Object.keys(fixture).length);
        await page.setViewportSize({ width, height });
        await page.locator('#seats-panel [data-open-booking]').click();
        assert.equal(await page.locator('#booking-dialog').isVisible(), true);
        assert.match(await page.locator('[data-choice-sel]').innerText(), new RegExp(`Стол ${t}`));
        await page.locator('#booking-dialog').screenshot({ path: `${dir}/booking.png`, scale: 'css' });
        await page.locator('#booking-form [name="name"]').fill('Проверка схемы');
        await page.locator('#booking-form [name="phone"]').fill('79000000000');
        await page.locator('#booking-form [name="consent"]').check();
        await page.locator('#booking-form [type="submit"]').click();
        await page.waitForFunction(() => document.querySelector('#booking-form').hidden);
        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0].seats.map(({ table, seat }) => `${table}-${seat}`), [key]);
        // Simulate organizer cancellation and refresh; all other statuses must remain intact.
        const released = Object.keys(seats)[0];
        if (released) {
          await page.locator('#booking-dialog [data-bk-close]:visible').first().click();
          delete seats[released];
          await page.waitForTimeout(3100);
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          await page.waitForFunction((count) => document.querySelectorAll('.seat.is-booked,.seat.is-held').length === count, Object.keys(seats).length);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
        assert.deepEqual(errors, []);
        results.push({ viewport: name, passed: true, checkedSeats: 120, preservedStatuses: Object.keys(fixture).length, interceptedPosts: posts.length });
      } catch (e) {
        await page.screenshot({ path: `${dir}/failure.png`, scale: 'css' }).catch(() => {});
        results.push({ viewport: name, passed: false, error: e.message });
      } finally { await ctx.close(); }
    }));
    console.log(JSON.stringify(results.slice(-2)));
  }
} finally {
  await browser?.close();
  server?.kill();
}
await writeFile(`qa/seating-approved/${production ? 'production' : 'local'}-results.json`, JSON.stringify(results, null, 2));
if (results.some((r) => !r.passed)) process.exitCode = 1;
