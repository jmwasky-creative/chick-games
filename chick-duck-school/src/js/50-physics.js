/* ===== src/js/50-physics.js · 定步长积分 / AABB / 支撑面 / 弹开 · 依赖 00-const =====
 * ⚠️ 本文件是**方向无关**的纯函数集：重力恒 +y，supportY() 与 direction 无关。
 *    去程与回程共用同一份代码（D9 决策的最大收益：R4 的方向 bug 风险自动消失）。
 *
 * ⚠️ 铁律：积分必须显式乘 dt —— `v += a*dt; p += v*dt`。
 *    写成 per-frame 增量 `p += v` 会让 120Hz iPad 上跳跃高度翻倍（最难查的一类 bug）。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;

  /** 线性趋近（帧率无关）：按 rate*dt 逼近 target */
  function approach(cur, target, rate, dt) {
    var d = target - cur;
    var step = rate * dt;
    if (Math.abs(d) <= step) return target;
    return cur + (d > 0 ? step : -step);
  }

  /**
   * 求 s 处的支撑面 y（脚底 y）。
   * 规则：① 普通路面 = terrain 的 y；② lotus（荷叶）只在自身宽度内提供支撑；
   *      ③ 其余障碍（step/high/pumpkin...）顶部也可踩。
   * 传入 footY 是为了判断「从上方落下」还是「从下方经过」。
   */
  function supportY(seg, s, footY) {
    var base = seg.groundY;
    var best = base;
    var i, o, half, left, right;

    /* 荷叶/水洼这类落点平台：站在上面算支撑，掉下去 fall 判定交给 Game */
    for (i = 0; i < seg.obstacles.length; i++) {
      o = seg.obstacles[i];
      if (o.type !== 'lotus') continue;
      half = o.w / 2;
      if (s >= o.s - half && s <= o.s + half) {
        var top = base - 12;                 /* 荷叶顶面比路面高一点点，形成「跳上荷叶」 */
        if (footY <= top + 24) { best = top; break; }
      }
    }
    /* 高台 / 台阶顶面：踩上去 */
    for (i = 0; i < seg.obstacles.length; i++) {
      o = seg.obstacles[i];
      if (o.type !== 'step' && o.type !== 'high') continue;
      half = o.w / 2;
      left = o.s - half; right = o.s + half;
      if (s >= left && s <= right) {
        var otop = base - o.h;
        if (footY <= otop + 20) { best = Math.min(best, otop); break; }
      }
    }
    return best;
  }

  /** AABB 重叠（矩形 {x,y,w,h}，x/y 为左上角） */
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** 主角碰撞盒（比视觉小 20%，宽容判定）。s→x 由调用方按方向映射 */
  function duckBox(cx, footY) {
    return { x: cx - K.BOX_W / 2, y: footY - K.BOX_H, w: K.BOX_W, h: K.BOX_H };
  }

  /** 障碍碰撞盒（obstacle 的 s 是中心，y 是地面线） */
  function obsBox(o, groundY) {
    var h = o.h || 0;
    if (o.type === 'lotus' || o.type === 'puddle') {
      return { x: o.s - o.w / 2, y: groundY - 20, w: o.w, h: 20 };
    }
    return { x: o.s - o.w / 2, y: groundY - h, w: o.w, h: h };
  }

  /**
   * 固定步长积分。duck.s 是**进度坐标**（永远从左到右递增），
   * dir 只影响它映射到屏幕的位置，不影响物理。
   */
  function step(duck, seg, dt, input) {
    input = input || {};
    var cruise = seg.cruise || K.CRUISE;
    var autoRun = !!input.autoRun;
    var holding = !!input.holding;
    var target = 0;

    if (autoRun) {
      /* AUTO_RUN 模式：默认自动跑；按住 = 1.15× 加速（PRD §6.1 ②） */
      target = cruise * (holding ? K.AUTO_RUN_ACCEL : 1.0);
    } else {
      target = holding ? cruise : 0;
    }
    /* 冲刺带：boost.s0..s1 之间 ×1.35 */
    if (seg.boost && duck.s >= seg.boost.s0 && duck.s <= seg.boost.s1) {
      target = Math.max(target, cruise * seg.boost.mul);
    }

    var rate = (target > duck.vx ? cruise / K.ACCEL_TIME : cruise / K.DECEL_TIME);
    if (seg.boost && duck.s >= seg.boost.s0 && duck.s <= seg.boost.s1) rate *= seg.boost.mul;
    duck.vx = approach(duck.vx, target, rate, dt);

    /* 跳跃：抬手才判定，所以允许「先按住蓄力再抬手跳」。空中无效（防二段跳）。 */
    if (input.tapEdge && duck.grounded && duck.hitT <= 0) {
      duck.vy = (input.holdMs >= K.HOLD_MS_THRESHOLD) ? K.V0_HOLD : K.V0_TAP;
      duck.grounded = false;
      duck.jumpedThisStep = true;
    }

    /* 垂直积分：显式乘 dt */
    duck.vy += K.GRAVITY * dt;
    if (duck.vy > K.MAX_VY) duck.vy = K.MAX_VY;
    duck.y += duck.vy * dt;

    /* 水平：进度空间 */
    duck.s += duck.vx * dt;
    if (duck.s < 0) duck.s = 0;

    /* 支撑面 */
    var sy = supportY(seg, duck.s, duck.y);
    if (duck.y >= sy) {
      if (!duck.grounded) duck.landSquashT = 0.18;
      duck.y = sy;
      duck.vy = 0;
      duck.grounded = true;
    } else {
      duck.grounded = false;
    }
    return duck;
  }

  /** 碰撞弹开：固定 vx/vy（PRD §15），0.9s 后由 Game 强制归位 */
  function applyBump(duck, dirSign) {
    duck.vx = K.BUMP_VX * (dirSign >= 0 ? -1 : 1);
    duck.vy = K.BUMP_VY;
    duck.grounded = false;
  }

  /**
   * 找「最近安全 s」：落水 / 卡住后送回的位置。
   * 必须设搜索半径，否则落水后会横跨半个关卡瞬移。
   */
  function nearestSafeS(seg, s, radius) {
    var R = radius || 420;
    var i, o, half, d;
    function ok(x) {
      for (i = 0; i < seg.obstacles.length; i++) {
        o = seg.obstacles[i];
        half = o.w / 2 + K.BOX_W / 2 + 8;
        if (x > o.s - half && x < o.s + half) return false;
      }
      /* 荷叶/水洼本身是「落点」，落水时不能送回水洼中心 */
      for (i = 0; i < seg.obstacles.length; i++) {
        o = seg.obstacles[i];
        if (o.type !== 'lotus' && o.type !== 'puddle') continue;
        half = o.w / 2;
        if (x > o.s - half && x < o.s + half) return false;
      }
      return true;
    }
    if (ok(s)) return s;
    for (d = 16; d <= R; d += 16) {
      if (s - d >= 0 && ok(s - d)) return s - d;
      if (s + d <= seg.segLen && ok(s + d)) return s + d;
    }
    return Math.max(0, Math.min(seg.segLen, s));
  }

  global.Physics = {
    approach: approach,
    supportY: supportY,
    aabb: aabb,
    duckBox: duckBox,
    obsBox: obsBox,
    step: step,
    applyBump: applyBump,
    nearestSafeS: nearestSafeS
  };
})(window);
