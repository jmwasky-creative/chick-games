/* ===== src/js/40-story.js · 幕一（呼噜 25s + 可跳过）+ 幕二（6 段）+ 结局 · 依赖 00-const/20-art =====
 * 全部演出计时走**游戏内 t**（由 Game.step 驱动），不用 setTimeout：
 * setTimeout 在切后台回来后会一堆气泡同时冒出来。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var C = K.C;
  var A = global.Art;

  /* ================= 时间轴定义（8 段） ================= */
  var ACTS = {
    /* 幕一 · 睡觉：呼吸起伏 → 呼噜 3 段递进 → 渐弱 → 静默 → 金光 */
    act1: {
      total: K.ACT1_TOTAL,          /* 25s */
      /* 渐弱段：6s 内到 0（底线 ≥3.2s，不可压缩） */
      fadeFrom: 17.0,
      fadeDur: 6.0,
      quietDur: 1.0,               /* 全静 1s */
      /* 呼噜 3 段递进起点 */
      snoreAt: [3.0, 9.5, 15.0],
      /* zzz 气泡发射间隔 */
      zzzEvery: 1.6
    },
    /* 幕二 · 起床如厕：6 段，逐段点击推进
     * check = 该段结束时在 hygiene 里点亮的勾。四枚勾（PRD §8.1）对应四个**完成**动作：
     *   M2-2 只是「想上厕所」（还没去，不点亮）→ M2-3 真的上了厕所点亮 potty
     *   → M2-4 洗手点亮 wash → M2-5 擦干净点亮 wipe → M2-6 背书包点亮 bag */
    act2: {
      total: K.ACT2_TOTAL,
      steps: [
        { id: 'M2-1', name: '伸懒腰起床', pose: 'stretch', sub: 'rubEye', line: '唔…起床啦',
          sfx: ['birdcall', 'yawn'], dur: 4.2, check: null },
        { id: 'M2-2', name: '想上厕所', pose: 'fidget', sub: 'fidget', line: '我想上厕所',
          sfx: ['belly_rumble'], dur: 4.0, check: null },
        { id: 'M2-3', name: '进卫生间', pose: 'toilet', sub: 'toilet', line: '',
          sfx: ['door_close', 'toilet_moan', 'flush'], dur: 4.6, check: 'potty' },
        { id: 'M2-4', name: '洗手', pose: 'wash', sub: 'wash', line: '要洗手',
          sfx: ['tap_water', 'scrub', 'bubble_pop', 'water_fling'], dur: 5.0, check: 'wash' },
        { id: 'M2-5', name: '擦干净', pose: 'wipe', sub: 'wipe', line: '擦干净',
          sfx: ['wipe'], dur: 3.4, check: 'wipe' },
        { id: 'M2-6', name: '背书包出发', pose: 'standBag', sub: 'standBag', line: '上学去啦！',
          sfx: ['schoolBell'], dur: 4.4, check: 'bag' }
      ]
    }
  };

  var state = {
    act: null,
    t: 0,
    stepI: 0,
    stepT: 0,
    skipping: false,
    fadeStarted: false,
    fadeT: 0,               /* 渐弱段内已过秒数（自然演或跳过后都从这里读） */
    quietT: 0,              /* 渐弱走完后的全静计时 */
    snoreStage: 0,
    zzzT: 0,
    done: false,
    waiting: true,          /* 幕一开场等一次点击「进入」 */
    checksLit: 0,
    bedtime: 0,             /* 幕二厕所影子晃动计时 */
    toiletDone: false
  };

  /* ---------- 播放 ---------- */
  function play(act) {
    state.act = act;
    state.t = 0;
    state.stepI = 0;
    state.stepT = 0;
    state.skipping = false;
    state.fadeStarted = false;
    state.fadeT = 0;
    state.quietT = 0;
    state.snoreStage = 0;
    state.zzzT = 0;
    state.done = false;
    state.waiting = false;   /* play() 本身就代表「已进入」，不再额外等一次点击 */
    state.checksLit = 0;
    state.toiletDone = false;
    if (act === 'act1' || act === 'act2') global.Audio.music('nightLullaby', { fadeMs: 600 });
  }

  /**
   * 幕一开场：解锁 waiting（等同「点了开始」）。
   * 单独开一个方法而不是让 play() 强制 waiting=false，是为了让「点一下才真的开始睡」
   * 这个手感仍然存在（UI 标题按钮调 beginAct1()，测试钩子 goto('act1') 也调它）。
   */
  function beginAct1() {
    play('act1');
    state.waiting = false;
  }

  /** 幕二逐段点击；幕一为跳过。竖屏下允许点上方 38%（D10，由 90-main 的 inPlayZone 放行） */
  function tap(opt) {
    if (state.done) return;
    opt = opt || {};
    if (state.act === 'act1') {
      if (state.waiting) { state.waiting = false; return; }   /* 第一次点击 = 入睡 */
      skipAct1();
      return;
    }
    if (state.act === 'act2') advanceStep();
  }

  function advanceStep() {
    var def = ACTS.act2;
    if (!def) return;
    /* 结算当前段的勾 */
    var cur = def.steps[state.stepI];
    if (cur && cur.check && !global.Save.data.hygiene[cur.check]) {
      global.Save.data.hygiene[cur.check] = true;
      state.checksLit++;
      global.Save.flush();
    }
    if (state.stepI >= def.steps.length - 1) {
      state.done = true;
      return;
    }
    state.stepI++;
    state.stepT = 0;
    var nx = def.steps[state.stepI];
    for (var i = 0; i < nx.sfx.length; i++) global.Audio.play(nx.sfx[i], { delay: i * 0.9 });
    /* 四枚勾全亮撒一次彩带 */
    var h = global.Save.data.hygiene;
    if (h.potty && h.wash && h.wipe && h.bag) global.Audio.play('confetti_small');
  }

  /**
   * ★ 幕一跳过：不是 clearTimeout 跳下一幕，而是「呼噜 0.3s 淡出 + 从当前进度续演渐弱尾段」。
   *
   * 关键设计：把「渐弱段」重写成一条**相对时间轴**，起点锚在点击那一刻。
   * 无论孩子在第 1 秒还是第 16 秒点跳过，尾段时长都恰好是 K.ACT1_FADE_MIN（3.2s，不可压缩），
   * 然后再演 quietDur（1s 全静）才结束 —— 永远不会出现「跳过后还要再等十几秒」的死锁。
   * 不重播任何已演过的内容（金光扫过仍然从 0 开始演，这是跳过后的「醒过来」信号）。
   */
  function skipAct1() {
    if (state.done) return;
    if (state.act !== 'act1') return;
    if (state.skipping) return;
    state.skipping = true;
    /* 锚点：fadeT = 渐弱段内已过秒数（0 → 3.2）；若原本已在渐弱段，就接着原来的进度走 */
    state.fadeT = Math.max(0, Math.min(K.ACT1_FADE_MIN, state.t - ACTS.act1.fadeFrom));
    state.fadeStarted = true;
    global.Audio.fadeOut('snore', K.ACT1_SKIP_FADE);   /* 0.3s 线性淡出 */
    global.Save.bumpStat('act1Skip');
    global.Save.flush();
  }

  /* ---------- 每帧推进 ---------- */
  function tick(dt) {
    if (!state.act || state.done) return;
    var def = ACTS[state.act];
    if (!def) return;
    state.t += dt;

    if (state.act === 'act1') {
      tickAct1(dt, def);
    } else if (state.act === 'act2') {
      var cur = def.steps[state.stepI];
      if (cur) {
        state.stepT += dt;
        /* 幕二厕所段影子晃动 */
        if (cur.pose === 'toilet') state.bedtime += dt;
      }
      if (state.stepT >= cur.dur && state.stepI >= def.steps.length - 1 && state.stepT >= cur.dur) {
        /* 最后一段演完不自动过，等玩家点击（PRD：逐段点击推进） */
        state.t = Math.min(state.t, def.total);
      }
    }
  }

  function tickAct1(dt, def) {
    if (state.waiting) return;

    /* —— 呼吸起伏已由 Art.sleep 的 o.t 驱动 —— */

    /* —— 呼噜 3 段递进（跳过后不再补发新呼噜）—— */
    if (!state.skipping) {
      for (var i = 0; i < def.snoreAt.length; i++) {
        if (state.t >= def.snoreAt[i] && state.snoreStage <= i) {
          state.snoreStage = i + 1;
          if (i === 0) { global.Audio.music('snoreBed', { fadeMs: 800 }); global.Audio.play('snore'); }
          else if (i === 1) global.Audio.play('snoreMid');   /* i=2 已由 snoreMid 加强度 */
        }
      }
      /* —— zzz 气泡（3 段从小到大）—— */
      state.zzzT += dt;
      var zEvery = state.snoreStage >= 3 ? def.zzzEvery * 0.62 : def.zzzEvery;
      if (state.snoreStage > 0 && state.zzzT >= zEvery) {
        state.zzzT = 0;
        A.emit('zzz', 470, 470, 1, { ttl: 2.0, r: 0.6 + state.snoreStage * 0.3, lift: 40, g: -30, speed: 20, col: C.inkSoft });
      }
      /* —— 渐弱自然开始：6s 内线性到 0 —— */
      if (state.t >= def.fadeFrom && !state.fadeStarted) {
        state.fadeStarted = true;
        state.fadeT = 0;
        global.Audio.fadeOut('snore', Math.max(K.ACT1_FADE_MIN, def.fadeDur) * 1000);
        global.Audio.stopMusic(def.fadeDur * 1000);
      }
    }

    /* —— 渐弱进度（跳过后从点击那一刻接着走，不重播）—— */
    if (state.fadeStarted) {
      if (state.skipping) state.fadeT += dt;
      else state.fadeT = state.t - def.fadeFrom;
      /* 底线：渐弱段至少 3.2s（不可压缩） */
      if (state.fadeT >= K.ACT1_FADE_MIN) {
        state.fadeT = K.ACT1_FADE_MIN;
        if (state.quietT === undefined) state.quietT = 0;
        state.quietT += dt;
        if (state.quietT >= def.quietDur) finishAct1();
      }
    }
  }

  function finishAct1() {
    if (state.done) return;
    state.done = true;
    global.Audio.stop('snore');
    global.Audio.play('sunlight');
    global.Audio.stopMusic(1200);
  }

  function isDone() { return state.done; }

  /** 幕一进度 0..1，用于渲染呼吸与天亮金光 */
  function progress() {
    var def = ACTS[state.act];
    if (!def) return 0;
    return Math.max(0, Math.min(1, state.t / def.total));
  }

  /**
   * 「天亮金光」阶段 0..1：在渐弱段走完、全静开始时扫过 1.6s。
   * 锚点是 quietT（不依赖 state.t），所以**跳过后金光照样会演**，不会因为 t 被重置而丢失。
   */
  function dawnPhase() {
    if (state.act !== 'act1') return 0;
    return Math.max(0, Math.min(1, state.quietT / 1.6));
  }

  global.Story = {
    ACTS: ACTS,
    play: play,
    beginAct1: beginAct1,
    tap: tap,
    skipAct1: skipAct1,
    tick: tick,
    isDone: isDone,
    progress: progress,
    dawnPhase: dawnPhase,
    /** 幕二当前段（渲染用） */
    currentStep: function () {
      if (state.act !== 'act2') return null;
      return ACTS.act2.steps[state.stepI] || null;
    },
    stepIndex: function () { return state.stepI; },
    /** 当前段的已演时长（渲染用） */
    stepT: function () { return state.stepT; },
    t: function () { return state.t; },
    skipping: function () { return state.skipping; },
    waiting: function () { return state.waiting; },
    /** 渐弱段进度 0..1（渲染可用来同步小鸭的睡姿，QA 可用来断言 ≥3.2s 底线） */
    fadeProgress: function () { return Math.max(0, Math.min(1, state.fadeT / K.ACT1_FADE_MIN)); },
    reset: function () { state.act = null; state.done = true; state.waiting = false; state.t = 0; }
  };
})(window);
