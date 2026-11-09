/* ===== src/js/30-levels.js · 5 关数据（改关只动这个文件） · 依赖无 =====
 * 设计原则：5 关共用同一套运行逻辑，关卡文件里**只有数据，没有分支**。
 *
 * ⚠️ 第 5 关的 outbound / inbound **两段数据必须完全独立书写**。
 *    严禁 JSON.parse(JSON.stringify(outbound)) 浅拷贝后改几个数字——那正是 PRD §12.2 R4
 *    描述的失败模式（回程会又长又难，最难的部分被放到最后）。
 */
(function (global) {
  'use strict';

  /* 第 1–4 关：统一 schema
   * stars    = [3星秒数, 2星秒数]（PRD §10.3）
   * threeBumps = 三星的碰撞上限（4/5/6/7；第 5 关 12）—— 三个星都要**同时**满足才算三星
   * bumpCap  = 碰撞统计上限（12/14/16/18/26），超出**不扣星**，只进家长统计 */
  var LEVELS = [
    /* ---------- 第 1 关 · 跳一跳，跳上学 ---------- */
    {
      id: 1,
      name: '跳一跳，跳上学',
      stars: [30, 42],
      threeBumps: 4,
      bumpCap: 12,
      cruise: 265,
      segLen: 2400,
      exitX: 2400,
      scene: 'village_start',
      bgm: 'schoolMarch',
      terrain: [{ s: 0, len: 2400, y: 520, kind: 'road' }],
      obstacles: [
        { s: 700, type: 'step', w: 96, h: 32, solid: true },
        { s: 1080, type: 'step', w: 96, h: 32, solid: true },
        { s: 1460, type: 'step', w: 96, h: 32, solid: true }
      ],
      movers: [],
      actors: [
        { id: 'sheep', s: 1440, action: 'jumpWait', lines: ['早安，小鸭！', '上学去呀？'], follow: 'lead' }
      ],
      tutorial: {
        steps: [
          { kind: 'holdDemo', sFrom: 180, sTo: 640, durMs: 2000 },
          { kind: 'tapDemo', sFrom: 640, sTo: 980, durMs: 2000, times: 2 }
        ]
      }
    },

    /* ---------- 第 2 关 · 跑起来，上学要迟到了 ---------- */
    {
      id: 2,
      name: '跑起来，上学要迟到了',
      stars: [42, 56],
      threeBumps: 5,
      bumpCap: 14,
      cruise: 265,
      segLen: 3200,
      exitX: 3200,
      scene: 'wheat_road',
      bgm: 'schoolMarch',
      terrain: [{ s: 0, len: 3200, y: 520, kind: 'dirt' }],
      obstacles: [],               /* 南瓜在 movers 里（移动障碍） */
      movers: [
        { s: 760, type: 'pumpkin', w: 56, h: 56, speed: 90 },
        { s: 1220, type: 'pumpkin', w: 56, h: 56, speed: 90 },
        { s: 1660, type: 'pumpkin', w: 56, h: 56, speed: 90 },
        { s: 2120, type: 'pumpkin', w: 56, h: 56, speed: 90 },
        { s: 2600, type: 'pumpkin', w: 56, h: 56, speed: 90 }
      ],
      actors: [
        { id: 'qiaoqiao', s: 600, action: 'jumpWait', lines: ['小鸭，等等我！', '我们一起跑！'], follow: 'lead' }
      ],
      tutorial: { steps: [{ kind: 'holdDemo', sFrom: 120, sTo: 560, durMs: 1800 }] }
    },

    /* ---------- 第 3 关 · 一二一，一二三，跳！ ---------- */
    {
      id: 3,
      name: '一二一，一二三，跳！',
      stars: [40, 55],
      threeBumps: 6,
      bumpCap: 16,
      cruise: 265,
      segLen: 3600,
      exitX: 3600,
      scene: 'mud_puddles',
      bgm: 'schoolMarch',
      terrain: [{ s: 0, len: 3600, y: 520, kind: 'mud' }],
      obstacles: [
        { s: 900, type: 'puddle', w: 96, h: 0, solid: false, fall: true },
        { s: 1160, type: 'puddle', w: 96, h: 0, solid: false, fall: true },
        { s: 1420, type: 'high', w: 96, h: 24, solid: true },
        { s: 1680, type: 'puddle', w: 96, h: 0, solid: false, fall: true },
        { s: 1940, type: 'puddle', w: 96, h: 0, solid: false, fall: true }
      ],
      movers: [],
      actors: [
        { id: 'cat', s: 1300, action: 'countBeat', lines: ['一', '二', '三', '跳！'], follow: 'lead', wall: true }
      ],
      tutorial: { steps: [{ kind: 'tapDemo', sFrom: 700, sTo: 1000, durMs: 1800, times: 2 }] }
    },

    /* ---------- 第 4 关 · 荷叶小路，跳着跑 ---------- */
    {
      id: 4,
      name: '荷叶小路，跳着跑',
      stars: [48, 64],
      threeBumps: 7,
      bumpCap: 18,
      cruise: 265,
      segLen: 4000,
      exitX: 4000,
      scene: 'lotus_pond',
      bgm: 'schoolMarch',
      terrain: [{ s: 0, len: 4000, y: 500, kind: 'water' }],
      obstacles: [
        /* solid:false + fall:true = 踩空落水，0.9s 后送回上一张荷叶 */
        { s: 900, type: 'lotus', w: 160, h: 0, solid: false, fall: true },
        { s: 1110, type: 'lotus', w: 128, h: 0, solid: false, fall: true },
        { s: 1320, type: 'lotus', w: 112, h: 0, solid: false, fall: true }
      ],
      movers: [],
      actors: [
        { id: 'kelin', s: 1650, action: 'point', lines: ['小鸭，快跳过来！', '我们一起上学！'], follow: 'lead' }
      ],
      tutorial: { steps: [{ kind: 'tapDemo', sFrom: 640, sTo: 980, durMs: 2000, times: 2 }] }
    },

    /* ---------- 第 5 关 · 跑到学校，再跑回家！（往返赛制） ---------- */
    {
      id: 5,
      name: '跑到学校，再跑回家！',
      stars: [95, 125],            /* 去程 + 回程合计 */
      threeBumps: 12,            /* 三个星都要满足：≤95s 且 碰撞≤12 次 */
      bumpCap: 26,
      roundTrip: true,
      cruise: 265,
      scene: 'school_road',
      bgm: 'schoolRun',

      /* 起点集合点：去程出生点 & 回程胜利点 */
      origin: { s: 60, y: 520, flag: true },

      /* —— 去程（起点 → 校门）：4800px，8 障碍 + 800px 冲刺带 —— */
      /* ⚠️ 勿从 inbound 反向拷贝。两段独立书写。
       *    间距 340–360（PRD §5.2.2 冲刺带后集中 4 个 + 间隔 320–400），
       *    最后 600px（s ≥ 4200）完全无障碍，给干净的抵达体验。 */
      outbound: {
        dir: 1,
        segLen: 4800,
        cruise: 265,
        sky: 'morning_cool',
        arrows: 'right',
        groundY: 520,
        scene: 'school_road',
        safeTail: 600,
        boost: { s0: 2200, s1: 3000, mul: 1.35 },
        terrain: [{ s: 0, len: 4800, y: 520, kind: 'road' }],
        obstacles: [
          { s: 420, type: 'pumpkin', w: 56, h: 56, solid: true },
          { s: 780, type: 'step', w: 96, h: 32, solid: true },
          { s: 1140, type: 'hobby_horse', w: 68, h: 56, solid: true },
          { s: 1500, type: 'pumpkin', w: 56, h: 56, solid: true },
          { s: 1860, type: 'pinwheel', w: 56, h: 64, solid: true },
          /* —— 冲刺带 2200–3000 区段内不放障碍（让孩子先体验加速）—— */
          { s: 3200, type: 'pumpkin', w: 56, h: 56, solid: true },
          { s: 3540, type: 'hobby_horse', w: 68, h: 56, solid: true },
          { s: 3880, type: 'step', w: 96, h: 32, solid: true }
          /* 间距 360 / 360 / 360 / 360 / 320 / 340 / 340 —— 全部落在 320–400；
             最后一个 s=3880，距 4800 还有 920px，远超「最后 600px 无障碍」的要求。 */
        ],
        movers: [],
        /* 校门口 4 位同学排成一排挥手（s 均在最后 600px 的无障碍区内） */
        actors: [
          { id: 'dog', s: 4620, action: 'wave', lines: ['小鸭，这边！'], follow: 'gate' },
          { id: 'pig', s: 4560, action: 'wave', lines: ['快点快点！'], follow: 'gate' },
          { id: 'rabbit', s: 4500, action: 'wave', lines: ['我们等你啦！'], follow: 'gate' },
          { id: 'goose', s: 4440, action: 'wave', lines: ['上学咯——'], follow: 'gate' }
        ]
      },

      /* —— 回程（校门 → 起点）：3000px（D7 从 3600 压到 3000），5 障碍间距 420–560 —— */
      /* ⚠️ 独立书写：障碍 5 个、间距 420–560、无冲刺带、跑速 280、最后 500px 无障碍 */
      inbound: {
        dir: -1,
        segLen: 3000,
        cruise: 280,
        sky: 'noon_warm',
        arrows: 'left',            /* ★ R2 最高优先级：地面箭头全部朝左 */
        groundY: 520,
        scene: 'school_road_in',
        safeTail: 500,
        boost: null,                /* ★ R4：取消冲刺带 */
        terrain: [{ s: 0, len: 3000, y: 520, kind: 'roadIn' }],
        obstacles: [
          { s: 480, type: 'pinwheel', w: 56, h: 64, solid: true },
          { s: 980, type: 'pumpkin', w: 56, h: 56, solid: true },
          { s: 1480, type: 'step', w: 96, h: 32, solid: true },
          { s: 1960, type: 'hobby_horse', w: 68, h: 56, solid: true },
          { s: 2440, type: 'pumpkin', w: 56, h: 56, solid: true }
          /* 间距 500 / 500 / 480 / 480 —— 全部落在 420–560；
             最后一个 s=2440 < 2500，即 2500–3000 这最后 500px 完全无障碍（§5.2.4）。 */
        ],
        movers: [],
        actors: [
          { id: 'sheep', s: 1400, action: 'join', lines: ['我们也回家啦！'], follow: 'team' },
          { id: 'cat', s: 2100, action: 'join', lines: ['等等我们！'], follow: 'team' }
        ]
      },

      /* —— 中途事件：1.2s，绝不弹结算面板 —— */
      midEvent: {
        durMs: 1200,
        lines: [
          { id: 'kelin', text: '再跑回来呀！' },
          { id: 'qiaoqiao', text: '我们一起回家！' },
          { id: 'dog', text: '等你哦！' }
        ],
        turnMs: 500,
        confetti: 'small'
      },

      bgm: { outbound: 'schoolRun', inbound: 'homeWalk', crossfadeMs: 500 }
    }
  ];

  global.Levels = {
    LEVELS: LEVELS,
    /** 取第 i 关（0 起） */
    get: function (i) { return LEVELS[i] || null; },
    count: LEVELS.length
  };
})(window);
