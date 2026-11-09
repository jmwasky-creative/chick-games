/* 入口：适配、输入绑定 */
(function () {
  'use strict';

  var cv = document.getElementById('cv');
  var app = document.getElementById('app');
  var ctx = cv.getContext('2d');

  window.Game.canvas = cv;
  window.Game.ctx = ctx;

  /* ---------- 缩放适配（精确定位，保证点击命中与画面一致） ---------- */
  var DESIGN_W = 750, DESIGN_H = 1334;
  var cvRect = { left: 0, top: 0, width: DESIGN_W, height: DESIGN_H };

  /* 按 DPR（上限 2）放大画布物理像素，逻辑坐标仍固定 750×1334。
     不这么做的话 iPad / 手机高清屏上画面是糊的。 */
  function applyDpr(s) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var bw = Math.max(1, Math.round(DESIGN_W * s * dpr));
    var bh = Math.max(1, Math.round(DESIGN_H * s * dpr));
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw; cv.height = bh;   // 改尺寸会重置 transform，下面必须重设
    }
    ctx.setTransform(bw / DESIGN_W, 0, 0, bh / DESIGN_H, 0, 0);
  }

  function measure() {
    var r = cv.getBoundingClientRect();
    if (r.width && r.height) cvRect = { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.min(w / DESIGN_W, h / DESIGN_H);
    var x = (w - DESIGN_W * s) / 2;
    var y = (h - DESIGN_H * s) / 2;
    app.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    applyDpr(s);
    // 只在布局变化后测一次 rect：绝不在 rAF / pointermove 里读，避免每帧布局抖动
    measure();
  }

  /* resize 节流 100ms：iPad 分屏拖动会疯狂触发 resize */
  var fitTimer = 0;
  function scheduleFit() {
    if (fitTimer) return;
    fitTimer = setTimeout(function () { fitTimer = 0; fit(); }, 100);
  }
  if (window.ResizeObserver) new ResizeObserver(scheduleFit).observe(document.documentElement);
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 200); });
  fit();

  /* ---------- 坐标转换（屏幕 → 世界坐标） ----------
   * 注意：canvas 画的是 camX 处的视口，所以世界坐标 = 视口内坐标 + camX。
   * 漏掉 camX 会导致相机一滚动，点击位置就整体偏移。
   * rect 走缓存（measure），不再每次 pointermove 都 getBoundingClientRect。
   */
  function toWorld(clientX, clientY) {
    return {
      x: (clientX - cvRect.left) / cvRect.width * DESIGN_W + (window.Game.camX || 0),
      y: (clientY - cvRect.top) / cvRect.height * DESIGN_H
    };
  }

  /* ---------- 画布输入 ---------- */
  var dragging = false;
  cv.addEventListener('pointerdown', function (e) {
    window.SFX.resume();
    if (!window.Game || window.Game.state !== 'play') return;
    e.preventDefault();
    dragging = true;
    var p = toWorld(e.clientX, e.clientY);
    window.Game.tapAt(p.x, p.y);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!dragging || window.Game.state !== 'play') return;
    var p = toWorld(e.clientX, e.clientY);
    window.Game.chick.targetX = Math.max(20, Math.min(window.Game.level.w - 20, p.x));
  });
  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointercancel', function () { dragging = false; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- 发射按钮 ---------- */
  var fb = document.getElementById('fire-btn');
  function fireOn(e) {
    if (e) e.preventDefault();
    window.SFX.resume();
    if (window.Game.state === 'play') window.Game.setFiring(true);
  }
  function fireOff() { window.Game.setFiring(false); }
  fb.addEventListener('pointerdown', fireOn);
  fb.addEventListener('pointerup', fireOff);
  fb.addEventListener('pointercancel', fireOff);
  fb.addEventListener('pointerleave', fireOff);
  window.addEventListener('blur', fireOff);

  /* ---------- 键盘（桌面调试用） ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); fireOn(); }
    if (e.code === 'Escape') window.UI.quitToMenu();
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') fireOff();
  });

  /* ---------- 界面按钮 ---------- */
  var $ = function (id) { return document.getElementById(id); };

  $('btn-start').onclick = function () {
    var s = window.UI.Save.data;
    window.UI.startLevel(Math.min(s.unlocked, 10) - 1);
  };
  $('btn-levels').onclick = function () { window.UI.showLevels(); };
  $('btn-codex').onclick = function () { window.UI.showCodex(); };
  $('btn-sound').onclick = function () {
    var on = !window.SFX.isEnabled();
    window.SFX.setEnabled(on);
    window.UI.Save.data.sound = on;
    window.UI.Save.save();
    $('btn-sound').textContent = '音效：' + (on ? '开' : '关');
  };
  $('btn-lv-back').onclick = function () { window.UI.showMenu(); };
  $('btn-cx-back').onclick = function () { window.UI.showMenu(); };
  $('btn-back').onclick = function () { window.UI.quitToMenu(); };
  $('btn-hint').onclick = function () { window.Game.useHint(); };
  $('btn-pause').onclick = function () { window.UI.pauseGame(); };
  $('btn-resume').onclick = function () { window.UI.resumeGame(); };
  $('btn-pause-retry').onclick = function () { window.UI.startLevel(window.UI.current); };
  $('btn-pause-menu').onclick = function () { window.UI.quitToMenu(); };

  /* ---------- 切后台 / 来电：停主循环与激光，回来再恢复 ---------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      window.Game.setFiring(false);      // 先松手，避免回来还在持续耗电/耗电量条
      window.Game.stop();
    } else {
      window.Game.lastT = performance.now();   // 重设时间基准，避免瞬间补一大段逻辑帧
      window.Game.start();
    }
  });

  /* ---------- 启动 ---------- */
  window.SFX.setEnabled(window.UI.Save.data.sound !== false);
  $('btn-sound').textContent = '音效：' + (window.SFX.isEnabled() ? '开' : '关');
  window.UI.init();

  /* 菜单待机时也跑一个静态场景，避免画布空白 */
  window.Game.load(0);
  window.Game.state = 'idle';
  window.Game.start();
})();
