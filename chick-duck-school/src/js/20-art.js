/* ===== src/js/20-art.js · 程序化绘图：角色 / 场景 / 道具 / 特效 · 依赖 00-const =====
 * 架构红线：角色绘制必须是「CHAR_DEF（数据）+ Parts（构件）+ POSES（姿态表）+ resolve()」三层，
 * 绝不允许写成 if(id=='duck' && pose=='sleep') ... else if(...) 的分支泥潭（40+ 姿态会失控）。
 * 小鸭 15 个姿态（PRD §9.1 P0 清单），8 位同学各 2–4 个。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var C = K.C;

  /* ================= 第 1 层：角色描述（纯数据） ================= */
  var CHAR_DEF = {
    duck:     { name: '小鸭', body: '#FFE9A8', line: '#F7C948', size: 56, ear: 'none',  acc: 'bag',     shadow: C.shadow },
    qiaoqiao: { name: '巧巧', body: '#F2EDE4', line: '#D9C9B4', size: 48, ear: 'up',    acc: 'bag',     tuft: true },
    kelin:    { name: '可林', body: '#F5D08A', line: '#D9A05B', size: 48, ear: 'flop',  acc: 'ball',    hat: '#7FB2E5' },
    sheep:    { name: '小羊', body: '#F2EDE4', line: '#D9C9B4', size: 46, ear: 'side',  acc: null,      wool: true },
    cat:      { name: '小猫', body: '#8E8B96', line: '#6E6B76', size: 44, ear: 'point', acc: null,      tail: 'up' },
    dog:      { name: '小狗', body: '#D9A05B', line: '#B07C3E', size: 46, ear: 'flop',  acc: null,      tongue: true },
    pig:      { name: '小猪', body: '#F0A7B4', line: '#D4838F', size: 46, ear: 'side',  acc: null,      tail: 'curl' },
    rabbit:   { name: '小兔', body: '#EFE6DA', line: '#D2C6B4', size: 44, ear: 'up',    acc: 'carrot' },
    goose:    { name: '小鹅', body: '#F5F2E8', line: '#D8D2C0', size: 48, ear: 'none',  acc: null,      longBeak: true }
  };

  /* ================= 第 2 层：姿态构件（跨角色复用） ================= */
  var LW = K.C ? 3 : 3;                       /* 全站统一描边宽 */
  var Parts = {
    /** 椭圆软影 */
    shadow: function (c, r, alpha) {
      c.save(); c.globalAlpha = alpha === undefined ? 1 : alpha;
      c.fillStyle = C.shadow;
      c.beginPath(); c.ellipse(0, r * 0.92, r * 0.86, r * 0.28, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    },
    /** 圆身 + 3px 描边（可指定 squashY / squashX 做挤压形变） */
    body: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5 * (o.sizeMul || 1);
      c.save();
      if (o.rot) { c.translate(o.dx || 0, o.dy || 0); c.rotate(o.rot); c.translate(-(o.dx || 0), -(o.dy || 0)); }
      c.scale(o.sx || 1, o.sy || 1);
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.94, 0, 0, Math.PI * 2);
      c.fillStyle = o.fill || d.body; c.fill();
      c.lineWidth = o.lineW || LW; c.strokeStyle = d.line;
      c.stroke();
      c.restore();
    },
    /** 耳朵：up 长竖耳 / flop 垂耳 / point 尖耳 / side 圆耳 */
    ear: function (c, d, kind) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = d.body;
      if (kind === 'up') {
        c.beginPath(); c.ellipse(-r * 0.42, -r * 0.92, r * 0.2, r * 0.52, -0.18, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(r * 0.42, -r * 0.92, r * 0.2, r * 0.52, 0.18, 0, Math.PI * 2); c.fill(); c.stroke();
      } else if (kind === 'flop') {
        c.beginPath(); c.ellipse(-r * 0.74, -r * 0.08, r * 0.2, r * 0.42, -0.5, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(r * 0.74, -r * 0.08, r * 0.2, r * 0.42, 0.5, 0, Math.PI * 2); c.fill(); c.stroke();
      } else if (kind === 'point') {
        c.beginPath(); c.moveTo(-r * 0.6, -r * 0.58); c.lineTo(-r * 0.42, -r * 1.2); c.lineTo(-r * 0.12, -r * 0.68); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(r * 0.6, -r * 0.58); c.lineTo(r * 0.42, -r * 1.2); c.lineTo(r * 0.12, -r * 0.68); c.closePath(); c.fill(); c.stroke();
      } else if (kind === 'side') {
        c.beginPath(); c.ellipse(-r * 0.82, -r * 0.34, r * 0.22, r * 0.26, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(r * 0.82, -r * 0.34, r * 0.22, r * 0.26, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      c.restore();
    },
    /** 头顶呆毛（鸭子类） */
    hornTuft: function (c, d, bend) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -r * 0.9);
      c.quadraticCurveTo(bend * r * 0.4, -r * 1.42, bend * r * 0.86, -r * 1.24);
      c.stroke(); c.restore();
    },
    /** 呆毛卷（可林） */
    hornTuftCurl: function (c, d) { Parts.hornTuft(c, d, -1); },
    /** 卷毛（小羊） */
    wool: function (c, d) {
      var r = d.size * 0.5;
      c.save(); c.fillStyle = '#fff'; c.lineWidth = LW; c.strokeStyle = d.line;
      for (var i = 0; i < 5; i++) {
        var a = Math.PI * (0.9 + i * 0.28);
        c.beginPath(); c.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.24, 0, Math.PI * 2);
        c.fill(); c.stroke();
      }
      c.restore();
    },
    /** 扁喙 / 长喙 */
    beak: function (c, d, longB) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = C.beak;
      var w = r * (longB ? 0.46 : 0.4), h = r * (longB ? 0.2 : 0.26);
      c.beginPath(); c.ellipse(r * 0.72, r * 0.06, w, h, longB ? 0.12 : 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.restore();
    },
    /** 眼白 + 瞳孔 + 眉毛（5 种表情 + 眨眼） */
    face: function (c, d, expr, blink) {
      var r = d.size * 0.5;
      var ex = r * 0.3, ey = -r * 0.16, er = r * 0.155;
      c.save();
      c.lineWidth = 2; c.strokeStyle = C.ink; c.lineCap = 'round';
      var open = !(blink && blink > 0.86);
      function eyeDot(x) {
        if (!open) { c.beginPath(); c.moveTo(x - er, ey); c.lineTo(x + er, ey); c.stroke(); return; }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x, ey, er, 0, Math.PI * 2); c.fill(); c.stroke();
        if (expr === 'ouch') {                                   /* >_< */
          c.beginPath(); c.moveTo(x - er * 0.6, ey - er * 0.4); c.lineTo(x + er * 0.6, ey + er * 0.4); c.stroke();
          c.beginPath(); c.moveTo(x + er * 0.6, ey - er * 0.4); c.lineTo(x - er * 0.6, ey + er * 0.4); c.stroke();
        } else if (expr === '@_@') {                              /* 晕乎乎 */
          c.beginPath(); c.arc(x, ey, er * 0.5, 0, Math.PI * 2); c.fillStyle = C.ink; c.fill();
        } else {
          c.beginPath(); c.arc(x + er * 0.28, ey + (expr === 'happy' ? er * 0.1 : 0), er * 0.48, 0, Math.PI * 2);
          c.fillStyle = C.ink; c.fill();
          if (expr === 'happy') { c.beginPath(); c.arc(x - er * 0.3, ey - er * 0.25, er * 0.2, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
        }
      }
      eyeDot(-ex); eyeDot(ex);
      /* 腮红 */
      c.globalAlpha = 0.4; c.fillStyle = C.comb;
      c.beginPath(); c.ellipse(-r * 0.52, r * 0.14, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(r * 0.5, r * 0.14, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      /* 眉毛 */
      c.lineWidth = 2.4;
      if (expr === 'sleepy' || expr === 'ouch' || expr === '@_@') {
        c.beginPath(); c.moveTo(-ex - er, ey - er * 1.9); c.lineTo(-ex + er * 0.6, ey - er * 1.3); c.stroke();
        c.beginPath(); c.moveTo(ex + er, ey - er * 1.9); c.lineTo(ex - er * 0.6, ey - er * 1.3); c.stroke();
      } else if (expr === 'happy') {
        c.beginPath(); c.moveTo(-ex - er, ey - er * 1.2); c.quadraticCurveTo(-ex, ey - er * 2.3, -ex + er, ey - er * 1.2); c.stroke();
        c.beginPath(); c.moveTo(ex - er, ey - er * 1.2); c.quadraticCurveTo(ex, ey - er * 2.3, ex + er, ey - er * 1.2); c.stroke();
      }
      /* 嘴 */
      c.lineWidth = 2.2;
      c.beginPath();
      if (expr === 'happy') { c.moveTo(r * 0.02, r * 0.3); c.quadraticCurveTo(r * 0.28, r * 0.52, r * 0.5, r * 0.28); }
      else if (expr === 'sleepy' || expr === 'ouch' || expr === '@_@') { c.moveTo(r * 0.28, r * 0.4); c.quadraticCurveTo(r * 0.4, r * 0.3, r * 0.5, r * 0.42); }
      else { c.moveTo(r * 0.2, r * 0.34); c.quadraticCurveTo(r * 0.4, r * 0.46, r * 0.56, r * 0.3); }
      c.stroke();
      c.restore();
    },
    /** 睡觉用闭眼弧 */
    closedEye: function (c, d, y, r0) {
      var r = d.size * 0.5, ex = r * 0.3, ey = y === undefined ? -r * 0.16 : y;
      c.save(); c.lineWidth = 2.2; c.strokeStyle = C.ink; c.lineCap = 'round';
      c.beginPath(); c.arc(-ex, ey, r0 || r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI, true); c.stroke();
      c.beginPath(); c.arc(ex, ey, r0 || r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI, true); c.stroke();
      c.restore();
    },
    /** 小短脚：phase = 跑动帧号 */
    legPair: function (c, d, phase, sp) {
      var r = d.size * 0.5, y = r * 0.78, sw = Math.sin((phase || 0) * Math.PI / 2) * r * 0.24;
      c.save(); c.lineWidth = LW; c.strokeStyle = C.beak; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r * 0.22, y - r * 0.1); c.lineTo(-r * 0.22 - sw, y + (sp ? sp * r * 0.2 : 0)); c.stroke();
      c.beginPath(); c.moveTo(r * 0.22, y - r * 0.1); c.lineTo(r * 0.22 + sw, y + (sp ? sp * r * 0.2 : 0)); c.stroke();
      c.restore();
    },
    /** 书包 */
    bag: function (c, d) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = C.comb;
      c.beginPath(); c.roundRect ? c.roundRect(-r * 0.98, -r * 0.3, r * 0.46, r * 0.56, r * 0.12) : c.rect(-r * 0.98, -r * 0.3, r * 0.46, r * 0.56);
      c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.1); c.quadraticCurveTo(0, -r * 0.86, r * 0.5, -r * 0.1); c.stroke();
      c.restore();
    },
    /** 皮球 */
    ball: function (c, d) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = C.beak;
      c.beginPath(); c.arc(-r * 0.9, r * 0.5, r * 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-r * 1.06, r * 0.5); c.quadraticCurveTo(-r * 0.9, r * 0.24, -r * 0.74, r * 0.5); c.stroke();
      c.restore();
    },
    /** 胡萝卜包 */
    carrotBag: function (c, d) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = C.beak;
      c.beginPath(); c.moveTo(-r * 1.0, -r * 0.2); c.lineTo(-r * 0.68, -r * 0.2); c.lineTo(-r * 0.84, r * 0.34); c.closePath();
      c.fill(); c.stroke(); c.restore();
    },
    /** 小蓝帽 */
    hat: function (c, d, col) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.fillStyle = col || '#7FB2E5';
      c.beginPath(); c.ellipse(0, -r * 0.82, r * 0.62, r * 0.2, 0, Math.PI, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -r * 0.5, r * 0.9, r * 0.16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    },
    /** 翘尾 / 卷尾 */
    tail: function (c, d, kind) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = LW; c.strokeStyle = d.line; c.lineCap = 'round';
      c.beginPath();
      if (kind === 'curl') { c.moveTo(-r * 0.8, r * 0.1); c.bezierCurveTo(-r * 1.3, r * 0.3, -r * 1.2, -r * 0.4, -r * 0.82, -r * 0.2); }
      else { c.moveTo(-r * 0.82, r * 0.16); c.quadraticCurveTo(-r * 1.24, r * 0.06, -r * 1.14, -r * 0.34); }
      c.stroke(); c.restore();
    },
    /** 舌头 */
    tongue: function (c, d) {
      var r = d.size * 0.5;
      c.save(); c.lineWidth = 1.6; c.strokeStyle = d.line; c.fillStyle = C.comb;
      c.beginPath(); c.ellipse(r * 0.44, r * 0.42, r * 0.16, r * 0.22, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    },
    /** 挥动的小手 */
    hand: function (c, x, y, ang, col, line) {
      c.save(); c.translate(x, y); c.rotate(ang || 0);
      c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2);
      c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = line; c.stroke();
      c.restore();
    },
    /** 头顶 3 颗绕圈小星星（碰撞坐地演出 / 落水） */
    stars: function (c, d, t) {
      var r = d.size * 0.5;
      c.save();
      for (var i = 0; i < 3; i++) {
        var a = t * 4.2 + i * Math.PI * 2 / 3;
        var x = Math.cos(a) * r * 0.9, y = -r * 1.28 + Math.sin(a) * r * 0.3;
        var sc = 0.85 + Math.sin(a) * 0.2;
        c.save(); c.translate(x, y); c.scale(sc, sc); c.rotate(a * 0.4);
        c.beginPath();
        for (var j = 0; j < 10; j++) {
          var rad = (j % 2 === 0 ? 5 : 2.2), ang = -Math.PI / 2 + j * Math.PI / 5;
          c[j ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        c.closePath(); c.fillStyle = C.chick; c.lineWidth = 1.6; c.strokeStyle = C.chickBr; c.fill(); c.stroke();
        c.restore();
      }
      c.restore();
    }
  };

  /* ================= 第 3 层：姿态表 ================= */
  var POSES = {};

  /* --- 小鸭 15 个姿态（PRD §9.1 逐条对应）--- */
  POSES.duck = {
    /* ① 侧躺睡觉（含呼吸起伏，o.t 驱动） */
    sleep: function (c, d, o) {
      o = o || {};
      var br = o.t === undefined ? 0 : Math.sin(o.t / K.BREATH_PERIOD * Math.PI * 2) * 0.06;
      Parts.shadow(c, d.size * 0.5, 0.8);
      Parts.body(c, d, { sx: 1.1, sy: 0.88 - br, rot: -0.14, dy: d.size * 0.04 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.closedEye(c, d);
    },
    /* ② 熟睡打呼噜（鼻子冒气泡、嘴微张） */
    snore: function (c, d, o) {
      POSES.duck.sleep(c, d, o);
      var r = d.size * 0.5;
      c.save(); c.lineWidth = 2; c.strokeStyle = d.line;
      c.beginPath(); c.arc(r * 0.72, r * 0.34, r * 0.13, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
      if (o && o.bubble) {
        var b = o.bubble;
        c.globalAlpha = 0.85;
        c.beginPath(); c.arc(r * (0.86 + b * 0.5), -r * (0.2 + b * 1.05), r * (0.1 + b * 0.2), 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.lineWidth = 2; c.strokeStyle = C.chickBr; c.fill(); c.stroke();
        c.globalAlpha = 1;
      }
      c.restore();
    },
    /* ③ 睡眼惺忪揉眼 */
    rubEye: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.sin((o.t || 0) * 3.4) * 0.5 + 0.5;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, { sy: 1 + k * 0.03 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'sleepy', false);
      Parts.hand(c, r * 0.3, -r * 0.18 - k * r * 0.06, -0.6 + k * 0.5, d.body, d.line);
      Parts.legPair(c, d, 0);
    },
    /* ④ 伸懒腰（身体拉长） */
    stretch: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.min(1, (o.t || 0) / 1.1);
      var sy = 1 + k * 0.18, sx = 1 - k * 0.1;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, { sx: sx, sy: sy });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', false);
      Parts.hand(c, -r * 0.8, -r * (0.7 + k * 0.28), -0.9 - k * 0.5, d.body, d.line);
      Parts.hand(c, r * 0.8, -r * (0.7 + k * 0.28), 0.9 + k * 0.5, d.body, d.line);
      Parts.legPair(c, d, 0);
    },
    /* ⑤ 憋不住扭动 */
    fidget: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, w = Math.sin((o.t || 0) * 7) * 0.12;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, { sx: 1 + w * 0.4, sy: 1 - w * 0.4, rot: w });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'ouch', false);
      Parts.legPair(c, d, 1, 1);
    },
    /* ⑥ 洗手搓泡泡 */
    wash: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.sin((o.t || 0) * 6) * 0.5 + 0.5;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, {});
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', false);
      Parts.hand(c, r * (0.36 + k * 0.14), -r * 0.1, 0.5, d.body, d.line);
      Parts.hand(c, r * (0.36 - k * 0.14), -r * 0.02, -0.5, d.body, d.line);
      Parts.legPair(c, d, 0);
      /* 泡泡从小变大 */
      var n = 3;
      for (var i = 0; i < n; i++) {
        var ph = ((o.t || 0) * 0.5 + i / n) % 1;
        c.save(); c.globalAlpha = 1 - ph * 0.7;
        c.beginPath();
        c.arc(r * (0.5 + ph * 0.5), -r * (0.2 + ph * 0.9), r * (0.07 + ph * 0.16), 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.lineWidth = 1.6; c.strokeStyle = C.chickBr; c.fill(); c.stroke();
        c.restore();
      }
    },
    /* ⑦ 擦手（纸巾） */
    wipe: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.sin((o.t || 0) * 5) * 0.5 + 0.5;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, {});
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', false);
      Parts.hand(c, r * (0.34 + k * 0.1), -r * 0.08, 0.4, d.body, d.line);
      c.save(); c.translate(r * (0.5 + k * 0.1), -r * 0.16); c.rotate(0.5 + k * 0.4);
      c.beginPath(); c.roundRect ? c.roundRect(-7, -6, 14, 12, 3) : c.rect(-7, -6, 14, 12);
      c.fillStyle = '#fff'; c.lineWidth = 1.8; c.strokeStyle = '#D8D2C0'; c.fill(); c.stroke();
      c.restore();
      Parts.legPair(c, d, 0);
    },
    /* ⑧ 背书包站立 */
    standBag: function (c, d, o) {
      Parts.shadow(c, d.size * 0.5, 0.9);
      Parts.body(c, d, {});
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'normal', o ? o.blink : false);
      Parts.bag(c, d);
      Parts.legPair(c, d, 0);
    },
    /* ⑨ 跑动 4 帧循环 */
    run: function (c, d, o) {
      o = o || {};
      var f = o.frame || 0, r = d.size * 0.5;
      var bob = (f === 1 || f === 3) ? -r * 0.08 : 0;
      Parts.shadow(c, r, 0.9 - Math.abs(bob) / r * 0.2);
      c.save(); c.translate(0, bob);
      Parts.body(c, d, { sy: 1.04, sx: 0.98 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', o.blink);
      Parts.bag(c, d);
      Parts.legPair(c, d, f, 1);
      Parts.hand(c, -r * 0.3, r * 0.1, 0.9, d.body, d.line);
      Parts.hand(c, r * 0.3, r * 0.1, -0.9, d.body, d.line);
      c.restore();
    },
    /* ⑩ 跳跃（拉伸） */
    jump: function (c, d, o) {
      var r = d.size * 0.5;
      Parts.shadow(c, r, 0.7);
      Parts.body(c, d, { sx: 0.9, sy: 1.14 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', o && o.blink);
      Parts.bag(c, d);
      Parts.legPair(c, d, 0, -1);
    },
    /* ⑪ 下落（压扁） */
    fall: function (c, d, o) {
      var r = d.size * 0.5;
      Parts.shadow(c, r, 0.6);
      Parts.body(c, d, { sx: 1.06, sy: 0.94 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'normal', o && o.blink);
      Parts.bag(c, d);
      Parts.legPair(c, d, 1, -1);
    },
    /* ⑫ 落地压扁（o.t 衰减回弹） */
    land: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.max(0, 1 - (o.t || 0) / 0.18);
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, { sx: 1 + k * 0.22, sy: 1 - k * 0.2 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'normal', false);
      Parts.bag(c, d);
      Parts.legPair(c, d, 0, 1);
    },
    /* ⑬ 坐地晕乎星星（关键表情） */
    sitStars: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5;
      Parts.shadow(c, r * 1.05, 0.9);
      Parts.body(c, d, { sx: 1.04, sy: 0.9, dy: r * 0.24 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, o.t > 0.3 ? '@_@' : 'ouch', false);
      Parts.stars(c, d, o.t || 0);
      c.save(); c.lineWidth = 2.4; c.strokeStyle = C.beak; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-r * 0.4, r * 0.96); c.lineTo(-r * 0.78, r * 1.06); c.stroke();
      c.beginPath(); c.moveTo(r * 0.4, r * 0.96); c.lineTo(r * 0.78, r * 1.06); c.stroke();
      c.restore();
    },
    /* ⑭ 开心挥手 */
    wave: function (c, d, o) {
      o = o || {};
      var r = d.size * 0.5, k = Math.sin((o.t || 0) * 8) * 0.5 + 0.5;
      Parts.shadow(c, r, 0.9);
      Parts.body(c, d, {});
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', o.blink);
      Parts.bag(c, d);
      Parts.hand(c, r * 0.8, -r * (0.5 + k * 0.14), 1.9 + k * 0.5, d.body, d.line);
      Parts.legPair(c, d, 0);
    },
    /* ⑮ 结尾挽着同学走 */
    walkArm: function (c, d, o) {
      o = o || {};
      var f = o.frame || 0, r = d.size * 0.5;
      var bob = (f === 1 || f === 3) ? -r * 0.06 : 0;
      Parts.shadow(c, r, 0.9);
      c.save(); c.translate(0, bob);
      Parts.body(c, d, { sy: 1.03 });
      Parts.hornTuft(c, d, 1);
      Parts.beak(c, d, false);
      Parts.face(c, d, 'happy', o.blink);
      Parts.bag(c, d);
      Parts.legPair(c, d, f, 1);
      /* 挽手：朝 partner 方向伸出去 */
      var side = o.partner === 'left' ? -1 : 1;
      Parts.hand(c, side * r * 0.96, -r * 0.06, side * 0.9, d.body, d.line);
      c.restore();
    },
    stand: function (c, d, o) { POSES.duck.standBag(c, d, o); },
    default: 'standBag'
  };

  /* --- 通用同学姿态工厂：站/走/跳/挥手/招手 --- */
  function basePose(id) {
    var def = CHAR_DEF[id];
    return {
      stand: function (c, d, o) {
        Parts.shadow(c, d.size * 0.5, 0.9);
        Parts.body(c, d, {});
        if (d.ear) Parts.ear(c, d, d.ear);
        if (id === 'duck' || id === 'goose') { } else if (id === 'qiaoqiao') Parts.hornTuft(c, d, 1);
        if (d.wool) Parts.wool(c, d);
        if (id === 'kelin') Parts.hornTuftCurl(c, d);
        if (id === 'dog' || id === 'goose') Parts.beak(c, d, d.longBeak);
        if (id === 'duck') Parts.hornTuft(c, d, 1);
        Parts.face(c, d, 'normal', o ? o.blink : false);
        if (id === 'kelin') Parts.hat(c, d, d.hat);
        if (id === 'kelin') Parts.ball(c, d);
        if (id === 'qiaoqiao' || id === 'duck') Parts.bag(c, d);
        if (id === 'rabbit') Parts.carrotBag(c, d);
        if (d.tail) Parts.tail(c, d, d.tail);
        if (d.tongue) Parts.tongue(c, d);
        Parts.legPair(c, d, 0);
      }
    };
  }

  /* 通用「跑/走」2 帧 */
  function movingPose(id, frames) {
    var def = CHAR_DEF[id];
    var fns = {};
    for (var f = 0; f < frames; f++) (function (f) {
      fns['run' + f] = function (c, d, o) {
        var r = d.size * 0.5;
        var bob = (f % 2 === 1) ? -r * 0.08 : 0;
        Parts.shadow(c, r, 0.9);
        c.save(); c.translate(0, bob);
        Parts.body(c, d, { sy: 1.04, sx: 0.98 });
        if (d.ear) Parts.ear(c, d, d.ear);
        if (d.wool) Parts.wool(c, d);
        if (id === 'kelin') Parts.hornTuftCurl(c, d);
        if (id === 'dog' || id === 'goose') Parts.beak(c, d, d.longBeak);
        if (id === 'duck') { Parts.hornTuft(c, d, 1); Parts.beak(c, d, false); }
        Parts.face(c, d, 'happy', o && o.blink);
        if (id === 'kelin') Parts.hat(c, d, d.hat);
        if (id === 'qiaoqiao' || id === 'duck') Parts.bag(c, d);
        if (id === 'rabbit') Parts.carrotBag(c, d);
        if (d.tail) Parts.tail(c, d, d.tail);
        if (d.tongue) Parts.tongue(c, d);
        Parts.legPair(c, d, f, 1);
        c.restore();
      };
    })(f);
    fns.run = function (c, d, o) { (fns['run' + ((o && o.frame || 0) % frames)])(c, d, o); };
    fns.walk = fns.run;
    fns.walk0 = fns['run0'];
    fns.walk1 = fns['run1'];
    return fns;
  }

  function wavePose(id) {
    return function (c, d, o) {
      var r = d.size * 0.5, k = Math.sin(((o && o.t) || 0) * 8) * 0.5 + 0.5;
      basePose(id).stand(c, d, o);
      Parts.hand(c, r * 0.82, -r * (0.5 + k * 0.16), 1.9 + k * 0.5, d.body, d.line);
    };
  }

  function jumpPose(id) {
    return function (c, d, o) {
      var r = d.size * 0.5;
      Parts.shadow(c, r, 0.7);
      Parts.body(c, d, { sx: 0.9, sy: 1.14 });
      if (d.ear) Parts.ear(c, d, d.ear);
      if (d.wool) Parts.wool(c, d);
      if (id === 'dog' || id === 'goose') Parts.beak(c, d, d.longBeak);
      if (id === 'duck') { Parts.hornTuft(c, d, 1); Parts.beak(c, d, false); }
      Parts.face(c, d, 'happy', false);
      if (id === 'kelin') Parts.hat(c, d, d.hat);
      Parts.legPair(c, d, 0, -1);
    };
  }

  /* --- 8 位同学各自的姿态表（2–4 个/位，共 ≥ 40 条含小鸭 15）--- */
  POSES.qiaoqiao = (function () {
    var p = basePose('qiaoqiao'); var m = movingPose('qiaoqiao', 2);
    p.run = m.run; p.walk = m.walk; p.jump = jumpPose('qiaoqiao');
    p.wave = wavePose('qiaoqiao');
    /* 回头招手 */
    p.waveBack = function (c, d, o) { wavePose('qiaoqiao')(c, d, o); };
    p.jumpWait = function (c, d, o) {
      var r = d.size * 0.5, t = (o && o.t) || 0;
      var h = Math.abs(Math.sin(t * 5));
      c.save(); c.translate(0, -h * r * 0.42);
      jumpPose('qiaoqiao')(c, d, o);
      c.restore();
    };
    p.join = p.wave;
    p.default = 'stand';
    return p;
  })();

  POSES.kelin = (function () {
    var p = basePose('kelin'); var m = movingPose('kelin', 2);
    p.run = m.run; p.walk = m.walk;
    p.hop = function (c, d, o) {
      var t = (o && o.t) || 0, r = d.size * 0.5;
      c.save(); c.translate(0, -Math.abs(Math.sin(t * 4.5)) * r * 0.5);
      jumpPose('kelin')(c, d, o); c.restore();
    };
    /* 指挥跳：手臂前指 */
    p.point = function (c, d, o) {
      var r = d.size * 0.5, k = Math.sin(((o && o.t) || 0) * 6) * 0.5 + 0.5;
      basePose('kelin').stand(c, d, o);
      Parts.hand(c, r * 0.9, -r * (0.2 - k * 0.2), 1.2, d.body, d.line);
    };
    p.jump = jumpPose('kelin');
    p.join = p.point;
    p.wave = wavePose('kelin');
    p.jumpWait = p.hop;
    p.default = 'stand';
    return p;
  })();

  POSES.sheep = (function () {
    var p = basePose('sheep');
    p.jumpWait = function (c, d, o) {
      var t = (o && o.t) || 0, r = d.size * 0.5;
      c.save(); c.translate(0, -Math.abs(Math.sin(t * 4)) * r * 0.46);
      Parts.shadow(c, r, 0.8);
      Parts.body(c, d, { sx: 0.94, sy: 1.08 });
      Parts.wool(c, d); Parts.face(c, d, 'happy', false); Parts.legPair(c, d, 0, -1);
      c.restore();
    };
    p.jump = jumpPose('sheep');
    p.wave = wavePose('sheep');
    p.run = function (c, d, o) { p.jumpWait(c, d, o); };
    p.walk = p.run;
    p.join = p.wave;
    p.default = 'stand';
    return p;
  })();

  POSES.cat = (function () {
    var p = basePose('cat'); var m = movingPose('cat', 2);
    p.walk = m.walk; p.run = m.walk;
    /* 数拍手势：爪子一上一下 */
    p.countBeat = function (c, d, o) {
      var r = d.size * 0.5, k = Math.sin(((o && o.t) || 0) * 5) * 0.5 + 0.5;
      basePose('cat').stand(c, d, o);
      Parts.hand(c, r * (0.5 + k * 0.3), -r * (0.1 + k * 0.5), 0.4, d.body, d.line);
    };
    /* 示范跳：夸张拉伸 */
    p.demoJump = function (c, d, o) {
      var r = d.size * 0.5, k = Math.abs(Math.sin(((o && o.t) || 0) * 4));
      c.save(); c.translate(0, -k * r * 0.6);
      Parts.shadow(c, r, 0.7);
      Parts.body(c, d, { sx: 0.88, sy: 1.2 });
      Parts.ear(c, d, 'point'); Parts.face(c, d, 'happy', false);
      Parts.legPair(c, d, 0, -1);
      c.restore();
    };
    p.jump = jumpPose('cat');
    p.join = p.countBeat;
    p.wave = wavePose('cat');
    p.default = 'stand';
    return p;
  })();

  ['dog', 'pig', 'rabbit', 'goose'].forEach(function (id) {
    var p = basePose(id);
    var m = movingPose(id, 2);
    p.run = m.run; p.walk = m.walk;
    p.wave = wavePose(id);
    p.jump = jumpPose(id);
    p.join = p.wave;
    p.default = 'stand';
    POSES[id] = p;
  });

  /* ================= 姿态解析：一个函数，不是 40 个分支 ================= */
  function resolve(charId, animState, opts) {
    var d = CHAR_DEF[charId] || CHAR_DEF.sheep;
    var P = POSES[charId] || POSES.sheep;
    var name = P[animState] ? animState : (P.default || 'stand');
    return { def: d, draw: P[name], pose: name };
  }

  /* ================= 场景 ================= */
  /* 每套场景：sky key + 3 层视差 + 地面色。地面带必须可无缝循环（图案宽为整数）。 */
  var SCENES = {
    village_start: { sky: 'day', far: 'fence', mid: 'trees', ground: 'road',  accent: '#A8D08A' },
    wheat_road:    { sky: 'day', far: 'wheat', mid: 'trees', ground: 'dirt',  accent: '#F0C868' },
    mud_puddles:   { sky: 'day', far: 'trees', mid: 'wall',  ground: 'mud',   accent: '#C4A882' },
    lotus_pond:    { sky: 'day', far: 'reeds', mid: 'trees', ground: 'water', accent: '#8FC8E8' },
    school_road:   { sky: 'out', far: 'wheat', mid: 'trees', ground: 'road',  accent: '#A8D08A' },
    school_road_in:{ sky: 'in',  far: 'wheat', mid: 'trees', ground: 'roadIn',accent: '#F0C868' },
    /* 剧情幕 */
    bedroom_night:  { story: 'bedroom', light: 'night' },
    bedroom_morning:{ story: 'bedroom', light: 'morning' },
    bathroom:       { story: 'bathroom' },
    startpoint:    { sky: 'day', far: 'fence', mid: 'trees', ground: 'road', accent: '#A8D08A' }
  };

  /* ================= 粒子 ================= */
  var PARTS_MAX = 190;                       /* T15：粒子硬上限，防只 push 不回收 */
  var particles = [];

  function emit(name, x, y, n, opt) {
    opt = opt || {};
    n = n || 1;
    for (var i = 0; i < n; i++) {
      if (particles.length >= PARTS_MAX) particles.shift();     /* 最老淘汰 */
      var a = opt.angle === undefined ? Math.random() * Math.PI * 2 : opt.angle + (Math.random() - 0.5) * (opt.spread || 1.2);
      var sp = (opt.speed || 120) * (0.6 + Math.random() * 0.8);
      particles.push({
        kind: name, x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 0),
        g: opt.g === undefined ? 700 : opt.g,
        life: 0, ttl: opt.ttl || 0.9,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 9,
        r: opt.r || 4, col: opt.col || null, big: !!opt.big
      });
    }
  }

  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind === 'bubble') { p.vx *= 0.99; }
    }
  }

  function clearParticles() { particles.length = 0; }

  function drawParticles(c) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], k = p.life / p.ttl, a = 1 - k * k;
      c.save(); c.globalAlpha = a < 0 ? 0 : a;
      if (p.kind === 'star') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.beginPath();
        for (var j = 0; j < 10; j++) {
          var rad = (j % 2 === 0 ? p.r : p.r * 0.45), ang = -Math.PI / 2 + j * Math.PI / 5;
          c[j ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        c.closePath(); c.fillStyle = p.col || C.chick; c.fill();
        c.lineWidth = 1.4; c.strokeStyle = C.chickBr; c.stroke(); c.restore();
      } else if (p.kind === 'bubble') {
        c.beginPath(); c.arc(p.x, p.y, p.r * (0.6 + k * 0.8), 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,.72)'; c.fill();
        c.lineWidth = 1.6; c.strokeStyle = 'rgba(138,177,214,.7)'; c.stroke();
      } else if (p.kind === 'confetti') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.col || C.chick;
        c.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        c.restore();
      } else if (p.kind === 'splash') {
        c.beginPath(); c.arc(p.x, p.y, p.r * (0.4 + k * 1.3), 0, Math.PI * 2);
        c.fillStyle = p.col || 'rgba(143,200,232,.7)'; c.fill();
      } else if (p.kind === 'zzz') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.font = '600 ' + (p.r * 5) + 'px ' + FONT;
        c.fillStyle = p.col || C.inkSoft; c.fillText('z', 0, 0);
        c.restore();
      }
      c.restore();
    }
  }

  var FONT = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';

  /* ================= 障碍绘制 ================= */
  function drawObstacle(c, o, t) {
    var w = o.w, h = o.h;
    c.save();
    if (o.type === 'step' || o.type === 'high') {
      c.beginPath();
      if (c.roundRect) c.roundRect(-w / 2, -h, w, h, K.R.sm); else c.rect(-w / 2, -h, w, h);
      c.fillStyle = o.type === 'high' ? '#E0C08A' : '#EAD3A8'; c.fill();
      c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
      c.beginPath(); c.moveTo(-w / 2, -h + 9); c.lineTo(w / 2, -h + 9);
      c.lineWidth = 1.6; c.strokeStyle = 'rgba(74,55,34,.3)'; c.stroke();
    } else if (o.type === 'puddle') {
      c.beginPath(); c.ellipse(0, 0, w / 2, 10, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(143,200,232,.85)'; c.fill();
      c.lineWidth = 2.4; c.strokeStyle = 'rgba(120,170,210,.9)'; c.stroke();
      c.beginPath(); c.ellipse(-w * 0.16, -2, w * 0.16, 3, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,.6)'; c.fill();
    } else if (o.type === 'lotus') {
      /* 荷叶 + 轻微下沉动画（踩上去会沉一下） */
      var sink = o.sink || 0;
      c.beginPath(); c.ellipse(0, sink, w / 2, 13, 0, 0, Math.PI * 2);
      c.fillStyle = '#8FC868'; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#6FA84E'; c.stroke();
      c.beginPath(); c.moveTo(0, sink);
      for (var i = 0; i < 7; i++) {
        var a = i * Math.PI * 2 / 7;
        c.lineTo(Math.cos(a) * w / 2 * 0.92, sink + Math.sin(a) * 11);
      }
      c.closePath(); c.fillStyle = 'rgba(143,200,104,.5)'; c.fill();
    } else if (o.type === 'pumpkin') {
      c.save(); c.translate(0, -h / 2); c.rotate(o.spin || 0);
      c.beginPath(); c.ellipse(0, 0, h / 2, h / 2, 0, 0, Math.PI * 2);
      c.fillStyle = C.beak; c.fill(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
      c.beginPath(); c.moveTo(-h / 2 * 0.5, 0); c.lineTo(h / 2 * 0.5, 0);
      c.moveTo(0, -h / 2); c.lineTo(0, h / 2);
      c.lineWidth = 1.8; c.strokeStyle = 'rgba(74,55,34,.4)'; c.stroke();
      c.restore();
      c.beginPath(); c.moveTo(0, -h + 4); c.lineTo(4, -h - 6); c.stroke();
    } else if (o.type === 'hobby_horse') {
      c.save(); c.translate(0, -h / 2);
      c.beginPath(); c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.fillStyle = '#F5D08A'; c.fill(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
      c.beginPath(); c.moveTo(w * 0.3, -h * 0.4); c.lineTo(w * 0.46, -h * 0.62); c.lineTo(w * 0.46, -h * 0.3);
      c.closePath(); c.fillStyle = C.beak; c.fill(); c.stroke();
      c.restore();
    } else if (o.type === 'pinwheel') {
      c.save(); c.translate(0, -h / 2); c.rotate(o.spin || 0);
      c.beginPath();
      for (var i2 = 0; i2 < 4; i2++) {
        var a2 = i2 * Math.PI / 2;
        c.moveTo(0, 0);
        c.arc(0, 0, h / 2, a2, a2 + 0.62);
        c.closePath();
      }
      c.fillStyle = '#F0909C'; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 3.4, 0, Math.PI * 2); c.fillStyle = C.chick; c.fill();
      c.restore();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, h / 2 + 8);
      c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
    }
    c.restore();
  }

  /* ================= 气泡 ================= */
  function drawBubble(c, x, y, text, opt) {
    opt = opt || {};
    c.save();
    c.font = '600 20px ' + FONT;
    var w = Math.max(48, c.measureText(text).width + 26);
    var h = 38;
    c.globalAlpha = opt.alpha === undefined ? 1 : opt.alpha;
    c.beginPath();
    if (c.roundRect) c.roundRect(x - w / 2, y - h, w, h, K.R.md); else c.rect(x - w / 2, y - h, w, h);
    c.fillStyle = '#fff'; c.fill();
    c.lineWidth = 2.6; c.strokeStyle = opt.stroke || C.ink; c.stroke();
    c.beginPath();
    c.moveTo(x - 9, y - 1); c.lineTo(x + 2, y - 1); c.lineTo(x - 5, y + 12);
    c.closePath(); c.fillStyle = '#fff'; c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(x - 9, y - 1); c.lineTo(x - 5, y + 11); c.lineTo(x - 1, y - 1);
    c.closePath(); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, x, y - h / 2);
    c.restore();
  }

  global.Art = {
    CHAR_DEF: CHAR_DEF,
    POSES: POSES,
    Parts: Parts,
    SCENES: SCENES,
    FONT: FONT,
    resolve: resolve,
    drawObstacle: drawObstacle,
    drawBubble: drawBubble,
    emit: emit,
    stepParticles: stepParticles,
    clearParticles: clearParticles,
    drawParticles: drawParticles,
    particles: particles,
    PARTS_MAX: PARTS_MAX
  };
})(window);
