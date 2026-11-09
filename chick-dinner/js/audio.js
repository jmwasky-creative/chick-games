/* 音效：全部用 WebAudio 现场合成，不依赖任何音频素材文件 */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var master = null;
  var laserNodes = null;

  function ac() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(opt) {
    if (!enabled) return;
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + (opt.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq || 440, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.to), t0 + (opt.dur || 0.15));
    var vol = (opt.vol == null ? 0.2 : opt.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opt.dur || 0.15));
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + (opt.dur || 0.15) + 0.02);
  }

  function noise(opt) {
    if (!enabled) return;
    var c = ac(); if (!c) return;
    var dur = opt.dur || 0.2;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.value = opt.freq || 900;
    f.Q.value = opt.q || 1;
    var g = c.createGain(); g.gain.value = (opt.vol == null ? 0.25 : opt.vol);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(c.currentTime + (opt.delay || 0));
  }

  var SFX = {
    /* UI */
    click:    function () { tone({ freq: 660, to: 880, dur: 0.08, type: 'triangle', vol: 0.18 }); },
    panel:    function () { tone({ freq: 420, to: 620, dur: 0.12, type: 'sine', vol: 0.15 }); },
    /* 角色 */
    footstep: function () { noise({ dur: 0.06, freq: 320, vol: 0.06, filter: 'lowpass' }); },
    hungry:   function () { tone({ freq: 300, to: 200, dur: 0.22, type: 'sine', vol: 0.18 }); },
    bump:     function () { tone({ freq: 180, to: 120, dur: 0.14, type: 'square', vol: 0.12 }); },
    jump:     function () { tone({ freq: 400, to: 700, dur: 0.14, type: 'sine', vol: 0.14 }); },
    /* 道具 */
    pickup:   function () { tone({ freq: 880, dur: 0.1, type: 'triangle', vol: 0.2 }); tone({ freq: 1320, dur: 0.14, type: 'sine', vol: 0.14, delay: 0.08 }); },
    button:   function () { tone({ freq: 220, to: 160, dur: 0.09, type: 'square', vol: 0.16 }); },
    mirror:   function () { tone({ freq: 1200, to: 1600, dur: 0.07, type: 'sine', vol: 0.12 }); },
    switchOn: function () { tone({ freq: 300, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.16 }); },
    rope:     function () { noise({ dur: 0.25, freq: 2200, vol: 0.18, q: 0.7 }); },
    alarm:    function () { tone({ freq: 520, to: 380, dur: 0.16, type: 'square', vol: 0.12 }); },
    /* 场景 */
    sizzle:   function () { noise({ dur: 0.5, freq: 3200, vol: 0.05, q: 0.5 }); },
    openDoor: function () { tone({ freq: 260, to: 400, dur: 0.2, type: 'sine', vol: 0.16 }); },
    closeDoor:function () { tone({ freq: 200, to: 90, dur: 0.26, type: 'square', vol: 0.2 }); noise({ dur: 0.3, freq: 260, vol: 0.2, filter: 'lowpass' }); },
    breakDoor:function () { noise({ dur: 0.6, freq: 500, vol: 0.35, q: 0.4 }); tone({ freq: 120, to: 60, dur: 0.5, type: 'sawtooth', vol: 0.2 }); },
    /* 伙伴 */
    cheer:    function () { tone({ freq: 700, dur: 0.1, type: 'triangle', vol: 0.18 }); tone({ freq: 990, dur: 0.12, type: 'triangle', vol: 0.16, delay: 0.09 }); tone({ freq: 1320, dur: 0.16, type: 'sine', vol: 0.14, delay: 0.18 }); },
    /* 结算 */
    star:     function (i) { tone({ freq: 660 + (i || 0) * 220, dur: 0.2, type: 'triangle', vol: 0.2 }); },
    win:      function () { [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, dur: 0.28, type: 'triangle', vol: 0.18, delay: i * 0.12 }); }); },
    eat:      function () { noise({ dur: 0.12, freq: 700, vol: 0.12, filter: 'lowpass' }); }
  };

  /* 激光持续音：充能时音高持续上升 */
  function laserStart() {
    if (!enabled) return;
    var c = ac(); if (!c || laserNodes) return;
    var osc = c.createOscillator();
    var osc2 = c.createOscillator();
    var g = c.createGain();
    var f = c.createBiquadFilter();
    osc.type = 'sawtooth'; osc.frequency.value = 180;
    osc2.type = 'sine'; osc2.frequency.value = 90;
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, c.currentTime + 0.08);
    osc.connect(f); osc2.connect(f); f.connect(g); g.connect(master);
    osc.start(); osc2.start();
    laserNodes = { osc: osc, osc2: osc2, g: g, f: f };
  }

  function laserUpdate(power) { // power: 0 ~ 1
    if (!laserNodes) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime;
    laserNodes.osc.frequency.setTargetAtTime(180 + power * 520, t, 0.05);
    laserNodes.osc2.frequency.setTargetAtTime(90 + power * 260, t, 0.05);
    laserNodes.g.gain.setTargetAtTime(0.10 + power * 0.10, t, 0.05);
  }

  function laserStop() {
    if (!laserNodes) return;
    var c = ac();
    var n = laserNodes; laserNodes = null;
    if (!c) return;
    try {
      n.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.03);
      setTimeout(function () { try { n.osc.stop(); n.osc2.stop(); } catch (e) {} }, 200);
    } catch (e) {}
  }

  global.SFX = SFX;
  global.SFX.laserStart = laserStart;
  global.SFX.laserUpdate = laserUpdate;
  global.SFX.laserStop = laserStop;
  global.SFX.setEnabled = function (b) {
    enabled = !!b;
    if (!enabled) laserStop();
    if (master) master.gain.value = enabled ? 0.5 : 0;
  };
  global.SFX.isEnabled = function () { return enabled; };
  global.SFX.resume = function () { ac(); };
})(window);
