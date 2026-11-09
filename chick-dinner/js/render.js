/* 渲染层：全部为程序化 Canvas 绘制，不依赖任何图片素材 */
(function (global) {
  'use strict';

  var GROUND = 900;

  /* ---------- 渐变缓存 ----------
   * createLinearGradient / createRadialGradient 每帧重建是隐蔽的性能开销。
   * 渐变坐标在「绘制时」按当前变换(CTM)解析，
   * 所以只要绘制前 translate 到局部坐标，渐变对象就能长期复用。
   */
  var _grads = Object.create(null);
  function grad(ctx, key, make) {
    var g = _grads[key];
    if (!g) { g = make(); _grads[key] = g; }
    return g;
  }

  /* ---------- 基础工具 ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillCircle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function shadow(ctx, x, y, rx) {
    ctx.fillStyle = 'rgba(90,60,30,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  }

  /* ---------- 通用小动物 ---------- */
  /* spec: {body, belly, color2, ear:'none|round|long|fluffy|drop', snout:'beak|nose', scale, hat} */
  function critter(ctx, x, footY, spec, t, walking, dir) {
    var s = spec.scale || 1;
    var bob = walking ? Math.sin(t * 14) * 3 * s : Math.sin(t * 2.2) * 1.2 * s;
    var bodyR = 26 * s;
    var cx = x, cy = footY - 34 * s + bob;
    ctx.save();
    ctx.translate(cx, cy);
    if (dir < 0) ctx.scale(-1, 1);

    shadow(ctx, 0, 34 * s + (footY - footY), bodyR * 0.9);

    // 腿
    var legSwing = walking ? Math.sin(t * 14) * 7 * s : 0;
    ctx.strokeStyle = spec.leg || '#E8942A';
    ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 22 * s); ctx.lineTo(-8 * s - legSwing, 36 * s);
    ctx.moveTo(8 * s, 22 * s); ctx.lineTo(8 * s + legSwing, 36 * s);
    ctx.stroke();

    // 耳朵
    if (spec.ear === 'round') {
      fillCircle(ctx, -16 * s, -22 * s, 11 * s, spec.color2 || spec.body);
      fillCircle(ctx, 16 * s, -22 * s, 11 * s, spec.color2 || spec.body);
    } else if (spec.ear === 'long') {
      ctx.fillStyle = spec.color2 || spec.body;
      rr(ctx, -20 * s, -50 * s, 11 * s, 30 * s, 5 * s); ctx.fill();
      rr(ctx, 9 * s, -50 * s, 11 * s, 30 * s, 5 * s); ctx.fill();
    } else if (spec.ear === 'drop') {
      ellipse(ctx, -19 * s, -14 * s, 8 * s, 14 * s, spec.color2 || spec.body);
      ellipse(ctx, 19 * s, -14 * s, 8 * s, 14 * s, spec.color2 || spec.body);
    } else if (spec.ear === 'fluffy') {
      for (var i = 0; i < 7; i++) {
        var a = (i / 7) * Math.PI * 2;
        fillCircle(ctx, Math.cos(a) * 24 * s, -6 * s + Math.sin(a) * 22 * s, 12 * s, spec.body);
      }
    }

    // 身体
    ellipse(ctx, 0, 0, bodyR, bodyR * 0.92, spec.body);
    if (spec.belly) ellipse(ctx, 2 * s, 8 * s, bodyR * 0.62, bodyR * 0.55, spec.belly);

    // 翅膀 / 手
    if (spec.wing) {
      var wa = walking ? Math.sin(t * 14) * 0.35 : Math.sin(t * 2) * 0.1;
      ctx.save(); ctx.translate(-20 * s, 2 * s); ctx.rotate(wa);
      ellipse(ctx, 0, 0, 11 * s, 8 * s, spec.color2 || '#E8B23C');
      ctx.restore();
    }

    // 脸
    var ex = 11 * s, ey = -8 * s;
    fillCircle(ctx, ex, ey, 4.2 * s, '#2B2118');
    fillCircle(ctx, ex + 1.4 * s, ey - 1.4 * s, 1.6 * s, '#fff');
    fillCircle(ctx, -4 * s, ey, 4.2 * s, '#2B2118');
    fillCircle(ctx, -2.6 * s, ey - 1.4 * s, 1.6 * s, '#fff');

    if (spec.snout === 'beak') {
      ctx.fillStyle = spec.beakColor || '#F08A24';
      ctx.beginPath();
      ctx.moveTo(20 * s, -2 * s); ctx.lineTo(36 * s, 2 * s); ctx.lineTo(20 * s, 8 * s);
      ctx.closePath(); ctx.fill();
    } else if (spec.snout === 'nose') {
      ellipse(ctx, 24 * s, 2 * s, 7 * s, 5 * s, spec.color2 || '#3A2E26');
      fillCircle(ctx, 22 * s, 0.5 * s, 1.4 * s, '#fff');
    }

    // 鸡冠 / 呆毛
    if (spec.comb) {
      ctx.fillStyle = '#E4453A';
      ctx.beginPath();
      ctx.moveTo(-10 * s, -26 * s); ctx.lineTo(-4 * s, -38 * s); ctx.lineTo(2 * s, -27 * s);
      ctx.lineTo(8 * s, -38 * s); ctx.lineTo(13 * s, -25 * s);
      ctx.closePath(); ctx.fill();
    }
    if (spec.hair) {
      ctx.strokeStyle = spec.body; ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(0, -26 * s); ctx.quadraticCurveTo(6 * s, -42 * s, -6 * s, -46 * s);
      ctx.stroke();
    }
    // 围裙（姐姐）
    if (spec.apron) {
      ctx.fillStyle = '#F2F2F2';
      rr(ctx, -16 * s, 4 * s, 32 * s, 24 * s, 6 * s); ctx.fill();
      ctx.fillStyle = '#E86A6A';
      ctx.fillRect(-16 * s, 4 * s, 32 * s, 4 * s);
    }
    ctx.restore();
  }

  var CRITTERS = {
    chick:  { body: '#F7C948', belly: '#FFE08A', ear: 'none', snout: 'beak', comb: true, wing: true, leg: '#E8942A', scale: 1 },
    sister: { body: '#F0D9A8', belly: '#FFF3D8', ear: 'none', snout: 'beak', comb: true, wing: true, leg: '#E8942A', apron: true, scale: 1.25 },
    duck:   { body: '#FBFBF5', belly: '#FFFFFF', ear: 'none', snout: 'beak', beakColor: '#F5A623', hair: true, leg: '#F5A623', scale: 1.15 },
    sparrow:{ body: '#C98A4B', belly: '#EBD3B0', ear: 'none', snout: 'beak', beakColor: '#E07A2B', wing: true, leg: '#D9A05B', scale: 0.75 },
    mouse:  { body: '#A79A88', belly: '#D9CFC0', ear: 'round', color2: '#F0A7B4', snout: 'nose', leg: '#A79A88', scale: 0.72 },
    sheep:  { body: '#F6F1E7', ear: 'fluffy', snout: 'nose', color2: '#4A4038', leg: '#4A4038', scale: 0.95 },
    dog:    { body: '#D9A05B', belly: '#F2D9B0', ear: 'drop', color2: '#B87F42', snout: 'nose', leg: '#D9A05B', scale: 0.9 },
    cat:    { body: '#9A96A6', belly: '#DAD6E2', ear: 'long', color2: '#7C7889', snout: 'nose', leg: '#9A96A6', scale: 0.85 },
    pig:    { body: '#F5A9BC', belly: '#FFD0DC', ear: 'round', color2: '#E38AA0', snout: 'nose', leg: '#E38AA0', scale: 0.95 },
    rabbit: { body: '#F0E8DC', ear: 'long', color2: '#F5D6DA', snout: 'nose', leg: '#E0D2C2', scale: 0.82 },
    goose:  { body: '#FAF7EC', ear: 'none', snout: 'beak', beakColor: '#F5A623', wing: true, leg: '#F5A623', scale: 0.95 }
  };

  function drawCritterByName(ctx, name, x, footY, t, walking, dir) {
    critter(ctx, x, footY, CRITTERS[name] || CRITTERS.chick, t, walking, dir || 1);
  }

  /* ---------- 场景 ---------- */
  function background(ctx, camX, level, t) {
    var g = grad(ctx, 'bg', function () {
      var g = ctx.createLinearGradient(0, 0, 0, 900);
      g.addColorStop(0, '#FFE9B8');
      g.addColorStop(0.45, '#FFD79A');
      g.addColorStop(1, '#FFC98A');
      return g;
    });
    ctx.fillStyle = g; ctx.fillRect(0, 0, 750, 1334);

    // 太阳
    fillCircle(ctx, 620, 190, 62, 'rgba(255,244,200,0.95)');
    fillCircle(ctx, 620, 190, 48, '#FFF3C4');

    // 远山
    ctx.fillStyle = '#F3B778';
    ctx.beginPath();
    ctx.moveTo(-50, 700);
    for (var i = 0; i <= 6; i++) {
      var bx = -50 + i * 140 - (camX * 0.15) % 140;
      ctx.lineTo(bx + 70, 520 + (i % 2 ? 40 : 0));
      ctx.lineTo(bx + 140, 700);
    }
    ctx.lineTo(900, 700); ctx.lineTo(900, 780); ctx.lineTo(-50, 780);
    ctx.closePath(); ctx.fill();

    // 云
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (var c = 0; c < 4; c++) {
      var cx = ((c * 320 - camX * 0.25) % 1100 + 1100) % 1100 - 100;
      var cy = 200 + c * 60;
      ellipse(ctx, cx, cy, 52, 26, 'rgba(255,255,255,0.7)');
      ellipse(ctx, cx + 40, cy + 6, 38, 20, 'rgba(255,255,255,0.7)');
    }

    // 远景树
    ctx.fillStyle = '#C98A4B';
    for (var k = 0; k < 8; k++) {
      var tx = ((k * 260 - camX * 0.45) % 2080 + 2080) % 2080 - 160;
      ctx.fillRect(tx, 720, 16, 60);
      fillCircle(ctx, tx + 8, 706, 40, '#8FBF6A');
      fillCircle(ctx, tx - 12, 718, 28, '#A5CE7C');
      fillCircle(ctx, tx + 28, 718, 28, '#A5CE7C');
    }
  }

  function ground(ctx, camX, level) {
    // 草地
    ctx.fillStyle = '#8FBF6A';
    ctx.fillRect(0, GROUND - 8, 750, 60);
    ctx.fillStyle = '#7FB05C';
    ctx.fillRect(0, GROUND + 24, 750, 120);
    // 草纹理
    ctx.strokeStyle = 'rgba(110,160,80,0.7)'; ctx.lineWidth = 3;
    for (var i = -1; i < 14; i++) {
      var gx = i * 64 - (camX % 64);
      ctx.beginPath();
      ctx.moveTo(gx, GROUND + 10); ctx.lineTo(gx + 6, GROUND - 2);
      ctx.moveTo(gx + 26, GROUND + 14); ctx.lineTo(gx + 32, GROUND + 2);
      ctx.stroke();
    }
    // 地面暗层
    ctx.fillStyle = '#6E9B4E';
    ctx.fillRect(0, GROUND + 90, 750, 400);
  }

  function platform(ctx, p, camX) {
    var x = p.x - camX;
    ctx.fillStyle = '#B9855A';
    rr(ctx, x, p.y, p.w, 22, 6); ctx.fill();
    ctx.fillStyle = '#8FBF6A';
    rr(ctx, x, p.y, p.w, 8, 4); ctx.fill();
    ctx.fillStyle = 'rgba(120,90,60,0.35)';
    for (var i = 0; i < p.w; i += 34) ctx.fillRect(x + i + 6, p.y + 22, 22, 12);
  }

  /* 能量光障板：挡激光，不挡角色 */
  function wall(ctx, w, camX, t) {
    var x = w.x - camX, y = GROUND - w.h;
    ctx.save();
    // 平移到局部坐标 → 渐变坐标固定下来，可按宽度缓存复用
    ctx.translate(x, y);
    var grd = grad(ctx, 'wall' + w.w, function () {
      var g = ctx.createLinearGradient(0, 0, w.w, 0);
      g.addColorStop(0, 'rgba(150,110,255,0.55)');
      g.addColorStop(0.5, 'rgba(210,190,255,0.80)');
      g.addColorStop(1, 'rgba(150,110,255,0.55)');
      return g;
    });
    ctx.fillStyle = grd;
    rr(ctx, 0, 0, w.w, w.h, 8); ctx.fill();
    // 电流纹理
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      var yy = ((t * 60 + k * 80) % w.h);
      ctx.moveTo(4, yy);
      ctx.lineTo(w.w - 4, yy + 10);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,90,220,0.9)'; ctx.lineWidth = 3;
    rr(ctx, 0, 0, w.w, w.h, 8); ctx.stroke();
    // 底座（y = GROUND - w.h，故 GROUND - 16 - y === w.h - 16）
    ctx.fillStyle = '#6E6390';
    rr(ctx, -10, w.h - 16, w.w + 20, 16, 5); ctx.fill();
    ctx.restore();
  }

  function rope(ctx, rp, camX) {
    if (rp.cut) return;
    var x = rp.x - camX;
    ctx.strokeStyle = '#C9A06A'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, rp.top); ctx.lineTo(x, rp.bottom); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.5;
    for (var y = rp.top; y < rp.bottom; y += 14) {
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y + 8); ctx.stroke();
    }
  }

  function powerSwitch(ctx, sw, camX, t) {
    var x = sw.x - camX, y = GROUND - 96;
    ctx.fillStyle = '#8E8B96'; ctx.fillRect(x - 6, y + 10, 12, 86);
    ctx.fillStyle = sw.on ? '#7FC96A' : '#C9564E';
    rr(ctx, x - 26, y - 20, 52, 62, 8); ctx.fill();
    ctx.strokeStyle = '#5A5560'; ctx.lineWidth = 3;
    rr(ctx, x - 26, y - 20, 52, 62, 8); ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(sw.on ? 'ON' : 'OFF', x, y + 22);
    if (!sw.on) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.4;
      fillCircle(ctx, x, y - 34, 8, '#FFE14D');
      ctx.globalAlpha = 1;
    }
  }

  function mirror(ctx, m, camX) {
    var x = m.x - camX, y = m.y, s = m.size;
    ctx.save();
    ctx.translate(x, y);
    // 支架
    ctx.fillStyle = '#8E8B96';
    ctx.fillRect(-4, s / 2 - 6, 8, 26);
    rr(ctx, -18, s / 2 + 16, 36, 8, 4); ctx.fill();
    // 镜面
    ctx.rotate(m.angle === '/' ? -Math.PI / 4 : Math.PI / 4);
    // 已在 translate + rotate 的局部坐标系里，按尺寸缓存即可
    var grd = grad(ctx, 'mirror' + s, function () {
      var g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      g.addColorStop(0, '#DFF3FF'); g.addColorStop(0.5, '#FFFFFF'); g.addColorStop(1, '#B9DDF2');
      return g;
    });
    ctx.fillStyle = grd;
    rr(ctx, -s / 2, -6, s, 12, 3); ctx.fill();
    ctx.strokeStyle = '#9BD3EA'; ctx.lineWidth = 2.5;
    rr(ctx, -s / 2, -6, s, 12, 3); ctx.stroke();
    ctx.restore();
  }

  function door(ctx, d, camX, t) {
    var x = d.x - camX;
    var h = d.bottom - d.top;
    if (d.broken) {
      // 残骸
      ctx.fillStyle = d.type === 'iron' ? '#8C8C94' : '#A9793F';
      ctx.save(); ctx.translate(x + d.w / 2, GROUND - 12); ctx.rotate(1.3);
      rr(ctx, -d.w / 2, -8, d.w, 16, 4); ctx.fill();
      ctx.restore();
      return;
    }
    // 门框
    ctx.fillStyle = '#7A5B3A';
    rr(ctx, x - 8, d.top - 12, d.w + 16, h + 24, 8); ctx.fill();
    // 门板
    var body = d.type === 'iron' ? '#9AA0A8' : '#C68A4E';
    var dark = d.type === 'iron' ? '#7C828B' : '#A66F3C';
    ctx.fillStyle = body;
    rr(ctx, x, d.top, d.w, h, 5); ctx.fill();
    ctx.fillStyle = dark;
    for (var i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * (d.w / 3), d.top + 6, d.w / 3 - 6, h - 14);
    // 加热发红
    if (d.hp > 0) {
      var ratio = d.hp / (d.type === 'iron' ? 3 : 2);
      ctx.fillStyle = 'rgba(255,' + Math.round(180 - ratio * 130) + ',60,' + (0.25 + ratio * 0.55) + ')';
      rr(ctx, x, d.top, d.w, h, 5); ctx.fill();
    }
    // 高处门：下方补一段栅栏，说明它拦着路
    if (d.bottom < GROUND - 40) {
      ctx.strokeStyle = '#8B5E34'; ctx.lineWidth = 6;
      for (var fx = x + 8; fx < x + d.w; fx += 20) {
        ctx.beginPath(); ctx.moveTo(fx, d.bottom); ctx.lineTo(fx, GROUND); ctx.stroke();
      }
      ctx.fillStyle = '#8B5E34';
      ctx.fillRect(x - 6, d.bottom, d.w + 12, 9);
    }
    // 门闩
    ctx.fillStyle = d.type === 'iron' ? '#5E646C' : '#6E4B2A';
    rr(ctx, x - 12, d.top + h * 0.42, d.w + 24, 16, 5); ctx.fill();
    fillCircle(ctx, x + d.w / 2, d.top + h * 0.42 + 8, 5, '#FFD98A');
    if (d.dual) {
      ctx.fillStyle = '#FF6B6B';
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('×2', x + d.w / 2, d.top - 18);
    }
    // 关着的锁提示
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    ctx.fillText('🔒', x + d.w / 2, d.top + h * 0.28);
    ctx.globalAlpha = 1;
  }

  function device(ctx, x, camX, t, held) {
    var px = x - camX;
    var y = GROUND - (held ? 0 : 40);
    ctx.save();
    ctx.translate(px, y - (held ? 0 : 0));
    // 机身
    ctx.fillStyle = '#B9C2CC';
    rr(ctx, -26, -34, 52, 34, 8); ctx.fill();
    ctx.strokeStyle = '#78828E'; ctx.lineWidth = 3;
    rr(ctx, -26, -34, 52, 34, 8); ctx.stroke();
    // 镜头
    fillCircle(ctx, 24, -18, 9, '#3D4650');
    fillCircle(ctx, 24, -18, 5, '#8FE3FF');
    // 按钮
    var pulse = 0.6 + Math.sin(t * 6) * 0.4;
    ctx.fillStyle = 'rgba(255,80,80,' + pulse + ')';
    ctx.beginPath(); ctx.arc(-8, -42, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E4453A';
    ctx.beginPath(); ctx.arc(-8, -42, 8, 0, Math.PI * 2); ctx.fill();
    // 光晕
    if (!held) {
      ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.2;
      fillCircle(ctx, 0, -18, 46, '#FFE14D');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function fixedDevice(ctx, fd, camX, t) {
    var x = fd.x - camX;
    ctx.save();
    ctx.translate(x, GROUND);
    ctx.fillStyle = '#8E8B96'; ctx.fillRect(-20, -30, 40, 30);
    ctx.fillStyle = '#B9C2CC';
    rr(ctx, -30, -64, 60, 36, 8); ctx.fill();
    ctx.strokeStyle = '#78828E'; ctx.lineWidth = 3;
    rr(ctx, -30, -64, 60, 36, 8); ctx.stroke();
    fillCircle(ctx, fd.dir * 26, -46, 10, '#3D4650');
    fillCircle(ctx, fd.dir * 26, -46, 6, fd.active ? '#FF6B6B' : '#8FE3FF');
    ctx.fillStyle = fd.active ? '#7FC96A' : '#C9564E';
    rr(ctx, -14, -78, 28, 14, 4); ctx.fill();
    if (!fd.active && !fd.used) {
      ctx.globalAlpha = 0.4 + Math.sin(t * 5) * 0.4;
      fillCircle(ctx, 0, -96, 14, '#FFE14D');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function home(ctx, x, camX, t, level) {
    var px = x - camX;
    // 房子
    ctx.fillStyle = '#F5E3C0';
    rr(ctx, px - 130, GROUND - 300, 260, 300, 12); ctx.fill();
    ctx.strokeStyle = '#D9B98A'; ctx.lineWidth = 4;
    rr(ctx, px - 130, GROUND - 300, 260, 300, 12); ctx.stroke();
    // 屋顶
    ctx.fillStyle = '#C9564E';
    ctx.beginPath();
    ctx.moveTo(px - 160, GROUND - 296);
    ctx.lineTo(px, GROUND - 400);
    ctx.lineTo(px + 160, GROUND - 296);
    ctx.closePath(); ctx.fill();
    // 烟囱 + 炊烟
    ctx.fillStyle = '#B04A42'; ctx.fillRect(px + 70, GROUND - 380, 30, 60);
    for (var i = 0; i < 3; i++) {
      var sy = GROUND - 390 - i * 46 - (t * 22 % 46);
      ctx.globalAlpha = 0.4 - i * 0.1;
      fillCircle(ctx, px + 85 + Math.sin(t * 1.6 + i) * 14, sy, 16 + i * 6, '#FFFFFF');
      ctx.globalAlpha = 1;
    }
    // 门洞
    ctx.fillStyle = '#8B5E34';
    rr(ctx, px - 40, GROUND - 130, 80, 130, 8); ctx.fill();
    ctx.fillStyle = '#6E4B2A';
    rr(ctx, px - 34, GROUND - 124, 68, 124, 6); ctx.fill();
    // 窗
    ctx.fillStyle = '#FFE9A8';
    rr(ctx, px - 110, GROUND - 250, 56, 52, 6); ctx.fill();
    rr(ctx, px + 54, GROUND - 250, 56, 52, 6); ctx.fill();
    ctx.strokeStyle = '#C98A4B'; ctx.lineWidth = 3;
    rr(ctx, px - 110, GROUND - 250, 56, 52, 6); ctx.stroke();
    rr(ctx, px + 54, GROUND - 250, 56, 52, 6); ctx.stroke();
    // 姐姐在门口
    drawCritterByName(ctx, 'sister', px - 78, GROUND, t, false, 1);
  }

  /* ---------- 激光光束 ---------- */
  function beam(ctx, segments, power, camX, t) {
    var w = 4 + power * 16;
    ctx.save();
    ctx.lineCap = 'round';
    for (var pass = 0; pass < 3; pass++) {
      var pw = pass === 0 ? w * 2.2 : (pass === 1 ? w : w * 0.4);
      var col = pass === 0 ? 'rgba(255,80,120,' + (0.12 + power * 0.16) + ')'
              : (pass === 1 ? 'rgba(255,60,100,' + (0.55 + power * 0.3) + ')' : 'rgba(255,255,255,0.95)');
      ctx.strokeStyle = col; ctx.lineWidth = pw;
      for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        ctx.beginPath();
        ctx.moveTo(s.x1 - camX, s.y1);
        ctx.lineTo(s.x2 - camX, s.y2);
        ctx.stroke();
      }
    }
    // 火花粒子
    for (var k = 0; k < segments.length; k++) {
      var sg = segments[k];
      var len = Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1);
      var n = Math.min(12, Math.floor(len / 40));
      for (var j = 0; j < n; j++) {
        var f = (j / n + (t * 3 % 1)) % 1;
        var px = sg.x1 + (sg.x2 - sg.x1) * f - camX;
        var py = sg.y1 + (sg.y2 - sg.y1) * f + Math.sin(t * 20 + j) * 5;
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        fillCircle(ctx, px, py, 2 + power * 3, '#FFD1E0');
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /* ---------- 提示气泡 ---------- */
  function bubble(ctx, x, y, text, camX) {
    var px = x - camX;
    ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
    var w = ctx.measureText(text).width + 34;
    var h = 52;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    rr(ctx, px - w / 2, y - h, w, h, 14); ctx.fill();
    ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 3;
    rr(ctx, px - w / 2, y - h, w, h, 14); ctx.stroke();
    ctx.fillStyle = '#5A4632';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, px, y - h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    // 小尖角
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.moveTo(px - 8, y); ctx.lineTo(px + 8, y); ctx.lineTo(px, y + 12);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- 引导指示（防卡关：脉冲圈 + 手指） ---------- */
  function guide(ctx, x, y, camX, t) {
    var px = x - camX, py = y;
    var k = (t * 1.4) % 1;
    // 扩散圈
    for (var i = 0; i < 2; i++) {
      var f = (k + i * 0.5) % 1;
      ctx.globalAlpha = 0.55 * (1 - f);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(px, py, 18 + f * 46, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 手指
    var bob = Math.sin(t * 6) * 6;
    ctx.save();
    ctx.translate(px, py + 34 + bob);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -14); ctx.lineTo(-4, -30); ctx.lineTo(4, -30); ctx.lineTo(4, -14);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ---------- 三档全功率：全屏泛光 ---------- */
  function glow(ctx, power, t) {
    if (power < 0.99) return;
    var a = 0.10 + Math.sin(t * 18) * 0.035;
    // 渐变本身缓存（坐标是固定的全屏常量），随时间变化的透明度走 globalAlpha
    var g = grad(ctx, 'glow', function () {
      var g = ctx.createRadialGradient(375, 700, 80, 375, 700, 760);
      g.addColorStop(0, 'rgba(255,120,90,1)');
      g.addColorStop(1, 'rgba(255,80,80,0)');
      return g;
    });
    ctx.save();
    ctx.globalAlpha = a * 1.6;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 750, 1334);
    ctx.restore();
  }

  /* ---------- 粒子 ---------- */
  function particles(ctx, list, camX) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'star') {
        drawStar(ctx, p.x - camX, p.y, p.r, p.color);
      } else if (p.kind === 'smoke') {
        fillCircle(ctx, p.x - camX, p.y, p.r, p.color);
      } else {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x - camX, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawStar(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (Math.PI / 5) * i - Math.PI / 2;
      var rr2 = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath(); ctx.fill();
  }

  global.Render = {
    GROUND: GROUND,
    critter: critter,
    CRITTERS: CRITTERS,
    drawCritterByName: drawCritterByName,
    background: background,
    ground: ground,
    platform: platform,
    wall: wall,
    rope: rope,
    powerSwitch: powerSwitch,
    mirror: mirror,
    door: door,
    device: device,
    fixedDevice: fixedDevice,
    home: home,
    beam: beam,
    bubble: bubble,
    guide: guide,
    glow: glow,
    particles: particles,
    rr: rr,
    fillCircle: fillCircle,
    ellipse: ellipse,
    drawStar: drawStar
  };
})(window);
