/* ===== src/js/60-game.js · 主循环 + 顶层状态机 + L5 子状态机 + 碰撞/相遇/兜底 · 依赖 00~50 =====
 * 顶层状态：boot | title | act1 | act2 | act3 | finale | paused
 * L5 子状态：goOut → midEvent → goBack → clear
 *
 * ⚠️ 全项目**只有一处** requestAnimationFrame（在 90-main.js），本文件只提供 step(dt)。
 * ⚠️ 方向实现 = 进度空间 s + 单点方向映射（worldToScreenX 在 70-render），
 *    绝不对整个 canvas 做 ctx.scale(-1,1) 镜像。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var L = global.Levels;
  var S = global.Save;
  var A = global.Audio;
  var Art = global.Art;
  var St = global.Story;
  var P = global.Physics;

  var Game = {
    state: 'boot',
    prevState: '',
    levelIndex: 0,              /* 0..4，5=未进关 */
    subState: '-',              /* L5: goOut|midEvent|goBack|clear；其余关 '-' */

    /* —— 当前段（1-4 关直接把 Level 当 seg；L5 用 outbound/inbound）—— */
    seg: null,
    segName: '',
    dir: 1,
    level: null,
    duck: null,
    obstacles: [],
    movers: [],
    team: [],
    met: [],
    bubbles: [],
    camS: 0,
    segTimeMs: 0,
    totalTimeMs: 0,
    bumps: 0,
    assistCount: 0,
    stuckT: 0,
    stuckAnchorS: 0,
    maxS: 0,                    /* 已到达的最远 s：卡关判定只认向前的净推进（不能是 undefined） */
    assistT: 0,
    animT: 0,
    bobT: 0,
    lastFace: 1,
    boostOn: false,
    /* L5 */
    l5: { midT: 0, turnT: 0, victoryT: 0, cleared: false, gateOpen: false },
    /* 结局 */
    finaleT: 0,
    /* 教学 */
    tut: { i: 0, t: 0, active: false },
    /* 相遇统计 */
    metCount: 0
  };

  /* ================= 输入快照（由 90-main 写入，Game 只读） ================= */
  var input = { holding: false, holdMs: 0, tapEdge: false, autoRun: false };

  /* ================= 生命周期 ================= */
  Game.goto = function (state) {
    if (state === 'paused') { Game.prevState = Game.state; }
    Game.state = state;
    if (state !== 'act3') { Game.levelIndex = 0; }
  };

  Game.setInput = function (o) {
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) input[k] = o[k]; }
  };
  Game.input = input;

  /** 载入第 i 关（0..4） */
  Game.loadLevel = function (i) {
    var lv = L.get(i);
    if (!lv) return;
    Game.levelIndex = i;
    Game.level = lv;
    Game.met = [];
    Game.bubbles = [];
    Art.clearParticles();
    S.markRun();
    input.autoRun = K.autoRunActive(i);

    if (lv.roundTrip) {
      Game.loadSegment('outbound', lv);
      Game.subState = 'goOut';
    } else {
      Game.loadSegment(null, lv);
      Game.subState = '-';
    }
    /* 教学 */
    Game.tut.i = 0; Game.tut.t = 0; Game.tut.active = !!(lv.tutorial && lv.tutorial.steps && lv.tutorial.steps.length);
    /* 卡关检测锚点：必须按**本关实际出生点**重置（loadSegment 里已按 startS 设过一次，
       这里再对齐 duck 的真实 s，避免第 5 关去程出生在 s=60 却被写成 0 造成锚点偏低）。 */
    Game.stuckT = 0; Game.assistT = 0;
    Game.stuckAnchorS = Game.duck ? Game.duck.s : 0;
    Game.maxS = Game.stuckAnchorS;
    A.play('ui_tap');
    if (Game.state !== 'act3') Game.state = 'act3';
  };

  /**
   * 载入一段。segName = 'outbound' | 'inbound' | null（普通关）。
   *
   * ⚠️ 构造**运行时段视图**：关卡数据里 1–4 关只有 terrain[0].y、没有顶层 groundY，
   *    而 Physics/Render 全都读 seg.groundY。这里统一补齐，避免各处各写一遍 fallback。
   * ⚠️ 两段数据独立：Game.obstacles / Game.movers 从本段**整体重建**（PRD §12.2 R4 核心防御）。
   *
   * @param {?string} segName  段名；null = 普通关直接用 Level
   * @param {?object} lvOverride  关卡覆盖（换段时传 lv 更安全，避免读 Game.level 的时序歧义）
   * @param {boolean} keepStats  **进入回程时必须为 true**：保留第 5 关跨段的累计成绩。
   *        false = 全新开始（去程起点、普通关、续跑重建），清零计时与碰撞。
   */
  Game.loadSegment = function (segName, lvOverride, keepStats) {
    var lv = lvOverride || Game.level;
    if (!lv) return;
    var src = segName ? lv[segName] : lv;
    if (!src) return;
    Game.segName = segName || '';

    var terrain = src.terrain && src.terrain[0] ? src.terrain[0] : { y: 520 };
    var seg = {
      segLen: src.segLen || src.exitX || terrain.len || 2400,
      dir: src.dir || 1,
      cruise: src.cruise || lv.cruise || K.CRUISE,
      groundY: (src.groundY !== undefined) ? src.groundY : terrain.y,
      sky: src.sky || 'day',
      arrows: src.arrows || (src.dir === -1 ? 'left' : 'right'),
      scene: src.scene || lv.scene,
      boost: src.boost || null,
      safeTail: src.safeTail || 0,
      terrain: src.terrain || [{ s: 0, len: src.segLen || 2400, y: terrain.y, kind: 'road' }],
      obstacles: src.obstacles || [],
      movers: src.movers || [],
      actors: src.actors || [],
      exitX: src.exitX !== undefined ? src.exitX : (src.segLen || 0)
    };
    Game.seg = seg;
    Game.dir = seg.dir;
    /* ⚠️ 整体重建，绝不浅拷贝（PRD §12.2 R4 的核心防御） */
    Game.obstacles = seg.obstacles.map(function (o) {
      return { s: o.s, type: o.type, w: o.w, h: o.h, solid: o.solid !== false, fall: !!o.fall, spin: 0, sink: 0 };
    });
    /* 移动障碍从本段数据重建（与 obstacles 一样，绝不跨段复用） */
    Game.movers = (seg.movers || []).map(function (m) {
      return { s: m.s, type: m.type, w: m.w, h: m.h, speed: m.speed || 90, spin: 0, baseS: m.s };
    });
    /* 队伍：跟随偏移按本段速度重算，但**成员跨段保留**（第 5 关回程 8 位一起回家） */
    for (var i = 0; i < Game.team.length; i++) {
      Game.team[i].joined = true;
      Game.team[i].lag = K.FOLLOW_OFFSET;
    }

    /* 出生点：去程用起点集合点 s=origin.s；回程 s=0 就是校门口（起点旗在 s=60，24px 容差内） */
    var startS = (segName === 'inbound') ? 0 : (lv.origin ? lv.origin.s : 0);
    Game.duck = {
      s: startS,
      prevS: startS,
      y: seg.groundY, prevY: seg.groundY,
      vx: 0, vy: 0, grounded: true,
      facing: 1, lastFace: 1,
      hitT: 0, hitKind: null, hitPhase: 0, bumpResetS: startS, bumpLanded: false,
      landSquashT: 0, invulnT: (segName === 'inbound' ? 0.3 : 0),
      animState: 'stand', jumpedThisStep: false
    };
    /* camS 立即 snap（不要平滑，否则开局 1s 镜头在追） */
    Game.camS = camTarget();
    /* ⚠️ 第 5 关是一个整体：进入回程时 bumps / met / team / segTimeMs 绝不清零（硬要求 R1/R5） */
    if (!keepStats) {
      Game.segTimeMs = 0;
      Game.bumps = 0;
    }
    Game.boostOn = false;
    Game.l5.midT = 0; Game.l5.turnT = 0; Game.l5.victoryT = 0; Game.l5.gateOpen = !!segName;
    Game.stuckT = 0; Game.stuckAnchorS = startS; Game.maxS = startS; Game.assistT = 0;
    Art.clearParticles();

    /* BGM：两段各一首（outbound 上学奔跑曲 / inbound 放学归家曲） */
    var bgm = lv.roundTrip ? lv.bgm[segName] : lv.bgm;
    A.music(bgm, { fadeMs: 500 });
  };

  /** goBack 运行中每 5 秒刷写 checkpoint（R1 落点②的持续覆盖） */
  var ckTimer = 0;
  function flushCheckpoint(dt) {
    if (!Game.level || !Game.level.roundTrip) return;
    if (Game.subState !== 'goBack' && Game.subState !== 'midEvent') return;
    ckTimer += dt;
    if (ckTimer < 5) return;
    ckTimer = 0;
    S.checkpoint({ phase: Game.subState === 'goBack' ? 'inbound' : 'mid', segTimeMs: Game.segTimeMs, bumps: Game.bumps, met: Game.met.slice() });
  }

  /**
   * 进入回程（架构 §1.3.2 的「19 项进入回程必清字段」）：
   * 必须清的：obstacles / movers（从 inbound 数据整体重建）、hitT / invulnT / vx / vy、
   *           boost、bubbles 里的旧气泡、每 5 秒刷 checkpoint 的计时器
   * 必须保留的：bumps / met / team / segTimeMs / stats.l5out —— 第 5 关是一个整体
   */
  Game.enterGoBack = function () {
    Game.subState = 'goBack';
    Game.bubbles = [];
    ckTimer = 0;
    Game.loadSegment('inbound', Game.level, true);      /* keepStats = true，跨段不清成绩 */
    Game.l5.midT = 0; Game.l5.turnT = K.TURN_MS / 1000;
    S.bumpStat('l5out');
    S.flush();
  };

  /* ================= 相机 ================= */
  function camTarget() {
    var viewW = global.Render ? global.Render.viewW() : K.DESIGN_W;
    if (Game.dir === 1) return Game.duck.s - viewW * 0.38;
    return Game.duck.s - viewW * 0.62;
  }

  /* ================= 主更新 ================= */
  Game.step = function (dt) {
    if (Game.state === 'paused' || Game.state === 'title' || Game.state === 'boot') return;
    Game.animT += dt;

    if (Game.state === 'act1' || Game.state === 'act2') {
      St.tick(dt);
      Art.stepParticles(dt);
      if (St.isDone()) onStoryDone();
      return;
    }
    if (Game.state === 'finale') {
      Game.finaleT += dt;
      Game.l5.victoryT += dt;
      stepTeamFollow(dt, true);
      Art.stepParticles(dt);
      /* PRD §5.2.6：胜利演出 2.5s（VICTORY_MS）后弹结算面板。成绩早已冻结在 pendingResult，
         这里不重算 —— 否则归家列队期间 segTimeMs 继续累加会把成绩算错。 */
      if (Game.finaleT >= K.VICTORY_MS / 1000) showResultOnce();
      return;
    }
    if (Game.state !== 'act3') return;

    stepAct3(dt);
  };

  function onStoryDone() {
    if (Game.state === 'act1') {
      A.music('schoolMarch', { fadeMs: 500 });
      Game.goto('act2');
      St.play('act2');
    } else if (Game.state === 'act2') {
      Game.goto('act3');
      Game.loadLevel(0);
      global.UI.hideStory();
    }
  }

  /* ================= 幕三 ================= */
  function stepAct3(dt) {
    var d = Game.duck;
    if (!d) return;
    var lv = Game.level;
    var isL5 = !!lv.roundTrip;

    /* ---------- 计时（中途事件暂停累计：R5） ---------- */
    var timing = true;
    if (isL5 && Game.subState === 'midEvent') timing = false;
    if (isL5 && Game.subState === 'clear') timing = false;
    if (timing) {
      Game.segTimeMs += dt * 1000;
      Game.totalTimeMs += dt * 1000;
    }

    /* ---------- 子状态机分派 ---------- */
    if (isL5 && Game.subState === 'midEvent') { stepMidEvent(dt); return; }
    if (isL5 && Game.subState === 'clear') { stepClear(dt); return; }

    /* ---------- 碰撞演出期间：只跳过移动/输入分支，其余照常 ---------- */
    var frozen = d.hitT > 0;
    var snap = { s: d.s, y: d.y, vx: d.vx, vy: d.vy, grounded: d.grounded };
    if (frozen) {
      /* 弹开物理仍要算（视觉上被弹出去），但不吃输入 */
      d.hitT -= dt;
      d.vy += K.GRAVITY * dt; d.y += d.vy * dt;
      d.s += d.vx * dt;
      var sy = P.supportY(Game.seg, d.s, d.y);
      if (d.y >= sy) { d.y = sy; d.vy = 0; d.grounded = true; }
      stepBumpTimeline(dt);
    } else {
      /* ⚠️ 顺序不能反：必须**先读进 inp，再清边**。
         原写法在这里先 `if (input.tapEdge) input.tapEdge = false;` 再读 input.tapEdge，
         读到的一定是 false —— 结果小鸭**永远跳不起来**（点击跳跃完全失效），
         第 1/3/4 关所有跳跃障碍都过不去。这是「跳箱子过不去」的真正根因。 */
      var inp = {
        holding: input.holding,
        holdMs: input.holdMs,
        tapEdge: input.tapEdge,
        autoRun: input.autoRun
      };
      input.tapEdge = false;                      /* 读完立刻清边：一次点击只触发一次跳，不跨帧重复 */
      if (d.invulnT > 0) d.invulnT -= dt;
      d.jumpedThisStep = false;
      P.step(d, Game.seg, dt, inp);
      if (d.jumpedThisStep) {
        A.play(inp.holdMs >= K.HOLD_MS_THRESHOLD ? 'jump_high' : 'jump');
        d.landSquashT = 0;
      }
      if (d.landSquashT > 0) d.landSquashT -= dt;
      stepRunSound(dt);
    }

    /* ---------- 移动障碍 ---------- */
    stepMovers(dt);

    /* ---------- 碰撞扫描 ----------
     * ⚠️ 辅助推进期间**不受理碰撞**：主循环本帧顺序是 scanCollisions → stepAssist，
     *    若照常扫描，辅助推进时小鸭在地面高度且不跳，下一帧立刻被判侧撞弹回、
     *    再被 stepBumpTimeline 复位到障碍前，1.5s 的辅助位移被完全抵消（等于没帮）。
     *    这是给 5–6 岁孩子的零失败兜底，只在真实卡住 6s 后触发 1.5s，符合原设计意图。 */
    if (!frozen && d.hitT <= 0 && Game.assistT <= 0) scanCollisions();

    /* ---------- 相遇检测 ---------- */
    stepMeet(dt);

    /* ---------- 卡关兜底 ---------- */
    stepAssist(dt);

    /* ---------- 冲刺带状态（HUD 视觉） ---------- */
    Game.boostOn = !!(Game.seg.boost && d.s >= Game.seg.boost.s0 && d.s <= Game.seg.boost.s1);

    /* ---------- 相机（指数平滑，帧率无关） ---------- */
    var t = camTarget();
    Game.camS += (t - Game.camS) * (1 - Math.exp(-8 * dt));
    Game.camS = Math.max(0, Math.min(Game.seg.segLen, Game.camS));

    /* ---------- 教学演示 ---------- */
    stepTutorial(dt);

    /* ---------- 终点判定 ---------- */
    stepGoal();

    /* ---------- 插值用的 prev ---------- */
    d.prevS = d.s; d.prevY = d.y;
    stepTeamFollow(dt, false);
    Art.stepParticles(dt);
    stepBubbles(dt);
    flushCheckpoint(dt);
    void snap;
  }

  /* ---------- 移动障碍 ---------- */
  function stepMovers(dt) {
    for (var i = 0; i < Game.movers.length; i++) {
      var m = Game.movers[i];
      m.s += m.speed * dt;                       /* 与关卡方向无关的自身滚动 */
      if (m.s > Game.seg.segLen + 120) m.s = -120;
      m.spin += dt * (m.speed / 8);
    }
    for (var j = 0; j < Game.obstacles.length; j++) {
      var o = Game.obstacles[j];
      if (o.type === 'pinwheel') o.spin += dt * 5;
      if (o.type === 'hobby_horse') o.spin = Math.sin(Game.animT * 6) * 0.16;
    }
  }

  /* ---------- 碰撞扫描（T10 零失败） ---------- */
  function scanCollisions() {
    var d = Game.duck;
    if (d.invulnT > 0) return;
    var db = P.duckBox(d.s, d.y);
    var i, o, ob;

    /* ① 实心障碍：侧面撞 → 搞笑弹开 */
    for (i = 0; i < Game.obstacles.length; i++) {
      o = Game.obstacles[i];
      if (!o.solid) continue;
      /* 站在台阶顶面不算撞 */
      if (o.type === 'step' || o.type === 'high') {
        if (d.y <= Game.seg.groundY - o.h + 6) continue;
      }
      ob = P.obsBox(o, Game.seg.groundY);
      if (P.aabb(db, ob)) { applyBump(o, 'side'); return; }
    }
    /* ② 移动障碍 */
    for (i = 0; i < Game.movers.length; i++) {
      o = Game.movers[i];
      ob = P.obsBox(o, Game.seg.groundY);
      if (P.aabb(db, ob)) { applyBump(o, 'side'); return; }
    }
    /* ③ 落水 / 踩空荷叶（第 3、4 关） */
    for (i = 0; i < Game.obstacles.length; i++) {
      o = Game.obstacles[i];
      if (!o.fall) continue;
      var half = o.w / 2;
      if (d.s > o.s - half && d.s < o.s + half) {
        /* lotus 踩上去算成功（由 supportY 顶住），这里只处理 puddle 与踩空 */
        if (o.type === 'lotus' && d.y <= Game.seg.groundY - 12 + 20) continue;
        /* ★ puddle 腾空豁免：脚底离地 ≥ K.PUDDLE_CLEAR 即算跳过去。
           没有这一行，跳到峰顶（离地 176px）也会被判落水 —— 水洼永远跳不过，第 3 关无解。 */
        if (o.type === 'puddle' && d.y <= Game.seg.groundY - K.PUDDLE_CLEAR) continue;
        applyBump(o, 'fall');
        return;
      }
    }
  }

  /* ---------- 碰撞演出：严格 0.90s 三段（PRD §5.3） ---------- */
  function applyBump(o, kind) {
    var d = Game.duck;
    d.hitT = K.HIT_TOTAL;
    d.hitPhase = 0;
    d.hitKind = kind;
    Game.bumps++;
    S.bumpStat('totalBumps');
    if (kind === 'fall') {
      A.play('splash'); A.play('lotus_dunk'); A.play('sit_stars');
      Art.emit('splash', d.s, d.y, 8, { ttl: 0.7, speed: 140, g: 500, col: 'rgba(143,200,232,.85)' });
      /* 落水：弹起 + 甩水 + 星星头，0.9s 后落在最近安全平台 */
      d.vx = 0; d.vy = -560;
    } else {
      A.play('bump'); A.play('ouch'); A.play('stand_pop');
      Art.emit('star', d.s, d.y - 30, 3, { ttl: 0.8, speed: 130, g: 400 });
      P.applyBump(d, Game.dir);
    }
    /* 复位目标：障碍前 40px（§5.3 ④） */
    var back = o ? (o.s - K.BUMP_BACK) : d.s;
    d.bumpResetS = Math.max(0, Math.min(Game.seg.segLen, back));
  }

  function stepBumpTimeline(dt) {
    var d = Game.duck;
    var el = K.HIT_TOTAL - d.hitT;                 /* 已过时长 */
    d.hitPhase = el < K.HIT_STAGE1 ? 0 : (el < K.HIT_STAGE2 ? 1 : 2);
    if (d.hitKind === 'fall' && el >= K.HIT_STAGE2 && !d.bumpLanded) {
      /* 落水的「甩水」表现 */
      Art.emit('splash', d.s, d.y - 20, 4, { ttl: 0.5, speed: 90, g: 300 });
      d.bumpLanded = true;
    }
    if (d.hitT <= 0) {
      /* ④ 复位：回退到障碍前 40px / 送回最近安全平台 */
      var t = P.nearestSafeS(Game.seg, d.bumpResetS, 420);
      d.s = t;
      d.prevS = t;
      d.y = P.supportY(Game.seg, d.s, Game.seg.groundY + 999);
      d.prevY = d.y;
      d.vy = 0; d.vx = 0; d.grounded = true;
      d.hitKind = null; d.hitPhase = 0; d.bumpLanded = false;
      d.invulnT = 0.25;
      Art.emit('star', d.s, d.y - 34, 2, { ttl: 0.6, speed: 90, g: 300 });
    }
  }

  /* ---------- 跑动脚步声：频率随速度 ---------- */
  var lastStepPhase = 0;
  function stepRunSound(dt) {
    var d = Game.duck;
    if (!d.grounded || Math.abs(d.vx) < 30) { lastStepPhase = 0; return; }
    var f = Math.abs(d.vx) / 28 / 2;               /* PRD §6.2 步频 = 速度/28 */
    if (Math.floor(f) !== lastStepPhase) { lastStepPhase = Math.floor(f); A.play('run_step', { rate: Math.abs(d.vx) / 265 }); }
    void dt;
  }

  /* ---------- 相遇检测（T11）：96px 自动触发，不需要点击 ---------- */
  function stepMeet(dt) {
    var acts = Game.seg.actors || [];
    var d = Game.duck;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (Game.met.indexOf(a.id) >= 0) continue;
      var as = a.s;
      /* 回程 actor 从校门起算；去程同理，各自段内独立 */
      if (Math.abs(d.s - as) <= K.MEET_DIST) {
        Game.onMeet(a);
      }
    }
    /* 猫的节拍台词：走过时逐条冒泡 */
    void dt;
  }

  Game.onMeet = function (a) {
    if (Game.met.indexOf(a.id) >= 0) return;
    Game.met.push(a.id);
    Game.metCount = Game.met.length;
    /* R1 落点需要 met，写进 checkpoint */
    S.data.gallery[a.id] = true;
    S.data.progress.cleared[String(Game.level.id)] = S.data.progress.cleared[String(Game.level.id)] || null;
    delete S.data.progress.cleared[String(Game.level.id)];   /* 相遇本身不写通关 */
    S.flush();

    var lines = a.lines || [];
    for (var i = 0; i < lines.length; i++) {
      pushBubble(a.id, lines[i], i * 1.6);
    }
    A.play('greet_hi', { by: K.FRIENDS.indexOf(a.id) });
    Art.emit('star', Game.duck.s + 10, Game.duck.y - 60, 3, { ttl: 0.7, speed: 70, g: 60 });
    /* 入队：跟在侧后方 60px（跨段保留，第 5 关 8 位） */
    if (!hasTeam(a.id)) {
      Game.team.push({ id: a.id, lag: K.FOLLOW_OFFSET, joined: true, t: 0 });
    }
  };

  function hasTeam(id) {
    for (var i = 0; i < Game.team.length; i++) if (Game.team[i].id === id) return true;
    return false;
  }

  /** 队伍跟随：不参与碰撞、无掉队惩罚 */
  function stepTeamFollow(dt, idle) {
    var d = Game.duck;
    for (var i = 0; i < Game.team.length; i++) {
      var m = Game.team[i];
      m.t += dt;
      if (idle) {
        /* 结局列队：8 位排成一列走向家门 */
        m.s = d.s - 70 - i * 58;
        continue;
      }
      var target = d.s - m.lag - i * 14;
      m.s += (target - m.s) * (1 - Math.exp(-6 * dt));
      if (m.s < 0) m.s = 0;
    }
  }

  /* ---------- 气泡 ---------- */
  function pushBubble(who, text, delay) {
    Game.bubbles.push({ who: who, text: text, t: -(delay || 0), ttl: 1.6 });
    /* 最多排队 2 条 */
    if (Game.bubbles.length > 2) Game.bubbles.shift();
  }
  function stepBubbles(dt) {
    for (var i = Game.bubbles.length - 1; i >= 0; i--) {
      var b = Game.bubbles[i];
      b.t += dt;
      if (b.t >= b.ttl) Game.bubbles.splice(i, 1);
    }
  }

  /* ---------- 卡关兜底：同位置 6s 无前进 → 辅助前进 1.5s + 手指演示 ---------- */
  function stepAssist(dt) {
    var d = Game.duck;
    if (Game.assistT > 0) {
      Game.assistT -= dt;
      d.s += K.CRUISE * 0.9 * dt;                 /* 辅助前进：不扣分、不中断 */
      return;
    }
    /* ★ 只认**净向前推进**。maxS = 「上次确认有进展的位置锚点」，**只在突破时**更新。
       两个都踩过的坑，写在这里防止后人改回去：
       ① 不能写成 Math.abs(d.s - 锚点) > 24 —— 撞击后小鸭以 BUMP_VX=180 仰飞 HIT_TOTAL=0.9s，
          即向后位移 162px，会被当成「有进展」而清零 stuckT，STUCK_SEC=6 永远累积不满，
          assistCount 恒为 0，卡住的孩子得不到任何帮助（这正是本函数要修的 bug）。
       ② 也不能每帧把 maxS 追平到 d.s（`if (d.s > maxS) maxS = d.s;`）—— 那样
          `d.s > maxS + 24` 只在起步时成立一次，之后 maxS 永远贴着 d.s 走，判据彻底失效，
          结果变成**顺畅跑动也会每 6 秒误触发一次辅助**（辅助是兜底，不该在没卡住时给）。
       正确语义：锚点只在「向前突破锚点 24px」时前移，因此必然单调递增，向后倒退永远不算进展。 */
    if (d.s > Game.maxS + 24) {                   /* 向前突破锚点 24px → 确认有进展 */
      Game.maxS = d.s; Game.stuckAnchorS = d.s; Game.stuckT = 0; return;
    }
    Game.stuckT += dt;
    if (Game.stuckT >= K.STUCK_SEC) {
      Game.stuckT = 0;
      Game.assistT = K.ASSIST_SEC;
      Game.assistCount++;
      S.bumpStat('stuckCount');
      S.bumpStat('autoRun');
      if (Game.level && Game.level.id === 5 && Game.subState === 'goBack') S.bumpStat('inboundStuck');
      S.flush();
      /* 高亮下一个可跳位置 */
      var nx = nextObstacleS();
      Art.emit('star', nx, Game.seg.groundY - 40, 4, { ttl: 1.2, speed: 60, g: -20 });
    }
  }
  function nextObstacleS() {
    var best = Game.seg.segLen;
    for (var i = 0; i < Game.obstacles.length; i++) {
      if (Game.obstacles[i].s > Game.duck.s + 8 && Game.obstacles[i].s < best) best = Game.obstacles[i].s;
    }
    return best;
  }

  /* ---------- 教学手指演示 ---------- */
  function stepTutorial(dt) {
    if (!Game.tut.active) return;
    var steps = Game.level.tutorial.steps;
    var st = steps[Game.tut.i];
    if (!st) { Game.tut.active = false; return; }
    Game.tut.t += dt * 1000;
    if (Game.tut.t >= st.durMs) {
      Game.tut.t = 0;
      Game.tut.i++;
      if (Game.tut.i >= steps.length) Game.tut.active = false;
    }
  }

  /* ================= 终点判定 ================= */
  function stepGoal() {
    var d = Game.duck, seg = Game.seg;
    if (Game.level.roundTrip) {
      if (Game.subState === 'goOut') {
        /* T1：触碰校门拱线 → midEvent（24px 容差，一帧跨过不漏触发） */
        if (d.s >= seg.segLen - K.L5_GATE_TOLERANCE) gotoSubState('midEvent');
      } else if (Game.subState === 'goBack') {
        /* T3：触碰起点旗 → clear */
        if (d.s >= seg.segLen - K.L5_GATE_TOLERANCE) gotoSubState('clear');
      }
      return;
    }
    /* 1-4 关：跑到出口箭头 */
    if (d.s >= seg.exitX - K.L5_GATE_TOLERANCE) onLevelClear();
  }

  /* ================= L5 子状态机（T09） ================= */
  Game.gotoSubState = gotoSubState;
  function gotoSubState(s) {
    if (Game.subState === s) return;
    var lv = Game.level;

    if (s === 'midEvent') {
      /* —— ① 到达校门：定格 0.4s → 小规模彩带 → 喊话 → 转身 → 标识切换 —— */
      Game.subState = 'midEvent';
      Game.l5.midT = 0;
      Game.l5.turnT = 0;
      Game.duck.vx = 0; Game.duck.vy = 0;
      A.play('schoolBell');
      A.play('confetti_small');
      Art.emit('confetti', Game.duck.s - 60, Game.duck.y - 120, 22, { ttl: 1.3, speed: 260, g: 420, lift: 160, col: K.C.chick });
      /* 3 句正向鼓励话术 */
      for (var i = 0; i < lv.midEvent.lines.length; i++) {
        pushBubble(lv.midEvent.lines[i].id, lv.midEvent.lines[i].text, i * 0.34);
      }
      /* 中途的 4 位同学也一起喊 */
      var gateActors = lv.outbound.actors || [];
      for (var j = 0; j < gateActors.length; j++) {
        if (hasTeam(gateActors[j].id)) continue;
        Game.team.push({ id: gateActors[j].id, lag: K.FOLLOW_OFFSET + j * 12, joined: true, t: 0 });
        if (Game.met.indexOf(gateActors[j].id) < 0) { Game.met.push(gateActors[j].id); S.data.gallery[gateActors[j].id] = true; }
      }
      /* R1 落点①：写 phase mid（事件本身可续，孩子不会卡在事件里） */
      S.checkpoint({ phase: 'mid', segTimeMs: Game.segTimeMs, bumps: Game.bumps, met: Game.met.slice() });
      return;
    }

    if (s === 'goBack') {
      /* T2：midEvent 演完（或玩家输入）→ 全体转身 + 箭头反向 + 色调转暖 + BGM 切换 */
      A.play('go_back_cue');
      A.play('ui_tap');
      /* bumps / met / team / segTimeMs / stats.l5out 全部保留 —— 第 5 关是一个整体 */
      Game.enterGoBack();
      /* R1 落点②：改写 phase inbound */
      S.checkpoint({ phase: 'inbound', segTimeMs: Game.segTimeMs, bumps: Game.bumps, met: Game.met.slice() });
      return;
    }

    if (s === 'clear') {
      /* T3 → 胜利演出：定格 → 大礼花 → 8 位欢呼 → 放学钟+上学钟 → 列队回家 */
      var res5 = buildResult();          /* 先冻结去程+回程合计成绩，再切状态 */
      Game.subState = 'clear';
      Game.l5.victoryT = 0;
      Game.duck.vx = 0;
      A.play('victory_bell');
      A.play('cheer_win');
      A.play('confetti_big');
      for (var k = 0; k < 6; k++) {
        Art.emit('confetti', Game.duck.s - 200 + k * 90, Game.duck.y - 200, 18,
          { ttl: 1.9, speed: 300, g: 380, lift: 190, col: [K.C.chick, K.C.beak, K.C.comb, K.C.chickBr][k % 4] });
      }
      /* 结局全员 8 位：队伍不足则补齐（结局必须完整呈现 8 位） */
      for (var m = 0; m < K.LINEUP.length; m++) {
        if (!hasTeam(K.LINEUP[m])) Game.team.push({ id: K.LINEUP[m], lag: K.FOLLOW_OFFSET + m * 12, joined: true, t: 0 });
      }
      pushBubble('duck', '回家咯——！', 0.2);
      /* R1 落点③：删 checkpoint，写 cleared['5'] */
      S.checkpoint(null);
      S.bumpStat('l5back');
      writeCleared(5);
      S.flush();
      /* 顶层切 finale 走胜利演出；成绩已冻结，finale 分支不会继续累加 */
      Game.state = 'finale';
      Game.finaleT = 0;
      pendingResult = res5;
    }
  }

  /** 中途事件：1.2s 或玩家输入 → goBack */
  function stepMidEvent(dt) {
    Game.l5.midT += dt;
    var dur = Game.level.midEvent.durMs / 1000;
    /* 玩家输入可响应（PRD：点击「开始回程」立即出发，不强制等演出播完） */
    if (input.tapEdge || input.holding) { input.tapEdge = false; gotoSubState('goBack'); return; }
    if (Game.l5.midT >= dur) gotoSubState('goBack');
  }

  /** CLEAR：2.5s 胜利演出后弹结算（顶层已切 finale，实际由 finale 分支调用） */
  function stepClear(dt) {
    Game.l5.victoryT += dt;
    if (Game.l5.victoryT >= K.VICTORY_MS / 1000) showResultOnce();
  }

  var resultShown = false;
  var pendingResult = null;
  function showResultOnce(res) {
    if (resultShown) return;
    resultShown = true;
    global.UI.showResult(res || pendingResult || buildResult());
    pendingResult = null;
  }
  Game.resetResultFlag = function () { resultShown = false; pendingResult = null; };

  /* ================= 通关写入 + 星级判定 ================= */
  function onLevelClear() {
    var res = buildResult();                  /* 先冻结本关成绩，再切状态，避免 step 被 finale 分支吃掉 */
    writeCleared(Game.level.id);
    A.play('victory_bell');
    A.play('confetti_big');
    Game.subState = 'clear';
    Game.state = 'finale';
    Game.finaleT = 0;
    Game.duck.vx = 0;
    Game.duck.s = Game.seg.exitX;              /* 停在出口，别被相机拖回去 */
    pendingResult = res;
  }

  function writeCleared(id) {
    var lv = L.get(id - 1);
    if (!lv) return;
    var timeMs = Game.segTimeMs;
    var bumps = Game.bumps;
    var stars = judgeStars(lv, timeMs, bumps);
    var key = String(id);
    var old = S.data.progress.cleared[key];
    /* 重玩不回退最好成绩 */
    if (!old || stars > old.stars || (stars === old.stars && timeMs < old.timeMs)) {
      S.data.progress.cleared[key] = { stars: stars, timeMs: Math.round(timeMs), bumps: bumps, met: Game.met.slice() };
    }
    /* 解锁推进（上限 5），重玩旧关不回退 */
    if (id + 1 <= 5 && S.data.progress.unlocked < id + 1) S.data.progress.unlocked = id + 1;
  }

  /**
   * 星级判定（PRD §10.3）：
   *   3 星 = 通关 且 timeMs ≤ 三星秒数 **且 bumps ≤ 三星碰撞上限**（两个条件都要满足）
   *   2 星 = 通关 且 timeMs ≤ 二星秒数（碰撞不卡二星）
   *   1 星 = 通关即得
   * ⚠️ bumpCap（12/14/16/18/26）是「超出只影响家长统计、不扣星」的上限，
   *    与「三星碰撞门槛」（4/5/6/7/12）是**两个不同数字**，不要混用。
   */
  function judgeStars(lv, timeMs, bumps) {
    var s = lv.stars;
    if (timeMs <= s[0] * 1000 && bumps <= lv.threeBumps) return 3;
    if (timeMs <= s[1] * 1000) return 2;
    return 1;
  }
  Game.judgeStars = judgeStars;

  function buildResult() {
    var lv = Game.level;
    var isL5 = lv.roundTrip;
    return {
      levelId: lv.id,
      levelName: lv.name,
      stars: judgeStars(lv, Game.segTimeMs, Game.bumps),
      timeMs: Math.round(Game.segTimeMs),
      bumps: Game.bumps,
      bumpCap: lv.bumpCap,
      threeBumps: lv.threeBumps,
      need3: (lv.stars[0] + '秒内 + 碰撞≤' + lv.threeBumps),
      met: Game.met.slice(),
      metTotal: K.FRIENDS.length,
      isFinale: isL5,
      teamCount: Game.team.length,
      seg: Game.segName
    };
  }
  Game.buildResult = buildResult;

  /* ================= 幕三之外的更新：剧情幕的 duck 引用 ================= */
  Game.currentSeg = function () { return Game.seg; };

  /* ================= 动画状态计算（写在 Game，不写在 Art） ================= */
  Game.animState = function () {
    var d = Game.duck;
    if (!d) return 'stand';
    if (d.hitT > 0) return d.hitT > 0.35 ? 'land' : 'sitStars';
    if (d.landSquashT > 0) return 'land';
    if (!d.grounded) return d.vy <= 0 ? 'jump' : 'fall';
    if (Math.abs(d.vx) > 30) return 'run';
    return 'stand';
  };

  /** 跑动帧号：floor(bobT * (vx/28) / 2) % 4 —— 帧号与渲染帧率无关 */
  Game.runFrame = function () {
    var d = Game.duck;
    if (!d) return 0;
    if (d.hitT > 0) return 0;
    Game.bobT += 0;   /* bobT 由 Render.frame 以真实 dt 累加，避免依赖 step 次数 */
    var f = Math.floor((Game.bobT * Math.abs(d.vx) / 28) / 2) % 4;
    return f < 0 ? 0 : f;
  };
  Game.advanceBob = function (dt) { Game.bobT += dt; };

  global.Game = Game;
})(window);
