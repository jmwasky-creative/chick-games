/* ===== src/js/70-render.js · 10 层绘制 + grad() 缓存 + 视口 + 插值 + canvas HUD · 依赖 00/20/40/60 =====
 * ⚠️ 渐变必须缓存（grad(key, make)），不要每帧 createLinearGradient。
 * ⚠️ 方向映射只有 worldToScreenX 一个函数；角色翻转**逐实体**做，
 *    禁止 ctx.scale(-1,1) 镜像整个 canvas（会把气泡文字和星星数一起镜像）。
 * ⚠️ canvas 内不写 @keyframes，所有动画由 JS 驱动。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var C = K.C;
  var Game = global.Game;
  var Art = global.Art;
  var St = global.Story;

  var cv = null, c = null;
  var viewW = K.DESIGN_W, viewH = K.DESIGN_H;
  var grads = {};
  var hits = {};              /* canvas 内可点元素：id → {x,y,w,h}（逻辑坐标） */
  var font = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';

  /* ================= 渐变缓存 ================= */
  function grad(key, make) {
    var g = grads[key];
    if (!g) { g = grads[key] = make(); }
    return g;
  }
  function gradCount() {
    var n = 0;
    for (var k in grads) { if (Object.prototype.hasOwnProperty.call(grads, k)) n++; }
    return n;
  }
  function clearGradCache() { grads = {}; }

  /* ================= 视口 ================= */
  function viewWNow() { return viewW; }
  function setView(w, h) { viewW = w; viewH = h; }

  /**
   * ★ 全项目唯一的「进度空间 → 屏幕 x」映射。
   * dir=+1 去程（向右跑）/ dir=-1 回程（向左跑）。
   */
  function worldToScreenX(s, dir, camS, w) {
    return dir === 1 ? (s - camS) : (w - (s - camS));
  }
  function sToX(s) { return worldToScreenX(s, Game.dir, Game.camS, viewW); }

  /** 屏幕 x → 进度 s（与上式互逆，误差 < 2px） */
  function xToS(x) {
    return Game.dir === 1 ? (x + Game.camS) : (viewW - x + Game.camS);
  }

  /* ================= HUD 热区：渲染与命中共用同一个 hitRect ================= */
  function hitRect(id, x, y, w, h) { hits[id] = { id: id, x: x, y: y, w: w, h: h }; }
  function hitTest(x, y) {
    for (var k in hits) {
      if (!Object.prototype.hasOwnProperty.call(hits, k)) continue;
      var r = hits[k];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
    }
    return null;
  }
  function clearHits() { hits = {}; }

  /* ================= 颜色工具 ================= */
  function mix(a, b, k) {
    function hx(s) { return parseInt(s.slice(1), 16); }
    var ar = (hx(a) >> 16) & 255, ag = (hx(a) >> 8) & 255, ab = hx(a) & 255;
    var br = (hx(b) >> 16) & 255, bg = (hx(b) >> 8) & 255, bb = hx(b) & 255;
    return 'rgb(' + Math.round(ar + (br - ar) * k) + ',' + Math.round(ag + (bg - ag) * k) + ',' + Math.round(ab + (bb - ab) * k) + ')';
  }
  function rr(x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else {
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    }
    c.closePath();
  }
  function star(c2, x, y, r, col, lineCol) {
    c2.save(); c2.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0 ? r : r * 0.45), a = -Math.PI / 2 + i * Math.PI / 5;
      c2[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c2.closePath(); c2.fillStyle = col; c2.fill();
    if (lineCol) { c2.lineWidth = 1.6; c2.strokeStyle = lineCol; c2.stroke(); }
    c2.restore();
  }

  /* ================= z0 天空 ================= */
  function drawSky(scene, camS) {
    var isOut = scene === 'morning_cool' || scene === 'school_road';
    var isIn = scene === 'noon_warm' || scene === 'school_road_in';
    var key = isIn ? 'sky_in' : (scene === 'lotus_pond' ? 'sky_day' : (isOut ? 'sky_out' : 'sky_day'));
    var g = grad(key, function () {
      var gr = c.createLinearGradient(0, 0, 0, viewH);
      if (key === 'sky_in') { gr.addColorStop(0, C.skyInA); gr.addColorStop(0.72, C.skyInB); }
      else if (key === 'sky_out') { gr.addColorStop(0, C.skyOutA); gr.addColorStop(0.72, C.skyOutB); }
      else { gr.addColorStop(0, C.skyOutA); gr.addColorStop(0.72, C.skyOutB); }
      return gr;
    });
    c.fillStyle = g;
    c.fillRect(0, 0, viewW, viewH);

    /* 云 */
    var n = isIn ? 5 : 3;
    for (var i = 0; i < n; i++) {
      var span = 1400;
      var cx = ((i * span - camS * 0.12) % (span * n) + span * n) % (span * n) - 100;
      drawCloud(cx, 80 + (i % 3) * 46, 1 + (i % 2) * 0.35);
    }
    /* 远处钟：去程上学钟 / 回程放学钟 */
    drawBell(760 - (camS * 0.08) % 1800, 150, isIn ? 'out' : 'in');
    /* 回程专属：热气球 + 蝴蝶（活泼归家） */
    if (isIn) {
      drawBalloon(200 - (camS * 0.1) % 1600 + 40, 170, 0.8);
      drawButterfly(520 - (camS * 0.18) % 1200 + 60, 300, Game.animT);
      drawButterfly(880 - (camS * 0.14) % 1500 + 90, 260, Game.animT * 1.3);
    }
    /* 暖黄叠层（回程色调偏移的第一层） */
    if (isIn) { c.fillStyle = K.C && 'rgba(255,180,90,.12)'; c.fillRect(0, 0, viewW, viewH); }
  }
  function drawCloud(x, y, s) {
    c.save(); c.globalAlpha = 0.85; c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x, y, 20 * s, 0, Math.PI * 2);
    c.arc(x + 22 * s, y + 5 * s, 15 * s, 0, Math.PI * 2);
    c.arc(x - 20 * s, y + 6 * s, 14 * s, 0, Math.PI * 2);
    c.fill(); c.restore();
  }
  function drawBell(x, y, kind) {
    c.save(); c.translate(x, y);
    c.strokeStyle = 'rgba(74,55,34,.35)'; c.lineWidth = 3; c.fillStyle = kind === 'out' ? C.chick : C.beak;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -18); c.stroke();
    c.beginPath(); c.moveTo(-16, 16); c.quadraticCurveTo(-16, -12, 0, -12); c.quadraticCurveTo(16, -12, 16, 16); c.closePath();
    c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 20, 4, 0, Math.PI * 2); c.fillStyle = C.ink; c.fill();
    c.restore();
  }
  function drawBalloon(x, y, s) {
    c.save(); c.translate(x, y + Math.sin(Game.animT * 0.8) * 6); c.scale(s, s);
    c.fillStyle = C.comb; c.strokeStyle = C.ink; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, 20, 24, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 24); c.lineTo(0, 40); c.stroke();
    c.restore();
  }
  function drawButterfly(x, y, t) {
    c.save(); c.translate(x, y);
    var f = Math.sin(t * 6) * 0.6;
    c.fillStyle = C.beak;
    c.save(); c.scale(1, 1 + f * 0.5); c.beginPath(); c.ellipse(-6, 0, 7, 5, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.scale(1, 1 - f * 0.5); c.beginPath(); c.ellipse(6, 0, 7, 5, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.restore();
  }

  /* ================= z1 远景 / z2 中景（视差 0.25 / 0.55） ================= */
  function drawFar(kind, camS) {
    var y = 400;
    c.save(); c.globalAlpha = 0.55;
    c.fillStyle = '#CFE3B8';
    var off = (camS * 0.25) % 320;
    for (var x = -off - 320; x < viewW + 320; x += 320) {
      if (kind === 'fence') {
        c.fillStyle = '#D9BE8C'; c.fillRect(x, y, 260, 120);
        for (var i = 0; i < 5; i++) { c.fillStyle = '#C9A874'; c.fillRect(x + i * 52, y - 18, 12, 138); }
      } else if (kind === 'wheat') {
        c.fillStyle = '#EBD79A';
        c.beginPath(); c.ellipse(x + 100, y + 60, 190, 90, 0, 0, Math.PI * 2); c.fill();
      } else if (kind === 'reeds') {
        c.fillStyle = '#A8C8A0';
        for (var j = 0; j < 7; j++) { c.fillRect(x + j * 46, y - 30, 5, 150); }
      } else {
        c.fillStyle = '#CFE3B8';
        c.beginPath(); c.ellipse(x + 140, y + 70, 200, 100, 0, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }
  function drawMid(kind, camS) {
    var gy = Game.seg ? Game.seg.groundY : 520;
    var off = (camS * 0.55) % 260;
    for (var x = -off - 260; x < viewW + 260; x += 260) {
      if (kind === 'trees') {
        c.save();
        c.fillStyle = '#7FB05E'; c.strokeStyle = C.ink; c.lineWidth = 3;
        c.beginPath(); c.arc(x + 90, gy - 90, 54, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#B08A5A'; c.fillRect(x + 84, gy - 50, 12, 50);
        c.restore();
      } else if (kind === 'wall') {
        c.fillStyle = '#E0D2B8'; c.fillRect(x, gy - 56, 200, 56);
        c.strokeStyle = 'rgba(74,55,34,.25)'; c.lineWidth = 2;
        for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + i * 50, gy - 56); c.lineTo(x + i * 50, gy); c.stroke(); }
      }
    }
  }

  /* ================= z3 地面带（可无缝循环，图案宽为整数） ================= */
  var GROUND_W = 256;
  function drawGroundBand(kind, camS) {
    var gy = Game.seg ? Game.seg.groundY : 520;
    var body, top;
    if (kind === 'water') { body = '#8FC8E8'; top = '#A8DCEF'; }
    else if (kind === 'mud') { body = '#B89A72'; top = '#C9AE86'; }
    else if (kind === 'dirt') { body = '#D8BE90'; top = '#E8D2A8'; }
    else if (kind === 'roadIn') { body = '#E0C48E'; top = '#EFD8A6'; }
    else { body = '#D2B184'; top = '#E4C79C'; }
    c.fillStyle = body;
    c.fillRect(0, gy, viewW, viewH - gy);
    c.fillStyle = top;
    c.fillRect(0, gy, viewW, 12);
    /* 无缝循环图案：偏移取模，图案宽为整数 → 任意偏移无接缝 */
    var off = ((camS % GROUND_W) + GROUND_W) % GROUND_W;
    c.save(); c.globalAlpha = 0.5;
    if (kind === 'water') {
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
      for (var i = -1; i < viewW / 64 + 1; i++) {
        var x = i * 64 - off;
        c.beginPath(); c.moveTo(x, gy + 40); c.quadraticCurveTo(x + 32, gy + 32, x + 64, gy + 40); c.stroke();
        c.beginPath(); c.moveTo(x + 20, gy + 96); c.quadraticCurveTo(x + 52, gy + 88, x + 84, gy + 96); c.stroke();
      }
    } else {
      c.fillStyle = 'rgba(74,55,34,.18)';
      for (var j = 0; j < 4; j++) {
        c.beginPath(); c.ellipse(j * GROUND_W - off + 60, gy + 46 + j * 26, 26, 8, 0, 0, Math.PI * 2); c.fill();
      }
      /* 落叶（去程秋意） */
      c.fillStyle = 'rgba(255,154,60,.55)';
      for (var m = 0; m < 5; m++) {
        var lx = m * (GROUND_W / 5) - off + 100;
        c.save(); c.translate(lx, gy + 22 + (m % 2) * 16); c.rotate(Game.animT * 0.4 + m);
        c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    c.restore();
  }

  /* ================= z4 地面箭头带 ★ R2 最高优先级 ================= */
  /** dir：'right' | 'left'。箭头**全部朝同一个方向**。 */
  function drawArrowBand(arrowDir, camS) {
    if (!arrowDir || arrowDir === '-') return;
    var gy = (Game.seg ? Game.seg.groundY : 520) + 46;
    var sgn = arrowDir === 'right' ? 1 : -1;
    var spacing = 200;
    var off = ((camS % spacing) + spacing) % spacing;
    c.save();
    for (var i = -1; i * spacing - off < viewW + spacing; i++) {
      var x = i * spacing - off;
      c.save(); c.translate(x, gy + (i % 2 === 0 ? 0 : 30)); c.scale(sgn, 1);
      c.globalAlpha = 0.42;
      c.fillStyle = C.comb;
      c.beginPath();
      c.moveTo(24, 0); c.lineTo(2, -15); c.lineTo(2, -6); c.lineTo(-26, -6);
      c.lineTo(-26, 6); c.lineTo(2, 6); c.lineTo(2, 15);
      c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
  }

  /* ================= z5 障碍 / 终点道具 ================= */
  function drawObstacles() {
    if (!Game.seg) return;
    var gy = Game.seg.groundY;
    for (var i = 0; i < Game.obstacles.length; i++) {
      var o = Game.obstacles[i];
      var x = sToX(o.s);
      if (x < -140 || x > viewW + 140) continue;
      c.save(); c.translate(x, gy);
      Art.drawObstacle(c, o, Game.animT);
      c.restore();
    }
    for (var j = 0; j < Game.movers.length; j++) {
      var m = Game.movers[j];
      var mx = sToX(m.s);
      if (mx < -140 || mx > viewW + 140) continue;
      c.save(); c.translate(mx, gy);
      Art.drawObstacle(c, { type: m.type, w: m.w, h: m.h, spin: m.spin }, Game.animT);
      c.restore();
    }
  }

  /** 终点道具：校门拱门 / 起点旗 */
  function drawGoalProps() {
    if (!Game.seg || !Game.level) return;
    var gy = Game.seg.groundY;
    var lv = Game.level;
    if (lv.roundTrip) {
      var inbound = Game.segName === 'inbound';
      /* 拱门在「当前段终点」；起点旗在「当前段起点」 */
      drawArch(sToX(Game.seg.segLen), gy, inbound);
      drawFlag(sToX(60), gy);
    } else {
      drawFlag(sToX(Game.seg.exitX - 40), gy);
    }
  }

  /** 校门拱门：书本 + 铅笔 + 铃铛图形，**不出现文字**；两态（终点 / 回程起点） */
  function drawArch(x, gy, isInbound) {
    c.save(); c.translate(x, gy);
    c.strokeStyle = C.ink; c.lineWidth = 4; c.fillStyle = isInbound ? C.beak : C.chick;
    c.beginPath(); c.moveTo(-90, 0); c.lineTo(-90, -150); c.quadraticCurveTo(0, -230, 90, -150); c.lineTo(90, 0);
    c.lineWidth = 10; c.strokeStyle = isInbound ? C.beak : C.chick; c.stroke();
    c.lineWidth = 4; c.strokeStyle = C.ink; c.stroke();
    /* 门柱 */
    c.fillStyle = '#E4C79C'; c.fillRect(-96, 0, 14, 0);
    /* 书本图形 */
    c.save(); c.translate(0, -168);
    c.fillStyle = '#fff'; c.beginPath();
    c.moveTo(-30, 8); c.lineTo(0, 0); c.lineTo(30, 8); c.lineTo(30, -18); c.lineTo(0, -26); c.lineTo(-30, -18);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -26); c.stroke();
    c.restore();
    /* 铅笔 */
    c.save(); c.translate(38, -140); c.rotate(-0.5);
    c.fillStyle = C.beak; c.fillRect(-5, -34, 10, 40);
    c.fillStyle = C.ink; c.beginPath(); c.moveTo(-5, 6); c.lineTo(5, 6); c.lineTo(0, 16); c.closePath(); c.fill();
    c.restore();
    /* 铃铛 */
    c.save(); c.translate(-40, -140);
    c.fillStyle = C.chick; c.beginPath(); c.arc(0, 0, 13, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 5, 4, 0, Math.PI * 2); c.fillStyle = C.ink; c.fill();
    c.restore();
    c.restore();
  }

  /** 起点小旗 + 集合垫：表达「回到这里就赢了」 */
  function drawFlag(x, gy) {
    c.save(); c.translate(x, gy);
    c.strokeStyle = C.ink; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -110); c.stroke();
    c.fillStyle = C.comb;
    c.beginPath(); c.moveTo(0, -110); c.lineTo(46, -94); c.lineTo(0, -78); c.closePath();
    c.fill(); c.stroke();
    /* 集合垫 */
    c.fillStyle = C.chick; c.globalAlpha = 0.75;
    c.beginPath(); c.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* ================= z6 角色（按 s 排序后绘制，靠后的先画） ================= */
  function drawCharacters(alpha) {
    if (!Game.duck || !Game.seg) return;
    var gy = Game.seg.groundY;
    var list = [];
    var i, m;

    /* 队伍（同学） */
    for (i = 0; i < Game.team.length; i++) {
      m = Game.team[i];
      var mx = sToX(m.s);
      if (mx < -120 || mx > viewW + 120) continue;
      var pose = Art.POSES[m.id] ? (Art.POSES[m.id].wave ? 'wave' : 'stand') : 'stand';
      if (Math.abs(Game.duck.vx) > 30 && Art.POSES[m.id] && Art.POSES[m.id].run) pose = 'run';
      list.push({ s: m.s, id: m.id, pose: pose, opt: { t: m.t, frame: 0, blink: (m.t % 3.4) > 3.3 } });
    }
    /* 剧情站位 actor（未相遇的也要画出来，孩子能看到同学在路边） */
    var acts = Game.seg.actors || [];
    for (i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (hasTeamNow(a.id)) continue;
      var asx = sToX(a.s);
      if (asx < -120 || asx > viewW + 120) continue;
      var near = Math.abs(Game.duck.s - a.s) < 200;
      list.push({ s: a.s, id: a.id, pose: near ? a.action : (a.action === 'wave' ? 'wave' : a.action), opt: { t: Game.animT, frame: 0, blink: false } });
    }
    /* 小鸭最后画（主角永远在视觉最前） */
    var d = Game.duck;
    var ix = d.prevS + (d.s - d.prevS) * alpha;
    var iy = d.prevY + (d.y - d.prevY) * alpha;
    list.push({ s: 1e9, id: 'duck', duck: true, px: ix, py: iy });

    list.sort(function (a, b) { return a.s - b.s; });

    for (i = 0; i < list.length; i++) {
      var it = list[i];
      var x, y;
      if (it.duck) { x = sToX(it.px); y = it.py; }
      else { x = sToX(it.s); y = gy; }
      if (x < -140 || x > viewW + 140) continue;

      var st = it.duck ? duckState(it.px, it.py) : (it.pose || 'stand');
      var R = Art.resolve(it.id, st, it.opt || {});
      /* ★ 逐实体翻转：ctx.scale(dir * facing, 1)，并用 lineWidth 抵消缩放 */
      var flip = Game.dir;
      c.save();
      c.translate(x, y);
      c.scale(flip, 1);
      if (R.draw) R.draw(c, R.def, it.opt || { t: Game.animT });
      c.restore();
      if (it.duck) drawDuckFx(it.px, it.py, st);
    }
  }

  function hasTeamNow(id) {
    for (var i = 0; i < Game.team.length; i++) if (Game.team[i].id === id) return true;
    return false;
  }

  /** 小鸭碰撞演出形变（压扁 / 坐地 / 站起），三段严格按 hitT */
  function duckState(s, y) {
    var d = Game.duck;
    if (d.hitT > 0) {
      var el = K.HIT_TOTAL - d.hitT;
      if (el < K.HIT_STAGE1) return 'sitStars';
      if (el < K.HIT_STAGE2) return 'sitStars';
      return 'land';
    }
    return Game.animState();
  }

  function drawDuckFx(s, y, st) {
    var x = sToX(s);
    var d = Game.duck;
    c.save(); c.translate(x, y); c.scale(Game.dir, 1);
    if (d.hitT > 0) {
      var el = K.HIT_TOTAL - d.hitT;
      if (el < K.HIT_STAGE1) {            /* ① 压扁 */
        c.save(); c.scale(1.25, 0.7); c.beginPath(); c.arc(0, -20, 24, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,233,168,.85)'; c.fill(); c.restore();
      }
    }
    if (st === 'land' && d.landSquashT > 0) {
      var k = d.landSquashT / 0.18;
      c.globalAlpha = 0.28 * k;
      c.beginPath(); c.ellipse(0, 2, 34 * (1 + k * 0.3), 10, 0, 0, Math.PI * 2);
      c.fillStyle = C.ink; c.fill();
    }
    c.restore();
  }

  /* ================= z7 粒子 ================= */
  function drawParticles() { Art.drawParticles(c); }

  /* ================= z8 前景（视差 1.35） ================= */
  function drawFore(camS) {
    var gy = Game.seg ? Game.seg.groundY : 520;
    var off = (camS * 1.35) % 420;
    c.save(); c.globalAlpha = 0.3; c.fillStyle = '#6FA84E';
    for (var x = -off - 420; x < viewW + 420; x += 420) {
      c.beginPath();
      c.moveTo(x, viewH); c.lineTo(x + 40, gy + 96); c.lineTo(x + 90, viewH); c.closePath(); c.fill();
    }
    c.restore();
  }

  /* ================= z9 HUD（canvas 内）+ 气泡 ================= */
  function drawBubbles() {
    for (var i = 0; i < Game.bubbles.length; i++) {
      var b = Game.bubbles[i];
      if (b.t < 0) continue;
      var a = b.t < 0.2 ? b.t / 0.2 : (b.ttl - b.t < 0.3 ? (b.ttl - b.t) / 0.3 : 1);
      var who = b.who;
      var wx = who === 'duck' ? Game.duck.s : (findActorS(who) || Game.duck.s - 40);
      var x = sToX(wx);
      var y = (Game.seg ? Game.seg.groundY : 520) - 78;
      Art.drawBubble(c, x, y, b.text, { alpha: Math.max(0, a) });
    }
  }
  function findActorS(id) {
    var acts = Game.seg && Game.seg.actors ? Game.seg.actors : [];
    for (var i = 0; i < acts.length; i++) if (acts[i].id === id) return acts[i].s;
    return null;
  }

  function drawHUD() {
    clearHits();
    var pad = 14;
    var story = (Game.state === 'act1' || Game.state === 'act2');

    /* 幕一/幕二：⏩ 跳过（热区 52×52 ≥44px，全幕常驻）。
     * ⚠️ 必须在最前面无条件注册 —— 幕一没有 Game.seg，早期版本把这段放在
     *    「if (!seg) return」之后，导致跳过按钮根本没注册，点不动。 */
    if (Game.state === 'act1') {
      var ss = 52, sx = viewW - ss - pad, sy = pad;
      c.save();
      rr(sx, sy, ss, ss, K.R.md);
      c.fillStyle = 'rgba(255,255,255,.92)'; c.fill();
      c.lineWidth = 2.6; c.strokeStyle = C.ink; c.stroke();
      star(c, sx + ss / 2, sy + ss / 2, 12, C.chick, C.chickBr);
      c.fillStyle = C.ink;
      c.beginPath();
      c.moveTo(sx + 28, sy + 16); c.lineTo(sx + 40, sy + 26); c.lineTo(sx + 28, sy + 36);
      c.closePath(); c.fill();
      c.restore();
      hitRect('skip', sx, sy, ss, ss);
    }

    /* 幕三需要关卡数据：进度条 / 暂停 / 教学 / 辅助提示 */
    if (Game.state !== 'act3') return;
    var seg = Game.seg;
    if (!seg || !Game.duck) return;

    /* 进度条 */
    var bw = 200, bx = viewW - bw - pad, by = pad + 4;
    c.save();
    rr(bx, by, bw, 16, K.R.sm); c.fillStyle = 'rgba(255,255,255,.72)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(74,55,34,.28)'; c.stroke();
    var pct = Math.max(0, Math.min(1, Game.duck.s / seg.segLen));
    rr(bx + 2, by + 2, Math.max(0, (bw - 4) * pct), 12, K.R.sm);
    c.fillStyle = Game.boostOn ? C.beak : C.chick; c.fill();
    c.restore();

    /* 第 5 关：双段标记（去程 / 回程） */
    if (Game.level && Game.level.roundTrip) {
      c.save();
      c.font = '600 14px ' + font; c.fillStyle = C.inkSoft; c.textAlign = 'right';
      var label = Game.subState === 'goBack' ? '回家 🏠' : '去学校 🏫';
      c.fillText(label, viewW - pad, by + 38);
      c.restore();
    }

    /* ❚❚ 暂停（热区 46×46 ≥44） */
    var ps = 46;
    var px = viewW - ps - pad, py = by + 46;
    c.save();
    rr(px, py, ps, ps, K.R.md);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
    c.lineWidth = 2.4; c.strokeStyle = C.ink; c.stroke();
    c.fillStyle = C.ink;
    c.fillRect(px + 15, py + 13, 5, 20); c.fillRect(px + 26, py + 13, 5, 20);
    c.restore();
    hitRect('pause', px, py, ps, ps);

    /* 教学手指光点（第 1 关） */
    if (Game.tut.active) drawTutorialFinger();

    /* 辅助前进提示（无文字，靠图标） */
    if (Game.assistT > 0) {
      c.save(); c.globalAlpha = 0.9;
      c.fillStyle = C.chick;
      var ax = sToX(nextJumpS()) - 20;
      c.beginPath(); c.moveTo(ax, seg.groundY - 120); c.lineTo(ax + 14, seg.groundY - 100); c.lineTo(ax - 14, seg.groundY - 100);
      c.closePath(); c.fill();
      c.restore();
    }
    void story;
  }
  function nextJumpS() {
    var best = Game.seg.segLen;
    for (var i = 0; i < Game.obstacles.length; i++) {
      if (Game.obstacles[i].s > Game.duck.s + 8 && Game.obstacles[i].s < best) best = Game.obstacles[i].s;
    }
    return best;
  }

  /** 手指光点动画：holdDemo 按住态 / tapDemo 点击态（图标化，无文字） */
  function drawTutorialFinger() {
    var steps = Game.level.tutorial.steps;
    var st = steps[Game.tut.i];
    if (!st) return;
    var t = Game.tut.t / st.durMs;
    var x = st.kind === 'holdDemo' ? 300 : 420;
    var y = viewH * 0.72;
    c.save(); c.globalAlpha = 0.9;
    /* 手掌 */
    c.fillStyle = '#fff'; c.strokeStyle = C.ink; c.lineWidth = 3;
    c.beginPath(); c.ellipse(x, y, 20, 25, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(x, y - 28, 11, 14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (st.kind === 'holdDemo') {
      c.fillStyle = C.beak;
      c.beginPath(); c.arc(x + 40, y - 6, 12 + Math.sin(t * 12) * 3, 0, Math.PI * 2); c.fill();
      c.stroke();
    } else {
      var times = st.times || 2;
      var ph = (t * times) % 1;
      var sc = 1 - Math.max(0, 1 - ph * 4) * 0.5;
      c.save(); c.translate(x, y - 62); c.scale(sc, sc);
      c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2);
      c.fillStyle = 'rgba(228,69,58,.6)'; c.fill(); c.strokeStyle = C.ink; c.lineWidth = 2.4; c.stroke();
      c.restore();
    }
    c.restore();
  }

  /* ================= 剧情幕绘制（幕一 / 幕二） ================= */
  function drawStory() {
    if (Game.state === 'act1') drawAct1();
    else if (Game.state === 'act2') drawAct2();
    else if (Game.state === 'finale') drawFinale();
  }

  /** 幕一 · 小鸭卧室（夜）：床 + 被子 + 闹钟 + 窗；结尾金光扫过 */
  function drawAct1() {
    var g = grad('room_night', function () {
      var gr = c.createLinearGradient(0, 0, 0, viewH);
      gr.addColorStop(0, '#D8D2C0'); gr.addColorStop(1, '#EFE0C0');
      return gr;
    });
    c.fillStyle = g; c.fillRect(0, 0, viewW, viewH);
    /* 墙 */
    c.fillStyle = 'rgba(255,251,236,.6)'; c.fillRect(0, 0, viewW, viewH * 0.62);
    /* 窗 + 月亮（结尾变金色） */
    var dawn = St.dawnPhase();
    c.save();
    c.translate(viewW - 170, 110);
    c.fillStyle = dawn > 0 ? mix('#3A4A6A', '#FFD98A', dawn) : '#3A4A6A';
    rr(-70, -50, 140, 100, K.R.md); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
    if (dawn <= 0) { c.fillStyle = '#FFF3D0'; c.beginPath(); c.arc(30, -16, 20, 0, Math.PI * 2); c.fill(); }
    c.restore();
    /* 床 */
    var bedY = viewH - 170;
    c.fillStyle = '#C9A874'; c.fillRect(120, bedY, 620, 130);
    c.fillStyle = '#B08A5A'; c.fillRect(120, bedY, 620, 16);
    c.strokeStyle = C.ink; c.lineWidth = 4; c.strokeRect(120, bedY, 620, 130);
    /* 枕头 */
    c.fillStyle = '#FFF6E0'; rr(150, bedY - 34, 120, 46, K.R.sm); c.fill(); c.stroke();
    /* 被子：随呼吸起伏 */
    var br = St.t() ? Math.sin(St.t() / K.BREATH_PERIOD * Math.PI * 2) * 5 : 0;
    c.save();
    c.fillStyle = C.chick;
    rr(280, bedY - 34 - br, 440, 60 + br, K.R.md); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
    c.restore();
    /* 小鸭侧躺 */
    c.save(); c.translate(250, bedY - 44 - br);
    var st = St.t() < 3 || St.skipping() ? 'sleep' : 'snore';
    var bub = (St.t() > 3 && St.t() < 17) ? ((St.t() * 0.6) % 1) : 0;
    var R = Art.resolve('duck', st, { t: St.t(), bubble: bub });
    c.scale(Game.dir, 1);
    R.draw(c, R.def, { t: St.t(), bubble: bub });
    c.restore();
    /* 床头闹钟 */
    c.save(); c.translate(700, bedY - 60);
    c.fillStyle = C.comb; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 3.5; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 19, 0, Math.PI * 2); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -13); c.moveTo(0, 0); c.lineTo(10, 4); c.stroke();
    c.restore();
    /* 静默光晕（视觉替代音效表达「安静」） */
    var pr = St.progress();
    if (pr > 0.68) {
      var k = Math.min(1, (pr - 0.68) / 0.32);
      c.save(); c.globalAlpha = 0.4 * k;
      var rg = c.createRadialGradient(viewW / 2, viewH * 0.5, 20, viewW / 2, viewH * 0.5, 320);
      rg.addColorStop(0, 'rgba(255,240,190,.95)'); rg.addColorStop(1, 'rgba(255,240,190,0)');
      c.fillStyle = rg; c.fillRect(0, 0, viewW, viewH);
      c.restore();
    }
    /* 金光左→右扫过 */
    if (dawn > 0) {
      c.save(); c.globalAlpha = 0.55 * (1 - dawn * 0.4);
      var sx = dawn * (viewW + 360) - 180;
      var lg = c.createLinearGradient(sx - 180, 0, sx + 180, 0);
      lg.addColorStop(0, 'rgba(255,217,138,0)'); lg.addColorStop(0.5, 'rgba(255,240,190,.9)'); lg.addColorStop(1, 'rgba(255,217,138,0)');
      c.fillStyle = lg; c.fillRect(0, 0, viewW, viewH);
      c.restore();
    }
    if (St.waiting()) drawStoryHint('👆');
  }

  /** 幕二 · 卧室晨 / 卫生间：6 段逐段点击；厕所段只有影子 + 圆圈，无任何排泄物 */
  function drawAct2() {
    var step = St.currentStep();
    var t = St.t();
    if (!step) return;
    var g = grad('room_morning', function () {
      var gr = c.createLinearGradient(0, 0, 0, viewH);
      gr.addColorStop(0, '#FFE9B8'); gr.addColorStop(1, '#FFF6E0');
      return gr;
    });
    c.fillStyle = g; c.fillRect(0, 0, viewW, viewH);
    var floorY = viewH - 120;

    if (step.pose === 'toilet') {
      /* —— M2-3 卫生间：门 + 影子 + 圆圈，完全抽象化 —— */
      c.save();
      c.fillStyle = '#EAD3A8'; c.fillRect(0, floorY - 20, viewW, 20);
      /* 洗手台 */
      c.fillStyle = '#fff'; rr(80, floorY - 110, 200, 100, K.R.md); c.fill();
      c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#B8D8E8'; c.beginPath(); c.ellipse(180, floorY - 110, 60, 12, 0, 0, Math.PI * 2); c.fill();
      /* 门 */
      c.fillStyle = '#D8B888'; rr(360, floorY - 300, 220, 300, K.R.md); c.fill(); c.stroke();
      c.beginPath(); c.arc(556, floorY - 150, 8, 0, Math.PI * 2); c.fillStyle = C.ink; c.fill();
      /* 门后影子：只有轮廓，故意看不出在做什么 */
      var sh = Math.sin(t * 3.4) * 8;
      c.save(); c.globalAlpha = 0.55; c.fillStyle = '#8A7250';
      c.beginPath(); c.ellipse(470 + sh, floorY - 120, 30, 76, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(470 + sh, floorY - 206, 22, 0, Math.PI * 2); c.fill();
      c.restore();
      /* 头顶小圆圈（抽象「使劲」） */
      for (var i = 0; i < 3; i++) {
        var ph = ((t * 0.6 + i / 3) % 1);
        c.save(); c.globalAlpha = 1 - ph;
        c.beginPath(); c.arc(470 + sh, floorY - 240 - ph * 40, 6 + ph * 8, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.strokeStyle = C.ink; c.lineWidth = 2.4; c.fill(); c.stroke();
        c.restore();
      }
      c.restore();
      /* 无台词 */
    } else {
      /* —— 卧室晨 —— */
      c.fillStyle = 'rgba(255,246,224,.8)'; c.fillRect(0, 0, viewW, floorY);
      c.fillStyle = '#E0C48E'; c.fillRect(0, floorY, viewW, viewH - floorY);
      /* 窗 + 金光 */
      c.save(); c.translate(viewW - 190, 120);
      c.fillStyle = '#FFE9B8'; rr(-80, -60, 160, 120, K.R.md); c.fill();
      c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
      c.restore();
      /* 床 */
      var bedY = floorY - 90;
      c.fillStyle = '#C9A874'; c.fillRect(110, bedY, 340, 100);
      c.strokeStyle = C.ink; c.lineWidth = 4; c.strokeRect(110, bedY, 340, 100);
      c.fillStyle = '#FFF6E0'; rr(130, bedY - 28, 100, 38, K.R.sm); c.fill(); c.stroke();
      /* 洗手台（洗手/擦手段） */
      if (step.pose === 'wash' || step.pose === 'wipe') {
        c.fillStyle = '#fff'; rr(600, floorY - 120, 220, 110, K.R.md); c.fill();
        c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
        c.fillStyle = '#B8D8E8'; c.beginPath(); c.ellipse(710, floorY - 118, 68, 12, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = C.ink; c.lineWidth = 3;
        c.beginPath(); c.moveTo(710, floorY - 118); c.lineTo(710, floorY - 150); c.stroke();
        /* 镜子 */
        c.fillStyle = '#E4F0F6'; rr(660, floorY - 280, 120, 120, K.R.md); c.fill(); c.stroke();
      }
      /* 垃圾桶（擦手段） */
      if (step.pose === 'wipe') {
        c.fillStyle = '#B8C8D0'; c.fillRect(870, floorY - 70, 54, 70);
        c.strokeStyle = C.ink; c.lineWidth = 3.4; c.strokeRect(870, floorY - 70, 54, 70);
      }
      /* 小鸭 */
      var pose = step.pose;
      var pose2 = (step.pose === 'stretch' && (t % 8) < 4) ? 'rubEye' : pose;
      c.save(); c.translate(470, floorY);
      var R = Art.resolve('duck', pose2, { t: St.t() });
      c.scale(Game.dir, 1);
      R.draw(c, R.def, { t: St.t() });
      c.restore();
      /* 气泡 */
      if (step.line) {
        c.save();
        c.globalAlpha = Math.min(1, St.stepT() * 2);
        Art.drawBubble(c, 470, floorY - 96, step.line, {});
        c.restore();
      }
      /* 四枚勾：左上角依次点亮 */
      drawHygieneChecks();
    }
    drawStoryHint('👆');
  }

  /** 四枚勾（想上厕所 / 上厕所 / 洗手 / 擦干净），全亮撒彩带 */
  function drawHygieneChecks() {
    var h = global.Save.data.hygiene;
    var items = [['potty', '🚽'], ['wipe', '🚿'], ['wash', '🧼'], ['bag', '🎒']];
    c.save();
    for (var i = 0; i < items.length; i++) {
      var x = 40 + i * 66, y = 34;
      c.globalAlpha = h[items[i][0]] ? 1 : 0.28;
      c.fillStyle = '#fff'; rr(x, y, 52, 52, K.R.md); c.fill();
      c.strokeStyle = C.ink; c.lineWidth = 3; c.stroke();
      c.font = '24px ' + font; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(items[i][1], x + 26, y + 26);
      if (h[items[i][0]]) {
        c.strokeStyle = C.beak; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x + 34, y + 12); c.lineTo(x + 41, y + 22); c.lineTo(x + 51, y + 6); c.stroke();
      }
    }
    c.restore();
  }

  function drawStoryHint(icon) {
    c.save();
    c.globalAlpha = 0.55 + Math.sin(Game.animT * 4) * 0.2;
    c.fillStyle = C.comb;
    c.beginPath(); c.arc(viewW / 2, viewH - 44, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.font = '24px ' + font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(icon, viewW / 2, viewH - 42);
    c.restore();
  }

  /** 结局：8 位同学列队和小鸭一起走进家门 + 大礼花 */
  function drawFinale() {
    var t = Game.finaleT;
    var g = grad('finale_sky', function () {
      var gr = c.createLinearGradient(0, 0, 0, viewH);
      gr.addColorStop(0, C.skyInA); gr.addColorStop(1, C.skyInB);
      return gr;
    });
    c.fillStyle = g; c.fillRect(0, 0, viewW, viewH);
    var gy = viewH - 130;
    c.fillStyle = '#E0C48E'; c.fillRect(0, gy, viewW, viewH - gy);
    /* 家门 */
    var hx = viewW - 250;
    c.fillStyle = '#FFF6E0'; rr(hx, gy - 220, 200, 220, K.R.md); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke();
    c.fillStyle = C.comb;
    c.beginPath(); c.moveTo(hx - 18, gy - 218); c.lineTo(hx + 100, gy - 300); c.lineTo(hx + 218, gy - 218); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#8A5A3A'; rr(hx + 70, gy - 120, 62, 120, K.R.sm); c.fill(); c.stroke();
    /* 队伍：8 位 + 小鸭，走向家门 */
    var walk = Math.min(1, t / 3.4);
    var n = K.LINEUP.length;
    for (var i = n - 1; i >= 0; i--) {
      var id = K.LINEUP[i];
      var x = 90 + i * 46 + walk * (hx - 300);
      c.save(); c.translate(x, gy);
      c.scale(Game.dir, 1);
      var st = Math.abs(Math.sin(t * 6 + i)) > 0.5 ? 'run' : 'stand';
      var R = Art.resolve(id, st, { t: t + i, frame: Math.floor(t * 6 + i) % 2 });
      if (R.draw) R.draw(c, R.def, { t: t + i, frame: Math.floor(t * 6 + i) % 2 });
      c.restore();
    }
    /* 小鸭挽手走（主角最后/最前） */
    c.save(); c.translate(40 + walk * (hx - 260), gy);
    c.scale(Game.dir, 1);
    var Rd = Art.resolve('duck', Math.abs(Math.sin(t * 6)) > 0.5 ? 'walkArm' : 'walkArm', { t: t, frame: Math.floor(t * 6) % 2, partner: 'right' });
    if (Rd.draw) Rd.draw(c, Rd.def, { t: t, frame: Math.floor(t * 6) % 2, partner: 'right' });
    c.restore();
    /* 全员气泡 */
    if (t < 2.2) Art.drawBubble(c, hx + 100, gy - 340, '回家咯——！', { alpha: 1 - t / 2.2 });
    Art.drawParticles(c);
  }

  /* ================= 一帧 ================= */
  function frame(alpha) {
    if (!c) return;
    Game.advanceBob(Render._dt || 0);
    var camS = Game.camS;

    if (Game.state === 'paused') { drawWorldFrame(alpha, camS); return; }
    if (Game.state === 'act1' || Game.state === 'act2' || Game.state === 'finale') {
      drawStory();
      drawHUD();
      return;
    }
    if (Game.state === 'title' || Game.state === 'boot') { drawTitleBackdrop(); return; }
    drawWorldFrame(alpha, camS);
  }

  function drawTitleBackdrop() {
    var g = grad('title_bg', function () {
      var gr = c.createLinearGradient(0, 0, 0, viewH);
      gr.addColorStop(0, C.skyOutA); gr.addColorStop(1, C.skyOutB);
      return gr;
    });
    c.fillStyle = g; c.fillRect(0, 0, viewW, viewH);
    var gy = viewH - 120;
    c.fillStyle = '#D2B184'; c.fillRect(0, gy, viewW, viewH - gy);
    c.save(); c.translate(viewW * 0.72, gy);
    c.scale(1, 1);
    var R = Art.resolve('duck', 'wave', { t: Game.animT });
    if (R.draw) R.draw(c, R.def, { t: Game.animT });
    c.restore();
    Art.drawParticles(c);
  }

  function drawWorldFrame(alpha, camS) {
    var seg = Game.seg;
    if (!seg) { drawTitleBackdrop(); return; }
    var scene = Art.SCENES[seg.scene] || Art.SCENES.village_start;

    drawSky(seg.sky, camS);
    drawFar(scene.far, camS);
    drawMid(scene.mid, camS);
    drawGroundBand(seg.terrain && seg.terrain[0] ? seg.terrain[0].kind : 'road', camS);
    /* ★ z4 箭头带：回程全部朝左 */
    drawArrowBand(seg.arrows, camS);
    drawObstacles();
    drawGoalProps();
    drawCharacters(alpha);
    drawParticles();
    drawFore(camS);
    drawBubbles();
    drawHUD();

    /* 中途事件遮罩文字（正向鼓励，不做失败暗示） */
    if (Game.subState === 'midEvent') drawMidOverlay();
  }

  function drawMidOverlay() {
    var k = Math.min(1, Game.l5.midT / 0.4);
    c.save(); c.globalAlpha = 0.9 * k;
    c.fillStyle = 'rgba(255,251,236,.86)';
    rr(viewW / 2 - 200, 44, 400, 60, K.R.md); c.fill();
    c.strokeStyle = C.beak; c.lineWidth = 4; c.stroke();
    c.fillStyle = C.ink; c.font = '700 26px ' + font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('出发！一起回家！', viewW / 2, 74);
    c.restore();
  }

  global.Render = {
    init: function (canvas) { cv = canvas; c = cv.getContext('2d'); },
    ctx: function () { return c; },
    frame: frame,
    grad: grad,
    gradCount: gradCount,
    clearGradCache: clearGradCache,
    worldToScreenX: worldToScreenX,
    sToX: sToX,
    xToS: xToS,
    hitRect: hitRect,
    hitTest: hitTest,
    clearHits: clearHits,
    setView: setView,
    viewW: viewWNow,
    viewH: function () { return viewH; },
    _dt: 0,
    drawStory: drawStory
  };
})(window);
