// 端對端測試＋截圖：洗衣機頁與手錶頁都要能開、無主控台錯誤、390px 寬不得橫向捲動。
// 需求：playwright-core（可在倉庫外 npm i playwright-core 後以 NODE_PATH 指入）與 Chrome。
// 環境變數：CHROME＝瀏覽器路徑（預設 /usr/bin/google-chrome）；SCREENSHOT_DIR＝截圖輸出目錄（未設定則不截圖）。
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SCREENSHOT_DIR || null;
const shot = (page, name, fullPage = false) => (OUT ? page.screenshot({ path: join(OUT, name), fullPage }) : Promise.resolve());
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0]));
  if (p === '/' || p === '\\') p = '/index.html';
  try {
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(8255, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let failures = 0;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  return { page, errors };
}

// ---- 洗衣機頁：390px ----
{
  const { page, errors } = await newPage({ width: 390, height: 844 });
  await page.goto('http://localhost:8255/washer.html');
  await page.waitForTimeout(300);
  check('洗衣機頁（390px）可開啟且有標題', (await page.textContent('h1')).includes('惠而浦洗衣機按鍵模擬器'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('洗衣機頁 390px 無橫向捲動（scrollWidth <= 390）', sw <= 390, `scrollWidth=${sw}`);
  check('洗衣機頁無主控台錯誤', errors.length === 0, errors.join('; '));
  check('洗衣機頁有手冊連結', await page.locator('a[href*="owners-manual-w11590301"]').count() > 0);
  check('洗衣機頁可切回手錶版', await page.locator('a[href="index.html"]').count() > 0);
  await shot(page, 'washer-390px.png'); // 第一屏（含標題），在互動前拍
  // 互動冒煙測試：喚醒→開始→燈號
  await page.click('#startBtn', { delay: 50 });
  check('短按喚醒後進入可設定，不直接洗衣', (await page.textContent('#simState')).includes('可設定'));
  await page.click('#startBtn', { delay: 50 });
  const state = await page.textContent('#simState');
  check('再短按後開始進水', state.includes('運轉中') && state.includes('進水'));
  check('進水燈亮', await page.locator('.light:has-text("進水") .led.on').count() === 1);
  await page.close();
}

// ---- 洗衣機頁：桌面寬 ----
{
  const { page, errors } = await newPage({ width: 1280, height: 900 });
  await page.goto('http://localhost:8255/washer.html');
  await page.waitForTimeout(300);
  check('洗衣機頁（桌面寬）無主控台錯誤', errors.length === 0, errors.join('; '));
  await shot(page, 'washer-desktop.png', true);
  await page.close();
}

// ---- 手錶頁未損壞：390px ----
{
  const { page, errors } = await newPage({ width: 390, height: 844 });
  await page.goto('http://localhost:8255/index.html');
  await page.waitForTimeout(500);
  check('手錶頁（390px）可開啟且有標題', (await page.textContent('h1')).includes('Garmin 按鍵模擬器'));
  check('手錶頁無主控台錯誤', errors.length === 0, errors.join('; '));
  check('手錶頁有五顆按鍵', await page.locator('.btn').count() === 5);
  check('手錶頁有洗衣機版切換連結', await page.locator('a[href="washer.html"]').count() > 0);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('手錶頁 390px 無橫向捲動（scrollWidth <= 390）', sw <= 390, `scrollWidth=${sw}`);
  await shot(page, 'watch-390px.png'); // 第一屏，在互動前拍
  // 互動冒煙測試：短按 START 進入活動清單
  await page.locator('.btn[aria-label="START"]').click({ delay: 50 });
  await page.waitForTimeout(200);
  check('手錶頁短按 START 有反應（操作記錄更新）', (await page.textContent('#log')).includes('START'));
  await page.close();
}

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(failures === 0 ? '\n全部端對端測試通過' : `\n有 ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
