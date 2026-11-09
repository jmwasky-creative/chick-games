/* ===== src/js/90-main.js · 入口：DPR / 主循环 / 输入 / 键盘 / visibilitychange / __duck 钩子 =====
 * ⚠️ 全项目**唯一一处** requestAnimationFrame 续帧。多处 rAF 会导致帧率翻倍。
 * ⚠️ getBoundingClientRect 只在 fit() 之后测一次，绝不在 pointermove / rAF 里调。
 * ⚠️ canvas.width 改尺寸会重置 transform，改完必须 ctx.setTransform。
 * ⚠️ __duck 必须在 startLoop() 之前挂载，且同步返回、绝不抛异常。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var S = global.Save;
  var A = global.Audio;
  var G = global.Game;
  var R = global.Render;
  var UI = global.UI;
  var St = global.Story;
  var L = global.Levels;

  var cv = document.getElementById('cv');
  var app = document.getElementById('app');
  var stage = document.getElementById('stage');
  var ctx = cv.getContext('2d');

  var PORTRAIT = window.innerHeight > window.innerWidth;
  var DESIGN_W = K.DESIGN_W;
  var DESIGN_H = PORTRAIT ? K.DESIGN_H_PORTRAIT : K.DESIGN_H;
  var cvRect = { left: 0, top: 0, width: DESIGN_W, height: DESIGN_H };
  var lastFit = -1, lastDpr = -1;

  /* ================= 布局适配 ================= */
  function applyDpr(s) {
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var bw = Math.max(1, Math.round(DESIGN_W * s * dpr));
    var bh = Math.max(1, Math.round(DESIGN_H * s * dpr));
    /* 只在真的变了才改尺寸：canvas.width 每次改都会清屏 + 重分配显存 */
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw; cv.height = bh;
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
    /* 只有真的变了才重设画布尺寸（踩坑：resize 抖动持续重分配显存） */
    if (Math.abs(s - lastFit) > 0.002 || lastFit < 0) {
      lastFit = s;
      var x = (w - DESIGN_W * s) / 2;
      var y = (h - DESIGN_H * s) / 2;
      app.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
      applyDpr(s);
    }
    /* 布局变化后测一次 rect，之后不再读 */
    measure();
    R.setView(DESIGN_W, DESIGN_H);
  }

  var fitTimer = 0;
  function scheduleFit() {
    if (fitTimer) return;
    fitTimer = setTimeout(function () { fitTimer = 0; onResize(); }, 100);
  }

  function onResize() {
    var p = window.innerHeight > window.innerWidth;
    if (p !== PORTRAIT) {
      PORTRAIT = p;
      DESIGN_H = p ? K.DESIGN_H_PORTRAIT : K.DESIGN_H;
      document.body.classList.toggle('portrait', p);
      lastFit = -1;
      S.data.stats.orientation = p ? 'portrait' : 'landscape';
      S.flush();
    }
    fit();
    if (p && !S.data.settings.rotTipShown) UI.maybeShowRotTip();
  }

  /* ================= 主循环（全项目唯一） ================= */
  var raf = 0, last = 0, acc = 0, running = false;
  var fpsWin = { frames: 0, t0: 0, fps: 0 };
  var stepsLastFrame = 0, accMs = 0;

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (!last) { last = t; }
    var dtMs = t - last;
    last = t;
    if (dtMs > 250) dtMs = 250;            /* 切后台回来/长卡顿钳制 */
    acc += dtMs / 1000;
    accMs = dtMs;
    var fdt = dtMs / 1000;

    /* 音频时钟与呼噜增益镜像按**真实** dt 走（不参与固定步长 ——
       音频是连续量，切成 1/120 的碎步只会让淡出曲线出现台阶） */
    A.advance(fdt);

    var steps = 0;
    while (acc >= K.FIXED_DT && steps < K.MAX_STEPS) {
      G.step(K.FIXED_DT);
      acc -= K.FIXED_DT;
      steps++;
    }
    /* 追不上就丢弃累加器余量，绝不无限追帧 */
    if (steps === K.MAX_STEPS) acc = 0;
    stepsLastFrame = steps;

    R._dt = fdt;
    R.frame(steps > 0 ? acc / K.FIXED_DT : 0);

    fpsWin.frames++;
    if (!fpsWin.t0) fpsWin.t0 = t;
    if (t - fpsWin.t0 >= 500) {
      fpsWin.fps = Math.round(fpsWin.frames * 1000 / (t - fpsWin.t0));
      fpsWin.frames = 0; fpsWin.t0 = t;
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    last = 0; acc = 0;
    fpsWin.t0 = 0; fpsWin.frames = 0;
    raf = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ================= 输入：Pointer Events（多点只取第一个） ================= */
  var activePointerId = null;
  var holdStart = 0, holdMs = 0, downX = 0, downY = 0, moved = false;

  function toLogical(clientX, clientY) {
    return {
      x: (clientX - cvRect.left) / cvRect.width * DESIGN_W,
      y: (clientY - cvRect.top) / cvRect.height * DESIGN_H
    };
  }
  /** 屏幕坐标 → 进度 s（与 worldToScreenX 互逆，误差 <2px） */
  function clientToWorld(clientX, clientY) {
    var p = toLogical(clientX, clientY);
    return { s: R.xToS(p.x), y: p.y, lx: p.x, ly: p.y };
  }

  /** 操作热区判定：横屏全屏；竖屏下方 62%（上方 38% 只响应显式按钮），剧情幕例外允许上方 */
  function inPlayZone(ly) {
    if (!PORTRAIT) return true;
    if (G.state === 'act1' || G.state === 'act2') return true;   /* D10：剧情幕允许点上方 38% */
    return ly >= DESIGN_H * K.PLAY_ZONE_RATIO;
  }

  function onDown(e) {
    if (activePointerId !== null) return;         /* 多点只取第一个 */
    activePointerId = e.pointerId;
    A.unlock();
    var p = toLogical(e.clientX, e.clientY);
    downX = p.x; downY = p.y; moved = false;
    holdStart = nowMs();
    holdMs = 0;
    try { e.preventDefault(); } catch (err) {}

    /* 1) canvas 内可点元素（⏩ 跳过 / ❚❚ 暂停）——热区 ≥44px */
    var hit = R.hitTest(p.x, p.y);
    if (hit === 'skip') { St.skipAct1(); holdMs = 0; activePointerId = null; return; }
    if (hit === 'pause') { UI.showPause(); activePointerId = null; return; }

    /* 2) 剧情幕：点击推进（幕一第一次点击 = 入睡，之后 = 跳过） */
    if (G.state === 'act1' || G.state === 'act2') {
      St.tap();
      activePointerId = null;
      return;
    }
    /* 3) 幕三：按住 = 前进 */
    if (G.state === 'act3' && inPlayZone(p.y)) {
      G.setInput({ holding: true });
    }
  }

  function onMove(e) {
    if (e.pointerId !== activePointerId) return;
    var p = toLogical(e.clientX, e.clientY);
    if (Math.abs(p.x - downX) > K.TAP_MOVE_TOL || Math.abs(p.y - downY) > K.TAP_MOVE_TOL) moved = true;
  }

  function onUp(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    var dt = nowMs() - holdStart;
    holdMs = dt;
    if (G.state === 'act3') {
      G.setInput({ holding: false, holdMs: dt });
      /* 点击 = 跳跃：位移 <12px 且时长 <220ms（PRD §6.1）；抬手才判定，支持蓄力跳 */
      if (!moved && dt < K.TAP_TIME_TOL) G.setInput({ tapEdge: true });
    }
  }
  function onCancel(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    if (G.state === 'act3') G.setInput({ holding: false, holdMs: 0 });
  }

  function bindPointer() {
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ================= 键盘（A13） ================= */
  var keyHold = {};
  function bindKeys() {
    window.addEventListener('keydown', function (e) {
      A.unlock();
      var k = e.key;
      if (k === 'Escape') {
        if (G.state === 'paused') UI.resumeGame();
        else if (G.state === 'act1' || G.state === 'act2' || G.state === 'act3') UI.showPause();
        else if (UI.currentScreen() && UI.currentScreen() !== 'title') UI.showTitle();
        return;
      }
      if (k === 'r' || k === 'R') { UI.hideAll(); UI.startLevel(Math.max(0, G.levelIndex)); return; }
      if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        e.preventDefault();
        if (G.state === 'act1') { St.skipAct1(); return; }
        if (G.state === 'act2') { St.tap(); return; }
        if (G.state === 'act3') { G.setInput({ holding: true, tapEdge: true, holdMs: 200 }); }
        return;
      }
      if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        if (G.state === 'act3') G.setInput({ holding: true });
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        if (G.state === 'act3') G.setInput({ holding: false });
      }
      void keyHold;
    });
  }

  /* ================= visibilitychange ================= */
  function onVisibility() {
    if (document.hidden) {
      G.setInput({ holding: false });
      stopLoop();
      A.pauseClock();
      /* L5 回程中途切后台：立即刷写 checkpoint（R1） */
      try {
        if (G.level && G.level.roundTrip && (G.subState === 'goBack' || G.subState === 'midEvent')) {
          S.checkpoint({ phase: G.subState === 'goBack' ? 'inbound' : 'mid', segTimeMs: G.segTimeMs, bumps: G.bumps, met: G.met.slice() });
        }
      } catch (e) {}
    } else {
      last = 0;                       /* 重取时间基准，回来不补一大段物理帧 */
      acc = 0;
      A.resumeClock();
      startLoop();
    }
  }

  /* ================= 测试钩子 window.__duck（26 个契约方法 + QA 辅助，同步返回，绝不抛） ================= */
  function nowMs() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  /** 面朝方向：vx 决定；静止时沿用 lastFace（停下不该突然转身） */
  function facing() {
    try {
      var d = G.duck;
      if (!d) return 1;
      if (Math.abs(d.vx) > 5) return d.vx > 0 ? 1 : -1;
      return d.lastFace || 1;
    } catch (e) { return 1; }
  }

  var duck = {
    ready: true,
    version: K.VERSION,

    state: function () { try { return G.state; } catch (e) { return null; } },

    subState: function () { try { return (G.level && G.level.roundTrip) ? G.subState : '-'; } catch (e) { return '-'; } },

    level: function () { try { return G.level ? G.level.id : 0; } catch (e) { return 0; } },

    duck: function () {
      try {
        var d = G.duck;
        if (!d) return null;
        return {
          s: d.s, x: R.sToX(d.s), y: d.y, vy: d.vy, vx: d.vx,
          grounded: d.grounded, facing: facing(), dir: G.dir, pose: G.animState()
        };
      } catch (e) { return null; }
    },
    cam: function () { try { return { s: G.camS }; } catch (e) { return null; } },
    progress: function () {
      try {
        var seg = G.seg;
        if (!seg) return null;
        return { segLen: seg.segLen, s: G.duck.s, pct: Math.max(0, Math.min(1, G.duck.s / seg.segLen)) };
      } catch (e) { return null; }
    },
    obstacles: function () {
      try {
        var out = [];
        for (var i = 0; i < G.obstacles.length; i++) {
          var o = G.obstacles[i];
          var x = R.sToX(o.s);
          if (x > -200 && x < R.viewW() + 200) out.push({ s: o.s, type: o.type, w: o.w, h: o.h, solid: o.solid });
        }
        return out;
      } catch (e) { return null; }
    },
    team: function () {
      try {
        var t = [];
        for (var i = 0; i < G.team.length; i++) t.push({ id: G.team[i].id, s: G.team[i].s || 0 });
        return t;
      } catch (e) { return null; }
    },
    met: function () { try { return G.met.slice(); } catch (e) { return []; } },
    stats: function () {
      try {
        return {
          bumps: G.bumps, segTimeMs: Math.round(G.segTimeMs), totalTimeMs: Math.round(G.totalTimeMs),
          assistCount: G.assistCount, stuckCount: S.data.stats.stuckCount, level: G.level ? G.level.id : 0
        };
      } catch (e) { return null; }
    },
    save: function () { try { return S.data; } catch (e) { return null; } },
    saveRaw: function () { try { return S.saveRaw(); } catch (e) { return null; } },
    resetSave: function () { try { S.reset(); return true; } catch (e) { return false; } },
    corruptSave: function (kind) { try { return S.corruptSave(kind); } catch (e) { return false; } },

    /** 触发一次跳跃（可选蓄力 ms）。走完整物理路径，可被 __duck.duck() 采样验证 */
    jump: function (holdMsValue) {
      try {
        if (!G.duck) return false;
        G.setInput({ tapEdge: true, holding: false, holdMs: holdMsValue || 0 });
        return true;
      } catch (e) { return false; }
    },
    hold: function (on) { try { G.setInput({ holding: !!on }); return true; } catch (e) { return false; } },
    /** 模拟一次完整点击（走 pointer 事件链） */
    tap: function () {
      try {
        var r = cv.getBoundingClientRect();
        var cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.75;
        var opts = { pointerId: 1, bubbles: true, cancelable: true, clientX: cx, clientY: cy, isPrimary: true, pointerType: 'touch' };
        cv.dispatchEvent(new PointerEvent('pointerdown', opts));
        setTimeout(function () { cv.dispatchEvent(new PointerEvent('pointerup', opts)); }, 40);
        return true;
      } catch (e) { return false; }
    },

    goto: function (where) {
      try {
        switch (where) {
          case 'title': UI.hideAll(); G.goto('title'); UI.showTitle(); break;
          case 'act1': UI.hideAll(); G.goto('act1'); St.beginAct1(); break;
          case 'act2': UI.hideAll(); G.goto('act2'); St.play('act2'); break;
          case 'level1': case 'level2': case 'level3': case 'level4': case 'level5':
            UI.hideAll(); UI.startLevel(parseInt(where.slice(5), 10) - 1); break;
          case 'finale': G.goto('finale'); G.finaleT = 0; break;
          default: return false;
        }
        return true;
      } catch (e) { return false; }
    },

    skipAct1: function () { try { St.skipAct1(); return true; } catch (e) { return false; } },
    snoreGain: function () { try { return A.snoreGain(); } catch (e) { return 0; } },
    l5checkpoint: function (write) {
      try {
        if (write === undefined) return S.data.progress.l5Checkpoint;
        return S.checkpoint(write);
      } catch (e) { return null; }
    },

    loopInfo: function () {
      try {
        return { running: running, fps: fpsWin.fps, stepsLastFrame: stepsLastFrame, accMs: accMs };
      } catch (e) { return null; }
    },
    gradCount: function () { try { return R.gradCount(); } catch (e) { return 0; } },
    hitTest: function (x, y) { try { return R.hitTest(x, y); } catch (e) { return null; } },
    /** ★ A7b ③：回程箭头方向断言 */
    arrowDir: function () {
      try {
        if (!G.seg || !G.seg.arrows) return '-';
        return G.seg.arrows;
      } catch (e) { return '-'; }
    },

    /* —— 以下为便于 QA 的额外只读钩子（不改 26 个契约方法语义）—— */
    segName: function () { try { return G.segName || '-'; } catch (e) { return '-'; } },
    segLen: function () { try { return G.seg ? G.seg.segLen : 0; } catch (e) { return 0; } },
    cruise: function () { try { return G.seg ? G.seg.cruise : 0; } catch (e) { return 0; } },
    particles: function () { try { return global.Art.particles.length; } catch (e) { return 0; } },
    /** 当前段的完整定义（QA 用来核对障碍数 / 间距 / safeTail，不需要逐个翻视口） */
    segData: function () {
      try {
        var lv = G.level;
        if (!lv || !G.segName) return null;
        var s = lv[G.segName];
        return { name: G.segName, segLen: s.segLen, cruise: s.cruise, arrows: s.arrows, dir: s.dir, safeTail: s.safeTail, boost: s.boost, obstacles: s.obstacles.map(function (o) { return { s: o.s, type: o.type }; }) };
      } catch (e) { return null; }
    },
    /** 幕一渐弱进度 0..1（验收 A2b ③：跳过也必须走满 ≥3.2s） */
    fadeProgress: function () { try { return St.fadeProgress(); } catch (e) { return 0; } },
    posesCount: function () {
      try {
        var n = 0;
        for (var id in global.Art.POSES) { if (Object.prototype.hasOwnProperty.call(global.Art.POSES, id)) n += Object.keys(global.Art.POSES[id]).length; }
        return n;
      } catch (e) { return 0; }
    },
    /* 快进：把当前段直接推到终点附近（仅 QA 冒烟用，不属于游戏逻辑） */
    warpTo: function (s) {
      try {
        if (!G.duck || !G.seg) return false;
        G.duck.s = Math.max(0, Math.min(G.seg.segLen, s));
        G.duck.prevS = G.duck.s;
        /* 同步卡关锚点，否则 warp 后 maxS 仍是旧值，会被误判成「6 秒没进展」而触发辅助 */
        G.maxS = G.duck.s; G.stuckAnchorS = G.duck.s; G.stuckT = 0;
        G.camS = Math.max(0, Math.min(G.seg.segLen, G.duck.s - R.viewW() * 0.38));
        return true;
      } catch (e) { return false; }
    },
    /** 手动推进 n 个物理步（不依赖 rAF，QA 可做确定性物理断言） */
    stepFrames: function (n, dt) {
      try {
        var d = dt || K.FIXED_DT;
        for (var i = 0; i < (n || 1); i++) { G.step(d); A.advance(d); }
        return true;
      } catch (e) { return false; }
    },
    /** 幂等地把循环恢复（暂停恢复用；UI 不再直接依赖 __main 内部对象） */
    resumeLoop: function () {
      try { last = 0; acc = 0; startLoop(); return true; } catch (e) { return false; }
    },
    /** 段起点地面高度（QA 计算跳跃峰高：groundY - duck().y） */
    groundY: function () { try { return G.seg ? G.seg.groundY : 0; } catch (e) { return 0; } }
  };

  global.__duck = duck;

  /* ================= 启动 ================= */
  function boot() {
    try {
      S.load();
    } catch (e) {
      /* 兜底再兜底：无存档最小启动路径，只是不保存 */
      try { S.data = S.defaultSave(); } catch (e2) {}
    }
    A.init();
    A.setMusicEnabled(S.data.settings.music !== false);
    A.setSfxEnabled(S.data.settings.sfx !== false);

    R.init(cv);
    document.body.classList.toggle('portrait', PORTRAIT);
    fit();
    if (window.ResizeObserver) new ResizeObserver(scheduleFit).observe(document.documentElement);
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 200); });
    document.addEventListener('visibilitychange', onVisibility);

    bindPointer();
    bindKeys();
    UI.init();

    /* 标题页：加载第 1 关数据供背景绘制，但状态停在 title */
    G.level = L.get(0);
    G.levelIndex = 0;
    G.goto('title');
    UI.showTitle();
    if (PORTRAIT && !S.data.settings.rotTipShown) UI.maybeShowRotTip();

    startLoop();
    duck.ready = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
