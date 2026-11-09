/* ===== src/js/10-audio.js · WebAudio 引擎（发声原语 / 呼噜 / 前瞻调度时钟） · 依赖 00-const 09-audio-tables =====
 * 全部实时合成，零音频文件（硬约束 #10）。硬规则（架构 §5.4）：① 同名音效 60ms 内重复忽略
 * ② **音效**同时发声 ≤3 ③ 指数 ramp 目标值用 0.0001 ④ BGM 用 setInterval(25ms) 前瞻调度
 * ⑤ 首个用户手势才建 AudioContext。音色数据全在 09-audio-tables.js，改音色永不碰本文件。
 * ⚠️ ② 的配额**只对音效生效**：BGM 音符在 100ms 前瞻窗口里预排进 AudioContext，若与音效共用同一
 *    计数器，第 4 个预排音符会把第 1 个 stop 掉（表现为 BGM 断续）→ 故 MUSIC_VOICE 独立配额。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var WAVES = ['sine', 'square', 'sawtooth', 'triangle'], FILTERS = ['bandpass', 'lowpass', 'highpass'];
  var SFX = K.AudioTables.SFX, TRACKS = K.AudioTables.TRACKS;
  var C = null, master = null, sfxBus = null, musicBus = null, snoreBus = null;
  var unlocked = false, musicOn = true, sfxOn = true;
  var lastPlay = {}, sfxVoices = [], musVoices = [], loops = {};
  var mir = 0, mirTarget = 0, mirFade = null;
  var timer = null, nextT = 0, stepI = 0, curTrack = null, wantTrack = null, musicGain = null;
  var EP = 0.0001;                 /* 指数 ramp 的非零底值：写 0 会把 Gain 变 NaN 而彻底静音 */

  /* ---------- 上下文：首个用户手势才创建（省电 + 免自动播放拦截） ---------- */
  function ac() {
    if (C) return C;
    if (!unlocked) return null;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    C = new AC();
    master = C.createGain(); master.gain.value = K.MASTER; master.connect(C.destination);
    sfxBus = C.createGain(); sfxBus.gain.value = sfxOn ? K.SFX_BUS : 0; sfxBus.connect(master);
    musicBus = C.createGain(); musicBus.gain.value = musicOn ? K.MUSIC_BUS : 0; musicBus.connect(master);
    snoreBus = C.createGain(); snoreBus.gain.value = K.SNORE_BUS; snoreBus.connect(master);
    return C;
  }
  function unlock() {
    unlocked = true;
    try { var c = ac(); if (c && c.state === 'suspended') c.resume(); } catch (e) {}
  }
  /** 淡入/淡出到目标增益。durSec=0 立即切换；一律线性（exponential 到 0 会 NaN） */
  function ramp(node, vol, durSec) {
    if (!node || !C) return;
    try {
      var t = C.currentTime;
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(Math.max(EP, node.gain.value), t);
      if (durSec) node.gain.linearRampToValueAtTime(vol, t + Math.max(0.05, durSec));
      else node.gain.setValueAtTime(vol, t);
    } catch (e) {}
  }
  /** 节点入队 + 超配额淘汰最老的一个。音效/音乐配额分离是 BGM 不断音的关键 */
  function pushVoice(v, list, quota) {
    list.push(v);
    while (list.length > quota) { var old = list.shift(); try { old.stop(); } catch (e) {} }
  }
  /** 旧轨淡出后 disconnect，不留悬挂节点（切 5 次 BGM 会攒 5 条静音总线） */
  function killMusicGain(ms) {
    if (!musicGain) return;
    var old = musicGain;
    ramp(old, EP, ms);
    setTimeout(function () { try { old.disconnect(); } catch (e) {} }, ms * 1000 + 80);
    musicGain = null;
  }

  /* ---------- 唯一发声原语 ----------
   * tone 与 noise 只差「信号源」：前者是波形振荡器，后者是白噪 + 带通滤波。包络、ramp、
   * 时间基准完全一致 —— 合成一个函数，才不会出现两条包络曲线写法不同步的隐患。
   * @param {Array} p 步进数组 [c,f,fTo,dur,wave,vol,delayMs,q,glide]
   * @param {?Object} bus 目标总线（默认音效总线）
   * @param {boolean} isMusic true=走 MUSIC_VOICE 配额，不与音效抢名额 */
  function emit(p, bus, isMusic) {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + (p[6] || 0) / 1000, dur = p[3], src, fl, i;
    if (p[0] === 0) {                              /* tone */
      src = c.createOscillator();
      src.type = WAVES[p[4]] || 'sine';
      src.frequency.setValueAtTime(Math.max(20, p[1]), t0);
      if (p[2]) src.frequency.exponentialRampToValueAtTime(Math.max(20, p[2]), t0 + dur);
      if (p[8]) src.frequency.linearRampToValueAtTime(Math.max(20, p[1]) * (1 + p[8]), t0 + dur);
    } else {                                        /* noise */
      var len = Math.max(1, Math.floor(c.sampleRate * dur));
      var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);  /* 尾端衰减，避免爆音 */
      src = c.createBufferSource(); src.buffer = buf;
      fl = c.createBiquadFilter();
      fl.type = FILTERS[p[4]] || 'bandpass';
      fl.frequency.setValueAtTime(Math.max(40, p[1]), t0);
      if (p[2]) fl.frequency.exponentialRampToValueAtTime(Math.max(40, p[2]), t0 + dur);
      fl.Q.value = p[7] || 1;
      src.connect(fl);
    }
    var g = c.createGain();
    g.gain.setValueAtTime(EP, t0);                              /* ⚠️ 不能留默认 1，第一帧会炸响 */
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p[5]), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(EP, t0 + dur);
    (fl || src).connect(g);
    g.connect(bus || sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.02);
    pushVoice(src, isMusic ? musVoices : sfxVoices, isMusic ? K.MUSIC_VOICE : K.MAX_VOICE);
  }

  /* ---------- 呼噜持续音 + 增益镜像 ----------
   * 镜像存在的理由：无音频设备的环境（headless / CI）里 AudioContext 可能不推进 currentTime，
   * 直接读 gain.value 会永远停在 setValueAtTime 的初值，A2b ③ 的断言就失去意义。
   * 镜像由主循环每帧 advance(dt) 推进，曲线与真实 ramp 同一条，无断崖。 */
  function startSnore(level) {
    mirTarget = Math.max(mirTarget, level);
    if (loops.snore) { loops.snore.lvl = level; return; }
    var c = ac(); if (!c) return;
    var osc = c.createOscillator(), osc2 = c.createOscillator(), lfo = c.createOscillator(),
        lfoG = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 90;             /* 双振荡器 + 6Hz LFO = 不规则起伏 */
    osc2.type = 'sine'; osc2.frequency.value = 60;
    lfo.type = 'sine'; lfo.frequency.value = 6; lfoG.gain.value = 15;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 1.2;
    g.gain.setValueAtTime(EP, c.currentTime);
    g.gain.exponentialRampToValueAtTime(level, c.currentTime + 0.6);
    osc.connect(f); osc2.connect(f); f.connect(g); g.connect(snoreBus);
    osc.start(); osc2.start(); lfo.start();
    loops.snore = { nodes: [osc, osc2, lfo], g: g, lvl: level };
  }
  function stopSnore(fadeMs) {
    mirTarget = 0;
    var L = loops.snore, c = ac();
    mirFade = { from: Math.max(mir, EP), dur: (fadeMs || 0) / 1000, t: 0 };   /* 镜像侧线性淡出 */
    loops.snore = null;
    if (!L || !c) { if (!fadeMs) mir = 0; return; }
    if (fadeMs > 0) ramp(L.g, EP, fadeMs / 1000);
    var ms = (fadeMs > 0 ? fadeMs : 0) + 60;
    for (var i = 0; i < L.nodes.length; i++) {
      (function (n) { setTimeout(function () { try { n.stop(); } catch (e) {} }, ms); })(L.nodes[i]);
    }
  }
  function advance(dt) {
    if (!dt || dt <= 0) return;
    if (mirFade) {
      mirFade.t += dt;
      mir = mirFade.from * Math.max(0, 1 - mirFade.t / mirFade.dur);
      if (mirFade.t >= mirFade.dur) { mir = 0; mirFade = null; }
    } else if (mirTarget > mir) {
      mir += (mirTarget - mir) * (1 - Math.exp(-K.MIR_RISE * dt));   /* 与真实 ramp 同一条上升曲线 */
    }
  }
  function snoreGain() {
    /* 真实 gain 只在 AudioContext 真的在跑时可信，否则退回镜像值 */
    if (loops.snore && C && C.state === 'running') {
      try { var v = loops.snore.g.gain.value; if (v > 0.0002) return Math.max(0, Math.min(1, v)); }
      catch (e) {}
    }
    return Math.max(0, Math.min(1, mir));
  }

  /* ---------- BGM：步进字符串 → 音符数组 → 前瞻调度 ---------- */
  function parseSeq(str) {
    var out = [];
    if (str) for (var p = str.split(' '), i = 0; i < p.length; i++) {
      var kv = p[i].split('/'); out.push({ f: +kv[0], d: +kv[1] });
    }
    return out;
  }
  function seqLen(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i].d; return t || 16; }
  function noteAt(a, pos) {
    var acc = 0;
    for (var i = 0; i < a.length; i++) { if (pos < acc + a[i].d) return a[i]; acc += a[i].d; }
    return a[a.length - 1] || null;
  }
  for (var tk in TRACKS) {
    if (!Object.prototype.hasOwnProperty.call(TRACKS, tk)) continue;
    TRACKS[tk].mel = parseSeq(TRACKS[tk].s); TRACKS[tk].bas = parseSeq(TRACKS[tk].b);
  }
  /** 绝对时间 → emit 的 delayMs（emit 内部加 C.currentTime，天然对齐前瞻点） */
  function note(f, dur, when, vol, wave, glide) {
    emit([0, f, 0, Math.max(0.04, dur), wave, vol, Math.max(0, (when - C.currentTime) * 1000), 1, glide || 0],
      musicGain, true);
  }
  function tick() {
    var tr = curTrack ? TRACKS[curTrack] : null;
    if (!C || !tr || !musicGain) return;
    var stepDur = 60 / tr.bpm / 4, horizon = C.currentTime + 0.1;   /* 前瞻 100ms，抗 25ms 抖动 */
    var melLen = seqLen(tr.mel), basLen = seqLen(tr.bas), guard = 0;
    while (nextT < horizon && guard++ < 64) {                       /* guard 防曲目数据异常死循环 */
      var pos = stepI % melLen, n = noteAt(tr.mel, pos);
      if (n && n.f) note(n.f, n.d * stepDur, nextT, tr.vol, tr.w, tr.long ? 0.005 : 0);
      if (basLen) {                                                  /* 低音只在小节起点落下 */
        var b = noteAt(tr.bas, stepI % basLen);
        if (b && b.f && pos === 0) note(b.f, b.d * stepDur, nextT, tr.vol * 0.85, 0, 0);
      }
      if (tr.drum && stepI % tr.drum === 0) {
        emit([1, 3000, 0, 0.06, 0, tr.vol * 1.1, Math.max(0, (nextT - C.currentTime) * 1000), 0.5],
          musicBus, true);
      }
      nextT += stepDur; stepI++;
    }
  }
  function ensureClock() {
    if (timer || !C) return;
    nextT = C.currentTime + 0.08;
    timer = setInterval(function () { try { tick(); } catch (e) {} }, 25);
  }

  global.Audio = {
    init: function () { unlocked = false; },   /* 只记录开关，不建 AudioContext（必须等首次用户手势） */
    unlock: unlock,
    /** 播一条音效。返回 false = 被同名节流 / 表里没有 / 未解锁 */
    play: function (name, opt) {
      try {
        var now = Date.now();
        if (lastPlay[name] !== undefined && now - lastPlay[name] < K.SFX_THROTTLE_MS) return false;
        lastPlay[name] = now;
        var f = SFX[name];
        if (!f) return false;
        if (typeof f === 'string') {                /* 持续音 / 淡出动作，不是一段包络 */
          if (f === 'LOOP1') startSnore(0.22);
          else if (f === 'LOOP3') startSnore(0.30);
          else if (f === 'FADE') stopSnore(K.ACT1_FADE_MIN * 1000);
          return true;
        }
        var steps = typeof f === 'function' ? f(opt || {}) : f;
        for (var i = 0; i < steps.length; i++) emit(steps[i]);
        return true;
      } catch (e) { return false; }
    },
    stop: function (name) { if (name === 'snore') stopSnore(0); },
    /** ★ 幕一跳过用：ms=300 线性淡出到 0 再停（A2b ③ / PRD §4） */
    fadeOut: function (name, ms) { if (name === 'snore') stopSnore(ms === undefined ? K.MIR_FADE * 1000 : ms); },
    setLoop: function (name, on) { if (name === 'snore') { if (on) startSnore(0.22); else stopSnore(200); } },
    snoreGain: snoreGain,
    advance: advance,                                  /* 主循环驱动：推进呼噜增益镜像 */
    /** 切 BGM。opt.fadeMs 交叉淡入淡出 */
    music: function (name, opt) {
      try {
        var tr = TRACKS[name];
        if (!tr) return;
        wantTrack = name;
        var c = ac(); if (!c || !musicOn) { curTrack = null; return; }
        var fade = (opt && opt.fadeMs !== undefined ? opt.fadeMs : 400) / 1000;
        killMusicGain(fade);
        musicGain = c.createGain();
        /* ⚠️ 新 GainNode 默认 gain≈1，不先压到 EP 会第一帧炸响（听起来像「哔」一下） */
        musicGain.gain.setValueAtTime(EP, c.currentTime);
        ramp(musicGain, tr.vol, fade);
        musicGain.connect(musicBus);
        curTrack = name; stepI = 0; nextT = c.currentTime + 0.08;
        ensureClock();
      } catch (e) {}
    },
    stopMusic: function (fadeMs) {
      if (!ac()) { curTrack = null; return; }
      killMusicGain((fadeMs === undefined ? 400 : fadeMs) / 1000);
      curTrack = null;
    },
    setMusicEnabled: function (b) {
      musicOn = !!b;
      ramp(musicBus, musicOn ? K.MUSIC_BUS : 0, 0);
      if (!musicOn) this.stopMusic(300);
      else if (C && wantTrack) this.music(wantTrack, { fadeMs: 300 });
    },
    setSfxEnabled: function (b) {
      sfxOn = !!b;
      ramp(sfxBus, sfxOn ? K.SFX_BUS : 0, 0);
      if (!sfxOn) stopSnore(0);
    },
    isMusicEnabled: function () { return musicOn; },
    isSfxEnabled: function () { return sfxOn; },
    /** 切后台停调度时钟 + 停持续音；回来重设 timebase（否则一次性响几十个积压音符） */
    pauseClock: function () {
      if (timer) { clearInterval(timer); timer = null; }
      curTrack = null; stopSnore(120);
    },
    resumeClock: function () {
      if (!C) return;
      nextT = Math.max(nextT, C.currentTime + 0.08);
      if (musicOn && wantTrack) { curTrack = wantTrack; ensureClock(); }
    },
    currentMusic: function () { return curTrack; },
    ctxState: function () { return C ? C.state : 'none'; },
    unlocked: function () { return unlocked; },
    /** QA 只读：当前发声节点数（验证「同时发声≤3」只约束音效） */
    voiceCount: function () { return { sfx: sfxVoices.length, music: musVoices.length }; }
  };
})(window);
