/* smoke.js —— T16 自动化冒烟测试（playwright-core + 已缓存 chromium）
 * 用法：
 *   env -u NODE_OPTIONS NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-6/bin/node smoke.js
 * ⚠️ 不用系统 Chrome（在本机起不来，SIGTERM/137）
 * ⚠️ 存档测试必须走 http://，file:// 下 localStorage 不可靠
 */
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://127.0.0.1:8765';
const PAGES = [
  ['hub', '/'],
  ['chick-dinner', '/chick-dinner/index.html'],
  ['chick-cola', '/chick-cola/index.html'],
  ['chick-run', '/chick-run/index.html'],
  ['chick-ufo', '/chick-ufo/index.html'],
  ['chick-fan', '/chick-fan/index.html'],
  ['chick-duck-school', '/chick-duck-school/index.html']
];

function launch() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1243/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1208/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium')
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (require('fs').existsSync(p)) return p; } catch (e) {}
  }
  return undefined;   // 交给 playwright 自己解析
}

(async () => {
  const browser = await chromium.launch({
    executablePath: launch(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });

  let totalErrors = 0;

  /* ---------- 第一轮：7 个页面各跑 10 秒，捕获 onerror + console.error ---------- */
  console.log('=== A. 七入口页面错误扫描（每个 10s）===');
  for (const [name, url] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errs = [];
    await page.addInitScript(() => {
      window.__errs = [];
      window.addEventListener('error', (e) => {
        window.__errs.push('onerror: ' + (e.message || e.error));
      });
      window.addEventListener('unhandledrejection', (e) => {
        window.__errs.push('unhandledrejection: ' + e.reason);
      });
      const ce = console.error;
      console.error = function (...a) {
        window.__errs.push('console.error: ' + a.map(String).join(' '));
        try { ce.apply(console, a); } catch (e) {}
      };
    });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(10000);
    const inpage = await page.evaluate(() => window.__errs || []);
    const all = errs.concat(inpage);
    totalErrors += all.length;
    console.log(`  ${name.padEnd(20)} 错误数=${all.length}${all.length ? '  ← 有错！' : '  ✅'}`);
    all.slice(0, 6).forEach((e) => console.log('      ' + String(e).slice(0, 220)));
    await ctx.close();
  }

  /* ---------- 第二轮：小鸭上学记 功能断言 ---------- */
  console.log('\n=== B. 小鸭上学记 功能断言 ===');
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const errs2 = [];
  await page.addInitScript(() => {
    window.__errs = [];
    window.addEventListener('error', (e) => window.__errs.push('onerror: ' + e.message));
    const ce = console.error;
    console.error = function (...a) { window.__errs.push('console.error: ' + a.map(String).join(' ')); try { ce.apply(console, a); } catch (e) {} };
  });
  page.on('pageerror', (e) => errs2.push('pageerror: ' + e.message));
  await page.goto(BASE + '/chick-duck-school/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__duck && window.__duck.ready === true, { timeout: 15000 });

  const R = [];
  function log(k, v) { R.push([k, v]); console.log('  ' + k.padEnd(34) + ' → ' + JSON.stringify(v)); }

  /* B0 启动 */
  log('T01 state()', await page.evaluate(() => __duck.state()));
  log('T01 loopInfo().running', await page.evaluate(() => __duck.loopInfo().running));
  log('T01 gradCount()', await page.evaluate(() => __duck.gradCount()));
  log('T04 姿态表条目数(≥40)', await page.evaluate(() => __duck.posesCount()));
  log('T16 首屏可交互(ms)', await page.evaluate(() => Math.round(performance.now())));

  /* B1 存档破坏三路径 */
  for (const kind of ['json', 'type', 'array', 'null', 'future', 'met']) {
    await page.evaluate((k) => __duck.corruptSave(k), kind);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__duck && window.__duck.ready === true, { timeout: 15000 });
    const st = await page.evaluate(() => ({ state: __duck.state(), unlocked: __duck.save().progress.unlocked }));
    log('A8 corruptSave(' + kind + ')', st);
  }
  await page.evaluate(() => __duck.resetSave());

  /* B2 幕一 */
  await page.evaluate(() => __duck.goto('act1'));
  await page.waitForTimeout(600);
  const skipHit = await page.evaluate(() => {
    const r = __duck.hitTest(900, 40);
    return { hit: r };
  });
  log('A2b ⏩ 跳过热区命中', skipHit);
  await page.waitForTimeout(2600);
  const g0 = await page.evaluate(() => __duck.snoreGain());
  await page.evaluate(() => __duck.skipAct1());
  await page.waitForTimeout(120);
  const g1 = await page.evaluate(() => __duck.snoreGain());
  await page.waitForTimeout(400);
  const g2 = await page.evaluate(() => __duck.snoreGain());
  log('A2b 呼噜增益 跳过前/后/400ms', [g0, g1, g2]);

  /* B3 幕二逐段点击 */
  await page.evaluate(() => __duck.goto('act2'));
  for (let i = 0; i < 6; i++) { await page.evaluate(() => __duck.tap()); await page.waitForTimeout(220); }
  log('A3 幕二四勾', await page.evaluate(() => __duck.save().hygiene));
  log('A1 act2 末步后 state', await page.evaluate(() => __duck.state()));

  /* B4 各关可玩 */
  for (let lv = 1; lv <= 4; lv++) {
    await page.evaluate((l) => __duck.goto('level' + l), lv);
    await page.waitForTimeout(120);
    const before = await page.evaluate(() => __duck.duck().s);
    await page.evaluate(() => __duck.hold(true));
    await page.waitForTimeout(700);
    await page.evaluate(() => __duck.hold(false));
    const after = await page.evaluate(() => ({ s: __duck.duck().s, st: __duck.state() }));
    log('A4 第' + lv + '关前进', { 前: +before.toFixed(1), 后: +after.s.toFixed(1), state: after.st });
  }

  /* B5 跳跃物理 */
  await page.evaluate(() => __duck.goto('level1'));
  await page.waitForTimeout(200);
  const jump = await page.evaluate(async () => {
    const y0 = __duck.duck().y;
    __duck.jump(0);
    let min = y0;
    for (let i = 0; i < 60; i++) { __duck.stepFrames(1); min = Math.min(min, __duck.duck().y); }
    return { y0: +y0.toFixed(1), peak: +(y0 - min).toFixed(1) };
  });
  log('A14 jump(0) 峰高(176±4)', jump);
  const jumpH = await page.evaluate(() => {
    __duck.stepFrames(240);
    const y0 = __duck.duck().y; let min = y0;
    __duck.jump(300);
    for (let i = 0; i < 60; i++) { __duck.stepFrames(1); min = Math.min(min, __duck.duck().y); }
    return +(y0 - min).toFixed(1);
  });
  log('A14 jump(300) 峰高(218±4)', jumpH);

  /* B6 零失败：连撞 50 次 */
  await page.evaluate(() => __duck.goto('level1'));
  await page.waitForTimeout(150);
  const zeroFail = await page.evaluate(() => {
    __duck.warpTo(660);
    for (let i = 0; i < 50; i++) {
      __duck.hold(true);
      __duck.stepFrames(30);
      __duck.hold(false);
      __duck.stepFrames(90);
    }
    return { state: __duck.state(), bumps: __duck.stats().bumps, particles: __duck.particles() };
  });
  log('A4 连撞50次后', zeroFail);

  /* ---------- ★ 第 5 关往返赛制冒烟 ---------- */
  console.log('\n=== C. 第 5 关往返赛制（核心冒烟）===');
  await page.evaluate(() => __duck.resetSave());
  await page.evaluate(() => __duck.goto('level5'));
  await page.waitForTimeout(200);

  const c1 = await page.evaluate(() => ({
    state: __duck.state(), sub: __duck.subState(), seg: __duck.segName(),
    segLen: __duck.segLen(), cruise: __duck.cruise(), arrow: __duck.arrowDir()
  }));
  console.log('  C1 去程初始          → ' + JSON.stringify(c1));

  /* 去程：warp 到校门前 100px，然后正常跑 */
  await page.evaluate(() => __duck.warpTo(4600));
  await page.evaluate(() => __duck.hold(true));
  await page.waitForFunction(() => __duck.subState() === 'midEvent', { timeout: 12000 });
  await page.evaluate(() => __duck.hold(false));
  const c2 = await page.evaluate(() => ({
    sub: __duck.subState(), state: __duck.state(),
    ck: __duck.l5checkpoint(),
    resultPanelVisible: !!document.querySelector('#screen-result.show'),
    stats: __duck.stats()
  }));
  console.log('  C2 到达校门触发中途事件 → ' + JSON.stringify(c2));

  /* ★ A7b②/R3：中途事件不得弹结算面板、不得给星 */
  const c3 = await page.evaluate(() => ({
    screenResult: !!document.querySelector('#screen-result.show'),
    cleared5: __duck.save().progress.cleared['5'] || null,
    stars: __duck.save().progress.cleared['5'] ? __duck.save().progress.cleared['5'].stars : 0
  }));
  console.log('  C3 ★R3 去程不给星/不弹面板 → ' + JSON.stringify(c3));

  /* 等中途事件自然结束 → goBack */
  await page.waitForFunction(() => __duck.subState() === 'goBack', { timeout: 8000 });
  const c4 = await page.evaluate(() => ({
    sub: __duck.subState(), seg: __duck.segName(),
    segLen: __duck.segLen(),        /* ★ 必须是 3000，不是 3600 */
    cruise: __duck.cruise(),        /* 280 */
    arrow: __duck.arrowDir(),       /* ★ 必须 left */
    ck: __duck.l5checkpoint(),      /* phase inbound */
    obstacles: __duck.obstacles().length
  }));
  console.log('  C4 ★回程参数（长度/箭头）→ ' + JSON.stringify(c4));

  /* 关卡数据直接核对（回程 5 障碍、间距 420–560、无冲刺带） */
  const c5 = await page.evaluate(() => {
    const lv = Levels.get(4);
    const io = lv.inbound.obstacles.map((o) => o.s);
    const gaps = []; for (let i = 1; i < io.length; i++) gaps.push(io[i] - io[i - 1]);
    const oo = lv.outbound.obstacles;
    const maxO = Math.max.apply(null, oo.map((o) => o.s));
    const minI = Math.min.apply(null, io);
    return {
      outLen: lv.outbound.segLen, inLen: lv.inbound.segLen,
      outCount: oo.length, inCount: io.length,
      inGaps: gaps, boostOut: lv.outbound.boost, boostIn: lv.inbound.boost,
      outSafeTailOk: maxO <= lv.outbound.segLen - lv.outbound.safeTail,
      inSafeTailOk: minI >= lv.inbound.segLen - lv.inbound.safeTail,
      inArrows: lv.inbound.arrows, inCruise: lv.inbound.cruise,
      stars: lv.stars, bumpCap: lv.bumpCap
    };
  });
  console.log('  C5 ★回程数据(R4/R5)      → ' + JSON.stringify(c5));

  /* 回程跑完 → 结算 */
  await page.evaluate(() => __duck.warpTo(2850));
  await page.evaluate(() => __duck.hold(true));
  await page.waitForFunction(() => __duck.subState() === 'clear', { timeout: 12000 });
  await page.evaluate(() => __duck.hold(false));
  await page.waitForTimeout(3200);
  const c6 = await page.evaluate(() => ({
    sub: __duck.subState(), state: __duck.state(),
    ck: __duck.l5checkpoint(),
    cleared5: __duck.save().progress.cleared['5'] || null,
    resultVisible: !!document.querySelector('#screen-result.show'),
    l5out: __duck.save().stats.l5out, l5back: __duck.save().stats.l5back,
    team: __duck.team().map((m) => m.id)
  }));
  console.log('  C6 ★跑回起点→结算       → ' + JSON.stringify(c6));

  /* ★ D7：回程 3000px 时长测算 */
  const c7 = await page.evaluate(() => {
    const lv = Levels.get(4);
    const outT = lv.outbound.segLen / lv.outbound.cruise;   /* 去程纯跑动 */
    const inT = lv.inbound.segLen / lv.inbound.cruise;      /* 回程纯跑动 */
    return {
      去程纯跑秒: +outT.toFixed(1), 回程纯跑秒: +inT.toFixed(1),
      第5关合计秒: +(outT + inT).toFixed(1), 三星门槛秒: lv.stars[0]
    };
  });
  console.log('  C7 ★D7 时长测算         → ' + JSON.stringify(c7));

  /* A9 零外链（页面内自查） */
  const a9 = await page.evaluate(() => {
    const src = document.documentElement.outerHTML;
    const hits = src.match(/https?:\/\/[^"'\s)]+/g) || [];
    return { 外链数: hits.length, 样例: hits.slice(0, 5) };
  });
  log('A9 页内零外链', a9);

  /* 渐变缓存不增长 */
  const g1c = await page.evaluate(() => __duck.gradCount());
  await page.waitForTimeout(3000);
  const g2c = await page.evaluate(() => __duck.gradCount());
  log('T15 gradCount 3s 内不增长', [g1c, g2c, g1c === g2c]);

  const errsAll = errs2.concat(await page.evaluate(() => window.__errs || []));
  totalErrors += errsAll.length;
  console.log('\n=== D. 功能测试阶段错误数 = ' + errsAll.length + ' ===');
  errsAll.slice(0, 10).forEach((e) => console.log('   ' + String(e).slice(0, 240)));

  await ctx.close();
  await browser.close();

  console.log('\n========================================');
  console.log('全部页面错误总数 = ' + totalErrors + (totalErrors === 0 ? '  ✅ 期望 0' : '  ❌'));
  console.log('========================================');
  process.exit(totalErrors === 0 ? 0 : 2);
})().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
