/* 核心玩法逻辑 */
(function (global) {
  'use strict';

  var GROUND = 900;
  var SPEED = 224;          // 3.5 格/秒 (GRID=64)
  var GRAVITY = 1400;
  var JUMP_V = 720;
  var ENERGY_MAX = 100;
  var USE_RATE = 20;        // 每秒消耗（满电可连续发射 5 秒：够三档充能 1.5s + 铁门 3s）
  var RECHARGE = 33;        // 每秒回充
  var RANGES = [0, 300, 500, 800];  // 一/二/三档射程（像素）
  var BREAK_WOOD = 2.0, BREAK_IRON = 3.0;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var Game = {
    canvas: null, ctx: null, level: null, levelIndex: 0,
    running: false, raf: 0, lastT: 0, time: 0,
    camX: 0,
    chick: null,
    duck: null,
    firing: false, holdTime: 0, energy: ENERGY_MAX, power: 0,
    beamSegs: [], beamPower: 0,
    particles: [],
    team: [],
    trail: [],
    state: 'idle',     // idle | play | clear
    tipText: null, tipTimer: 0,
    hasDevice: false,
    onClear: null, onHud: null,
    duckTimer: 0,
    sizzleTimer: 0,
    usedHint: false
  };

  /* ---------- 关卡装载 ---------- */
  Game.load = function (index) {
    var src = global.GameData.LEVELS[index];
    this.levelIndex = index;
    this.level = JSON.parse(JSON.stringify(src));
    var L = this.level;

    this.chick = { x: L.start, y: GROUND, dir: 1, targetX: L.start, vy: 0, walking: false, jumping: false };
    this.duck = { x: L.doors.length ? L.doors[0].x + 260 : L.home + 200, dir: -1, phase: 'wait', t: 0 };
    this.firing = false; this.holdTime = 0; this.energy = ENERGY_MAX; this.power = 0;
    this.beamSegs = []; this.beamPower = 0;
    this.particles = []; this.team = []; this.trail = [];
    this.time = 0; this.state = 'play'; this.hasDevice = false;
    this.tipText = null; this.tipTimer = 0;     this.usedHint = false;
    this.pending = null;
    this.paused = false;
    this.duckTimer = 0; this.sizzleTimer = 0;
    this.camX = clamp(this.chick.x - 375, 0, L.w - 750);

    // 伙伴初始化
    L.partners.forEach(function (p) {
      p.y = p.y || GROUND;
      p.saved = !p.hang;
      p.invited = false;
      p.homeY = p.hang || p.y;
    });
    L.switches.forEach(function (s) { s.on = false; });
    L.fixedDevices.forEach(function (f) { f.active = false; f.used = false; f.timer = 0; });
    L.ropes.forEach(function (r) { r.cut = false; });
    L.doors.forEach(function (d) { d.hp = 0; d.broken = false; d.dualHit = {}; });
  };

  Game.start = function () {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.lastT = performance.now();
    var self = this;
    function loop(t) {
      var dt = Math.min(0.05, (t - self.lastT) / 1000);
      self.lastT = t;
      if (!self.paused) { self.update(dt); self.draw(); }
      self.raf = requestAnimationFrame(loop);
    }
    this.raf = requestAnimationFrame(loop);
  };
  Game.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  Game.pause = function () { this.paused = true; };
  Game.resume = function () { this.paused = false; };

  /* ---------- 支撑面 ---------- */
  function supportY(g, x, footY) {
    var sy = GROUND;
    var ps = g.level.platforms;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (x > p.x - 6 && x < p.x + p.w + 6 && footY <= p.y + 26) sy = Math.min(sy, p.y);
    }
    return sy;
  }

  function blocked(g, nx) {
    var ds = g.level.doors;
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      if (d.broken) continue;
      if (nx > d.x - 30 && nx < d.x + d.w + 30) return true;
    }
    return false;
  }

  /* ---------- 更新 ---------- */
  Game.update = function (dt) {
    if (this.state !== 'play') { this.updateParticles(dt); return; }
    var L = this.level, c = this.chick;
    this.time += dt;

    // 小胖鸭开场演出
    if (this.duck.phase === 'wait') {
      this.duck.t += dt;
      if (this.duck.t > 1.6) { this.duck.phase = 'run'; if (global.SFX) global.SFX.closeDoor(); }
    } else if (this.duck.phase === 'run') {
      this.duck.x -= 260 * dt;
      if (this.duck.x < -200) this.duck.phase = 'gone';
    }

    // —— 移动 ——
    var dx = c.targetX - c.x;
    if (Math.abs(dx) > 8) {
      var dir = dx > 0 ? 1 : -1;
      var nx = c.x + dir * SPEED * dt;
      if (blocked(this, nx)) {
        c.walking = false;
        if (!this.bumpCd || this.bumpCd <= 0) { if (global.SFX) global.SFX.bump(); this.bumpCd = 0.6; this.showTip('锁住了！'); }
      } else {
        c.x = clamp(nx, 20, L.w - 20); c.dir = dir; c.walking = true;
      }
    } else { c.walking = false; }
    if (this.bumpCd > 0) this.bumpCd -= dt;
    // 脚步声
    if (c.walking) {
      this.stepCd = (this.stepCd || 0) - dt;
      if (this.stepCd <= 0) { if (global.SFX) global.SFX.footstep(); this.stepCd = 0.28; }
    }

    // —— 重力 / 跳跃 ——
    c.vy += GRAVITY * dt;
    c.y += c.vy * dt;
    var sy = supportY(this, c.x, c.y);
    if (c.y >= sy) { c.y = sy; c.vy = 0; c.jumping = false; }

    // 轨迹（伙伴跟随用）
    this.trail.unshift({ x: c.x, y: c.y });
    if (this.trail.length > 400) this.trail.pop();

    // —— 激光 ——
    this.updateLaser(dt);

    // —— 固定装置 ——
    L.fixedDevices.forEach(function (f) {
      if (f.active) {
        f.timer -= dt;
        if (f.timer <= 0) f.active = false;
      }
    });

    // —— 伙伴 ——
    this.updatePartners(dt);
    this.checkPending();

    // —— 电量回充 ——
    if (!this.firing) {
      var rate = RECHARGE;
      if (L.powerFail) {
        var anyOn = L.switches.some(function (s) { return s.on; });
        if (!anyOn) rate = RECHARGE * 0.5;
      }
      this.energy = Math.min(ENERGY_MAX, this.energy + rate * dt);
    }

    // —— 灶台滋啦声 ——
    this.sizzleTimer -= dt;
    if (this.sizzleTimer <= 0) { this.sizzleTimer = 3.2; if (global.SFX) global.SFX.sizzle(); }

    // —— 教学提示 ——
    this.updateTips(dt);

    // —— 通关判定 ——
    var allBroken = L.doors.every(function (d) { return d.broken; });
    if (allBroken && Math.abs(c.x - L.home) < 70) this.clear();

    // 无进展计时（用于防卡关引导）
    var progKey = this.hasDevice + '|' + L.doors.filter(function (d) { return d.broken; }).length + '|' + this.team.length;
    if (this._progKey !== progKey) { this._progKey = progKey; this.noProgressT = 0; }
    else this.noProgressT = (this.noProgressT || 0) + dt;
    if (this.lowFlash > 0) this.lowFlash -= dt;

    this.updateParticles(dt);
    if (this.tipTimer > 0) this.tipTimer -= dt;
    this.camX = clamp(c.x - 375, 0, L.w - 750);
    if (this.onHud) this.onHud();
  };

  Game.updateTips = function (dt) {
    var L = this.level, c = this.chick;
    if (!L.tips) return;
    for (var i = 0; i < L.tips.length; i++) {
      var tp = L.tips[i];
      if (tp.done) continue;
      if (Math.abs(c.x - tp.x) < 120) {
        tp.done = true;
        this.showTip(tp.text, 3.2);
      }
    }
  };

  /* ---------- 引导目标（第 1 关常驻，其余关卡卡住 22 秒才出现） ---------- */
  Game.guideTarget = function () {
    var L = this.level;
    var teach = L.id === 1;
    if (!teach && (this.noProgressT || 0) < 22) return null;

    var dev = L.devices.filter(function (d) { return !d.taken; })[0];
    if (!this.hasDevice && dev) return { x: dev.x, y: GROUND - 70 };

    var d = L.doors.filter(function (x) { return !x.broken; })[0];
    if (d) {
      // 谜题关不指门，避免把答案直接告诉玩家
      var plain = teach || L.id === 2 || L.id === 5 || L.id === 9;
      return plain ? { x: d.x + d.w / 2, y: (d.top + d.bottom) / 2 } : null;
    }
    return { x: L.home, y: GROUND - 170 };
  };

  Game.showTip = function (text, dur) {
    this.tipText = text; this.tipTimer = dur || 2;
  };

  /* ---------- 激光 ---------- */
  Game.updateLaser = function (dt) {
    var L = this.level, c = this.chick;

    if (this.firing && this.hasDevice) {
      if (this.energy > 0) {
        this.holdTime += dt;
        this.energy = Math.max(0, this.energy - USE_RATE * dt);
        if (this.energy <= 0) {
          if (global.SFX) global.SFX.alarm();
          this.showTip('电量耗尽，松开回充', 1.6);
          this.lowFlash = 0.6;
        }
      }
    } else {
      this.holdTime = 0;
    }

    var p = 0;
    // 必须站稳在支撑面上才能发射（防止"跳着打"绕过镜子/高台谜题）
    var grounded = !c.jumping && c.y >= supportY(this, c.x, c.y) - 2;
    if (this.firing && this.hasDevice && this.energy > 0 && grounded) {
      p = this.holdTime < 0.5 ? 1 : (this.holdTime < 1.5 ? 2 : 3);
    }
    this.power = p;

    // 音效
    if (p > 0 && !this.laserSnd) { if (global.SFX) global.SFX.laserStart(); this.laserSnd = true; }
    if (p > 0 && global.SFX) global.SFX.laserUpdate((p - 1) / 2);
    if (p === 0 && this.laserSnd) { if (global.SFX) global.SFX.laserStop(); this.laserSnd = false; }

    // 命中记录
    L.doors.forEach(function (d) { d.dualHit = {}; });

    var segs = [];
    if (p > 0) {
      var oy = c.y - 50;
      var ox = c.x + c.dir * 28;
      segs = this.cast(ox, oy, [c.dir, 0], RANGES[p], 'hand');
    }
    // 固定装置光束
    L.fixedDevices.forEach(function (f) {
      if (!f.active) return;
      var s = Game.cast(f.x + f.dir * 30, GROUND - 46, [f.dir, 0], 600, 'fixed');
      segs = segs.concat(s);
    });

    this.beamSegs = segs;
    this.beamPower = p > 0 ? (p - 1) / 2 : 0;

    // 门的破坏累计
    var self = this;
    L.doors.forEach(function (d) {
      if (d.broken) return;
      var need = d.type === 'iron' ? BREAK_IRON : BREAK_WOOD;
      var minPower = d.type === 'iron' ? 3 : 2;
      var hit = false;
      if (d.dual) {
        hit = !!(d.dualHit.hand && d.dualHit.fixed);
      } else {
        hit = !!(d.dualHit.hand || d.dualHit.fixed);
      }
      if (hit && self.power >= minPower) {
        d.hp += dt;
        self.spawnHitSparks(d);
        if (d.hp >= need) self.breakDoor(d);
      } else {
        d.hp = Math.max(0, d.hp - dt * 0.6);
      }
    });
  };

  /* 光线步进：返回线段数组，途中记录命中 */
  Game.cast = function (ox, oy, dir, range, srcTag) {
    var L = this.level;
    var segs = [];
    var x = ox, y = oy;
    var dx = dir[0], dy = dir[1];
    var remain = range;
    var bounces = 0;
    var STEP = 5;

    while (remain > 0 && bounces < 8) {
      var sx = x, sy = y;
      var moved = 0;
      var stop = false;
      var hitMirror = null;
      while (moved < remain) {
        x += dx * STEP; y += dy * STEP; moved += STEP;
        // 出界
        if (x < 0 || x > L.w || y < -50 || y > GROUND + 40) { stop = true; break; }
        // 能量板（挡光）
        var hitBar = false;
        for (var i = 0; i < L.walls.length; i++) {
          var w = L.walls[i];
          if (x > w.x && x < w.x + w.w && y > GROUND - w.h && y < GROUND) { hitBar = true; break; }
        }
        if (hitBar) { stop = true; break; }
        // 平台（挡光）
        for (var pi = 0; pi < L.platforms.length; pi++) {
          var pf = L.platforms[pi];
          if (x > pf.x && x < pf.x + pf.w && y > pf.y - 4 && y < pf.y + 26) { stop = true; break; }
        }
        if (stop) break;
        // 地面
        if (y >= GROUND - 6) { stop = true; break; }
        // 绳子（可穿过）
        for (var ri = 0; ri < L.ropes.length; ri++) {
          var rp = L.ropes[ri];
          if (!rp.cut && Math.abs(x - rp.x) < 10 && y > rp.top && y < rp.bottom) {
            rp.cut = true;
            if (global.SFX) global.SFX.rope();
            this.dropHungPartner();
            this.spawnBurst(rp.x, (rp.top + rp.bottom) / 2, '#C9A06A', 8, 'debris');
          }
        }
        // 镜子
        for (var mi = 0; mi < L.mirrors.length; mi++) {
          var m = L.mirrors[mi];
          var r = m.size / 2 + 8;
          if (Math.abs(x - m.x) < r && Math.abs(y - m.y) < r) { hitMirror = m; break; }
        }
        if (hitMirror) break;
        // 门
        for (var di = 0; di < L.doors.length; di++) {
          var d = L.doors[di];
          if (d.broken) continue;
          if (x > d.x - 6 && x < d.x + d.w + 6 && y > d.top - 6 && y < d.bottom + 6) {
            d.dualHit[srcTag] = true;
            stop = true; break;
          }
        }
        if (stop) break;
      }
      segs.push({ x1: sx, y1: sy, x2: x, y2: y });
      remain -= moved;

      if (hitMirror) {
        var nd = reflect(dx, dy, hitMirror.angle);
        dx = nd[0]; dy = nd[1];
        var off = hitMirror.size / 2 + 12;
        x = hitMirror.x + dx * off;
        y = hitMirror.y + dy * off;
        bounces++;
        continue;
      }
      break;
    }
    return segs;
  };

  function reflect(dx, dy, angle) {
    // '/' : 右->上, 上->右, 左->下, 下->左
    // '\' : 右->下, 下->右, 左->上, 上->左
    if (angle === '/') {
      if (dx === 1) return [0, -1];
      if (dx === -1) return [0, 1];
      if (dy === 1) return [-1, 0];
      return [1, 0];   // dy === -1 (向上) -> 向右
    } else {
      if (dx === 1) return [0, 1];
      if (dx === -1) return [0, -1];
      if (dy === 1) return [1, 0];
      return [-1, 0];  // 向上 -> 向左
    }
  }

  Game.dropHungPartner = function () {
    var L = this.level;
    L.partners.forEach(function (p) {
      if (p.hang && !p.saved) { p.saved = true; p.y = GROUND; }
    });
  };

  Game.breakDoor = function (d) {
    d.broken = true;
    if (global.SFX) global.SFX.breakDoor();
    this.spawnBurst(d.x + d.w / 2, (d.top + d.bottom) / 2, d.type === 'iron' ? '#8C8C94' : '#A9793F', 18, 'debris');
    this.spawnBurst(d.x + d.w / 2, (d.top + d.bottom) / 2, '#FFFFFF', 8, 'smoke');
    this.showTip('门开啦！', 1.8);
    this.shake = 0.45;
  };

  Game.spawnHitSparks = function (d) {
    if (Math.random() > 0.35) return;
    this.particles.push({
      x: d.x + d.w / 2 + (Math.random() - 0.5) * 40, y: (d.top + d.bottom) / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 80, r: 3 + Math.random() * 3,
      life: 0.4, maxLife: 0.4, color: '#FFB14D', kind: 'debris', rot: Math.random() * 3
    });
  };

  Game.spawnBurst = function (x, y, color, n, kind) {
    for (var i = 0; i < n; i++) {
      this.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260 - 40,
        r: kind === 'smoke' ? 8 + Math.random() * 10 : 4 + Math.random() * 5,
        life: 0.9, maxLife: 0.9, color: color, kind: kind, rot: Math.random() * 3,
        grav: kind === 'smoke' ? -20 : 620
      });
    }
  };

  Game.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'star') p.vy -= 40 * dt;
    }
  };

  /* ---------- 伙伴 ---------- */
  Game.updatePartners = function (dt) {
    var L = this.level, self = this;
    L.partners.forEach(function (p) {
      if (!p.invited) return;
      var idx = self.team.indexOf(p);
      var tx = self.chick.x - (idx + 1) * 52 * self.chick.dir;
      var d = tx - p.x;
      if (Math.abs(d) > 4) {
        p.x += Math.sign(d) * Math.min(Math.abs(d), SPEED * 1.15 * dt);
        p.walking = true;
      } else p.walking = false;
      p.dir = self.chick.dir;
      p.y = self.chick.y;
    });
  };

  /* ---------- 交互 ---------- */
  /* ---------- 交互动作（点击与"走近后自动执行"共用） ---------- */
  Game.doPickup = function (o) {
    o.taken = true; this.hasDevice = true;
    if (global.SFX) global.SFX.pickup();
    this.showTip('拿到电激光！按住红色按钮', 3);
  };
  Game.doInvite = function (o) {
    o.invited = true; this.team.push(o);
    if (global.SFX) global.SFX.cheer();
    for (var k = 0; k < 10; k++) {
      this.particles.push({
        x: o.x, y: o.y - 40, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80,
        r: 6 + Math.random() * 4, life: 0.9, maxLife: 0.9, color: '#FFD34D', kind: 'star', grav: 60
      });
    }
    this.showTip('一起来吃饭吧！', 2);
  };
  Game.doToggleMirror = function (o) {
    o.angle = o.angle === '/' ? '\\' : '/';
    if (global.SFX) global.SFX.mirror();
  };
  Game.doSwitch = function (o) {
    o.on = true;
    if (global.SFX) global.SFX.switchOn();
    this.showTip('供电恢复！', 2);
  };
  Game.doFixed = function (o) {
    o.used = true; o.active = true; o.timer = o.duration;
    if (global.SFX) global.SFX.button();
    this.showTip('固定激光启动，快去另一边！', 2.4);
  };
  Game.doBumpDoor = function (o) {
    if (global.SFX) global.SFX.bump();
    this.showTip(o.type === 'iron' ? '铁门！要最大功率' : '锁住了，得想办法打开', 2);
  };

  Game.tapAt = function (wx, wy) {
    if (this.state !== 'play') return;
    var L = this.level, c = this.chick;
    var i, o;

    // 命中目标后：距离够就立刻执行，不够就先走过去（到达后自动执行）
    // 装置
    for (i = 0; i < L.devices.length; i++) {
      o = L.devices[i];
      if (o.taken) continue;
      if (Math.abs(wx - o.x) < 90) {
        if (Math.abs(c.x - o.x) < 115) this.doPickup(o);
        else { this.pending = { act: 'pickup', obj: o }; c.targetX = o.x; }
        return;
      }
    }
    // 伙伴
    for (i = 0; i < L.partners.length; i++) {
      o = L.partners[i];
      if (o.invited || !o.saved) continue;
      if (Math.abs(wx - o.x) < 90) {
        if (Math.abs(c.x - o.x) < 120) this.doInvite(o);
        else { this.pending = { act: 'invite', obj: o }; c.targetX = o.x; }
        return;
      }
    }
    // 镜子
    for (i = 0; i < L.mirrors.length; i++) {
      o = L.mirrors[i];
      // 判定框贴合镜面实际尺寸(size=64)：过大会让"点地面走位"误翻镜子
      // （镜子距地仅40px，走位点击y≈850 与镜面y=860 几乎重合，只能靠x区分）
      if (Math.abs(wx - o.x) < 45 && Math.abs(wy - o.y) < 45) {
        if (Math.abs(c.x - o.x) < 130) this.doToggleMirror(o);
        else { this.pending = { act: 'mirror', obj: o }; c.targetX = o.x; }
        return;
      }
    }
    // 电闸
    for (i = 0; i < L.switches.length; i++) {
      o = L.switches[i];
      if (o.on) continue;
      if (Math.abs(wx - o.x) < 90) {
        if (Math.abs(c.x - o.x) < 120) this.doSwitch(o);
        else { this.pending = { act: 'switch', obj: o }; c.targetX = o.x; }
        return;
      }
    }
    // 固定装置
    for (i = 0; i < L.fixedDevices.length; i++) {
      o = L.fixedDevices[i];
      if (o.used) continue;
      if (Math.abs(wx - o.x) < 100) {
        if (Math.abs(c.x - o.x) < 130) this.doFixed(o);
        else { this.pending = { act: 'fixed', obj: o }; c.targetX = o.x; }
        return;
      }
    }
    // 门（撞一下，给提示）
    for (i = 0; i < L.doors.length; i++) {
      o = L.doors[i];
      if (o.broken) continue;
      if (Math.abs(wx - o.x) < 90) { this.doBumpDoor(o); return; }
    }

    // 移动 / 跳跃（取消待执行动作）
    this.pending = null;
    var targetIsHigh = wy < c.y - 60;
    c.targetX = clamp(wx, 20, L.w - 20);
    if (targetIsHigh && Math.abs(wx - c.x) < 240 && !c.jumping) {
      c.vy = -JUMP_V; c.jumping = true;
      if (global.SFX) global.SFX.jump();
    }
  };

  /* 走近后自动完成之前点过的事 */
  Game.checkPending = function () {
    if (!this.pending) return;
    var o = this.pending.obj;
    if (Math.abs(this.chick.x - o.x) < 110) {
      var map = { pickup: 'doPickup', invite: 'doInvite', mirror: 'doToggleMirror',
                  switch: 'doSwitch', fixed: 'doFixed' };
      var fn = map[this.pending.act];
      if (fn) this[fn](o);
      this.pending = null;
    }
  };

  Game.setFiring = function (b) {
    this.firing = !!b;
    if (b && this.hasDevice && global.SFX) global.SFX.button();
  };

  Game.useHint = function () {
    // 提示：直接指向当前目标
    var L = this.level;
    this.usedHint = true;
    var dev = L.devices.filter(function (d) { return !d.taken; })[0];
    if (!this.hasDevice && dev) { this.showTip('去拿地上的电激光装置', 3); return; }
    var d = L.doors.filter(function (x) { return !x.broken; })[0];
    if (d) this.showTip('用二档以上的激光照住门', 3);
    else this.showTip('往家走！', 3);
  };

  /* ---------- 通关 ---------- */
  Game.clear = function () {
    if (this.state === 'clear') return;
    this.state = 'clear';
    this.firing = false;
    if (global.SFX) { global.SFX.laserStop(); global.SFX.win(); }
    var L = this.level;
    var t = this.time;
    var stars = 1;
    var partnerOk = L.partners.length === 0 || L.partners.every(function (p) { return p.invited; });
    if (t <= L.stars[0] && partnerOk && !this.usedHint) stars = 3;
    else if (t <= L.stars[1]) stars = 2;
    if (this.onClear) this.onClear({ stars: stars, time: t, partners: this.team.length, level: L, usedHint: this.usedHint });
  };

  /* ---------- 绘制 ---------- */
  Game.draw = function () {
    var ctx = this.ctx, L = this.level, c = this.chick;
    if (!L) return;
    var t = performance.now() / 1000;
    ctx.save();
    if (this.shake > 0) {
      this.shake -= 0.02;
      ctx.translate((Math.random() - 0.5) * this.shake * 22, (Math.random() - 0.5) * this.shake * 22);
    }
    var R = global.Render;
    R.background(ctx, this.camX, L, t);
    R.home(ctx, L.home, this.camX, t, L);

    L.platforms.forEach(function (p) { R.platform(ctx, p, Game.camX); });
    L.walls.forEach(function (w) { R.wall(ctx, w, Game.camX, t); });
    L.doors.forEach(function (d) { R.door(ctx, d, Game.camX, t); });
    L.ropes.forEach(function (r) { R.rope(ctx, r, Game.camX); });
    L.switches.forEach(function (s) { R.powerSwitch(ctx, s, Game.camX, t); });
    L.mirrors.forEach(function (m) { R.mirror(ctx, m, Game.camX); });
    L.fixedDevices.forEach(function (f) { R.fixedDevice(ctx, f, Game.camX, t); });
    L.devices.forEach(function (d) { if (!d.taken) R.device(ctx, d.x, Game.camX, t, false); });

    // 伙伴（未被邀请的）
    L.partners.forEach(function (p) {
      if (p.invited) return;
      var px = p.x - Game.camX;
      if (px < -120 || px > 870) return;
      var yy = p.saved ? p.y : p.homeY;
      R.drawCritterByName(ctx, p.type, p.x, yy, t, false, 1);
      if (!p.saved) {
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', p.x - Game.camX, yy - 90);
      } else if (Math.abs(c.x - p.x) < 100) {
        R.bubble(ctx, p.x, yy - 96, '一起吃？', Game.camX);
      }
    });

    // 小胖鸭
    if (this.duck.phase !== 'gone') {
      R.drawCritterByName(ctx, 'duck', this.duck.x, GROUND, t, this.duck.phase === 'run', -1);
    }

    // 队伍（已邀请伙伴）
    this.team.forEach(function (p, i) {
      R.drawCritterByName(ctx, p.type, p.x, p.y, t + i * 0.3, p.walking, p.dir);
    });

    // 小鸡
    R.drawCritterByName(ctx, 'chick', c.x, c.y, t, c.walking, c.dir);
    // 手持装置
    if (this.hasDevice) {
      var hx = c.x + c.dir * 26 - Game.camX;
      ctx.save(); ctx.translate(hx, c.y - 50); ctx.scale(c.dir, 1);
      ctx.fillStyle = '#B9C2CC';
      R.rr(ctx, -22, -16, 44, 30, 7); ctx.fill();
      ctx.strokeStyle = '#78828E'; ctx.lineWidth = 3;
      R.rr(ctx, -22, -16, 44, 30, 7); ctx.stroke();
      R.fillCircle(ctx, 20, -1, 8, '#3D4650');
      R.fillCircle(ctx, 20, -1, 4, this.power > 0 ? '#FF6B6B' : '#8FE3FF');
      var pulse = 0.55 + Math.sin(t * 6) * 0.45;
      ctx.fillStyle = 'rgba(255,80,80,' + pulse + ')';
      R.fillCircle(ctx, -8, -22, 9, '#E4453A');
      ctx.restore();
    }

    // 激光
    if (this.beamSegs.length) R.beam(ctx, this.beamSegs, this.beamPower || 0, this.camX, t);
    R.glow(ctx, this.beamPower || 0, t);

    R.particles(ctx, this.particles, this.camX);

    // 防卡关引导
    var gt = this.guideTarget();
    if (gt) R.guide(ctx, gt.x, gt.y, this.camX, t);

    // 提示气泡
    if (this.tipText && this.tipTimer > 0) {
      ctx.globalAlpha = Math.min(1, this.tipTimer * 2);
      R.bubble(ctx, c.x, c.y - 120, this.tipText, this.camX);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  global.Game = Game;
})(window);
