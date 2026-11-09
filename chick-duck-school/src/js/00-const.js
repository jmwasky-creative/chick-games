/* ===== src/js/00-const.js · 常量与设计 token 的 JS 侧镜像 · 无依赖 ===== */
(function (global) {
  'use strict';

  /* ============================================================
   * AUTO_RUN_FROM_LEVEL —— 手势难度开关（PRD §6.1 Q3 决策预留）
   * ============================================================
   * 含义：从第 N 关起，小鸭自动向前跑，玩家只需「点击 = 跳跃」。
   * 现状：设为 2，即「第 1 关用『按住跑 + 点击跳』做教学，第 2 关起可切成
   *       『默认自动跑 + 点击跳』的单手势模式」。
   * 为什么预留：5–6 岁孩子能否学会「按住跑」尚未真人验证。若盲测（验收 B4）
   *       显示学不会，把这个值改成 1（或在第 2 关开场自动切换）即可，
   *       无需改动任何其他逻辑。
   * 实现要求（本文件下方 autoRunActive() 是**唯一读取点**）：
   *       ① 该常量被实际读取于关卡初始化逻辑，不是死代码；
   *       ② 切换后「按住」手势降级为加速（1.15×）而非唯一前进方式；
   *       ③ 第 1 关无论如何都保持双手势（教学关必须教会「按住」）。
   * 验收 A16 的判定方式：改本常量 → 重建 → 第 2 关起自动前进、第 1 关仍双手势。
   * ============================================================ */
  var AUTO_RUN_FROM_LEVEL = 2;

  var DUCK = {
    /* ---- 逻辑分辨率 ---- */
    DESIGN_W: 960,
    DESIGN_H: 640,
    DESIGN_H_PORTRAIT: 900,      /* 竖屏视野更高 = 看得更远，不是拉窄 */

    /* ---- 网格 / 物理（PRD §6.2，全部帧率无关：v += a*dt; p += v*dt）---- */
    GRID: 64,
    GRAVITY: 2200,
    V0_TAP: -880,                 /* 峰高 ≈ 176px */
    V0_HOLD: -980,                /* 峰高 ≈ 218px，holdMs ≥ 180 触发 */
    HOLD_MS_THRESHOLD: 180,
    CRUISE: 265,
    CRUISE_INBOUND: 280,          /* 第 5 关回程（轻快归家） */
    BOOST_MUL: 1.35,
    BOOST_SPEED: 360,
    MAX_VY: 1400,
    ACCEL_TIME: 0.35,
    DECEL_TIME: 0.25,
    AUTO_RUN_ACCEL: 1.15,         /* AUTO_RUN 模式下「按住」= 1.15× 加速 */

    /* ---- 碰撞盒：比视觉小 20%，宽容判定（PRD §6.2）---- */
    BOX_W: 44,
    BOX_H: 52,

    /* ---- 固定步长物理 ---- */
    FIXED_DT: 1 / 120,
    MAX_STEPS: 6,

    /* ---- 相遇触发距离 1.5 格 ---- */
    MEET_DIST: 96,
    FOLLOW_OFFSET: 60,            /* 队伍侧后方 60px */

    /* ---- 水洼腾空豁免 ----
     * puddle 是 fall:true / solid:false / h:0 的「踩空即落水」判定块，本身没有高度可供站立。
     * 若只看水平位置 d.s 落在水洼范围内就判落水，那么跳到峰顶（离地 176px）也会被判落水 ——
     * 水洼就永远跳不过去，第 3 关直接无解。故：脚底离地 ≥ PUDDLE_CLEAR 视为腾空越过。
     * 24px = 小鸭脚离地一个小台阶的高度，起跳后第 2~3 个物理帧即可达到，手感上是「跳起来就过」。 */
    PUDDLE_CLEAR: 24,

    /* ---- 碰撞演出 ---- */
    HIT_TOTAL: 0.90,              /* 三段演出总时长，PRD §5.3 */
    HIT_STAGE1: 0.15,
    HIT_STAGE2: 0.55,
    BUMP_VX: 180,
    BUMP_VY: -420,
    BUMP_BACK: 40,                /* 复位到障碍前 40px（§5.3 ④） */

    /* ---- 卡关兜底 ---- */
    STUCK_SEC: 6,                 /* 同位置 6s 无前进 */
    ASSIST_SEC: 1.5,              /* 自动前进 1.5s */

    /* ---- 幕一 ---- */
    ACT1_TOTAL: 25.0,
    ACT1_FADE_MIN: 3.2,           /* 渐弱底线，不可压缩 */
    ACT1_SKIP_FADE: 300,          /* 跳过时呼噜 0.3s 淡出 */
    BREATH_PERIOD: 2.8,

    /* ---- 幕二 ---- */
    ACT2_TOTAL: 30.0,

    /* ---- 第 5 关 ---- */
    L5_GATE_TOLERANCE: 24,        /* T1/T3 的终点容差：一帧跨过不漏触发 */
    MID_EVENT_MS: 1200,
    TURN_MS: 500,                 /* 全体转身 180° */
    VICTORY_MS: 2500,             /* CLEAR → finale 前的胜利演出 */

    /* ---- 存档 ---- */
    SAVE_KEY: 'chick-duck-school:save:v1',
    SAVE_VERSION: 1,

    /* ---- 音频 ---- */
    MASTER: 0.5, SFX_BUS: 0.9, MUSIC_BUS: 0.9, SNORE_BUS: 0.9,
    SFX_THROTTLE_MS: 60,          /* 同名音效 60ms 内重复忽略 */
    MAX_VOICE: 3,                 /* ★ 同时发声的**音效**节点 ≤ 3（架构 §5.4 ②） */
    MUSIC_VOICE: 6,               /* BGM 预排音符独立配额：音乐节点必须另算，
                                     否则「同时发声≤3」会把前瞻排好的下一个音符 stop 掉，BGM 直接断 */
    MIR_RISE: 6,                  /* 呼噜增益镜像上升速率（/s，与真实 ramp 同一条曲线） */
    MIR_FADE: 0.3,                /* 跳过时呼噜线性淡出秒数（PRD §4：0.3 秒淡出到 0） */

    /* ---- 手势阈值（PRD §6.1）---- */
    TAP_MOVE_TOL: 12,
    TAP_TIME_TOL: 220,

    /* ---- 热区 ---- */
    HOT_MIN: 44,

    /* ---- 操作区划分（D10：操作区占下 62%，上方 38% 只响应显式按钮）---- */
    PLAY_ZONE_RATIO: 0.62,
    TOP_ZONE_RATIO: 0.38,

    /* ---- 8 位同学白名单（D6：图鉴做 8 位）---- */
    FRIENDS: ['sheep', 'qiaoqiao', 'kelin', 'cat', 'dog', 'pig', 'rabbit', 'goose'],

    /* ---- 配色 token 镜像（canvas 侧；与 style.css 一一对应）---- */
    C: {
      bg: '#FFFBEC', bgSoft: '#FFF6E0', chick: '#FFD35C', chickBr: '#F7C948',
      beak: '#FF9A3C', comb: '#E4453A', ink: '#4A3722', inkSoft: '#8A7250',
      duckBody: '#FFE9A8', duckLine: '#F7C948',
      skyOutA: '#DFF0FA', skyOutB: '#FFF3D0',
      skyInA: '#FFE9B8', skyInB: '#FFCF8A',
      shadow: 'rgba(74,55,34,.16)'
    },

    /* ---- 圆角三档的 canvas 等比值（960 基准）---- */
    R: { sm: 7, md: 9, lg: 11 },

    EASE: 'cubic-bezier(.22,.61,.36,1)',

    VERSION: '1.0.0',
    BUILD: 'duck-school'
  };

  /** 唯一读取点：判断「本关是否处于自动前进模式」。第 1 关永远双手势。 */
  DUCK.autoRunActive = function (levelIndex) {
    return levelIndex + 1 >= AUTO_RUN_FROM_LEVEL;
  };
  DUCK.AUTO_RUN_FROM_LEVEL = AUTO_RUN_FROM_LEVEL;

  /** 便捷：把秒格式化为 mm:ss */
  DUCK.fmtTime = function (ms) {
    var s = Math.max(0, Math.round(ms / 100) / 10);
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    return m + '分' + (r < 10 ? '0' : '') + r.toFixed(1) + '秒';
  };

  /* 8 位同学的固定站位顺序（结局列队用） */
  DUCK.LINEUP = ['sheep', 'qiaoqiao', 'kelin', 'cat', 'dog', 'pig', 'rabbit', 'goose'];

  global.DUCK = DUCK;
})(window);
