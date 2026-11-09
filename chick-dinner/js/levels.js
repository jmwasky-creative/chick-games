/* 《小鸡回家吃饭》关卡数据
 * 坐标系：x 向右，y 向下。地面 GROUND = 900（逻辑画布 750 x 1334）
 * 全部长度单位为像素，GRID = 64 为一格
 */
(function (global) {
  'use strict';

  var GRID = 64;
  var GROUND = 900;

  // 门：w/h 为门体尺寸，top/bottom 为门体上下沿 y（默认标准木门）
  function door(x, type, opt) {
    opt = opt || {};
    return {
      x: x,
      type: type || 'wood',      // wood | iron
      y: opt.y || GROUND,        // 门底部 y
      w: opt.w || 60,
      top: opt.top || (GROUND - 170),
      bottom: opt.bottom || (GROUND - 20),
      dual: !!opt.dual,          // 是否需要双光束同时命中
      hp: 0,                     // 累计照射时间
      broken: false
    };
  }

  var LEVELS = [
    /* ---------------- 第 1 关：回家吃饭（教学） ---------------- */
    {
      id: 1,
      name: '回家吃饭',
      subtitle: '肚子饿了，回家！',
      w: 2500,
      start: 180,
      devices: [{ x: 1000 }],
      fixedDevices: [],
      doors: [door(1700, 'wood')],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [],
      switches: [],
      partners: [],
      home: 2200,
      stars: [75, 110],
      intro: [
        '饭点到了，小鸡的肚子咕咕叫。',
        '「今天要回家吃饭！」'
      ],
      tips: [
        { x: 300, text: '点地面，走起来' },
        { x: 1000, text: '拿到电激光装置' },
        { x: 1500, text: '按住红色按钮发射激光' }
      ]
    },

    /* ---------------- 第 2 关：两道门（电量管理） ---------------- */
    {
      id: 2,
      name: '两道门',
      subtitle: '电不够，省着点用',
      w: 3100,
      start: 160,
      devices: [{ x: 700 }],
      fixedDevices: [],
      doors: [door(1300, 'wood'), door(2150, 'wood')],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [],
      switches: [],
      partners: [{ type: 'sparrow', x: 1750 }],
      home: 2800,
      stars: [105, 150],
      intro: ['小胖鸭又在捣乱，把两道门都关上了。']
    },

    /* ---------------- 第 3 关：镜子反射 ---------------- */
    {
      id: 3,
      name: '镜子反射',
      subtitle: '让光拐个弯',
      w: 2600,
      start: 160,
      devices: [{ x: 600 }],
      fixedDevices: [],
      doors: [door(1280, 'wood', { top: GROUND - 260, bottom: GROUND - 160 })],
      walls: [],
      platforms: [],
      mirrors: [
        { x: 1150, y: GROUND - 40, angle: '\\', size: 64 },   // 需玩家切成 /
        { x: 1150, y: GROUND - 200, angle: '/', size: 64 }
      ],
      ropes: [],
      switches: [],
      partners: [{ type: 'mouse', x: 1800 }],
      home: 2300,
      stars: [135, 180],
      intro: ['门太高了，激光够不着——用镜子把光抬上去。']
    },

    /* ---------------- 第 4 关：被卡住的伙伴 ---------------- */
    {
      id: 4,
      name: '被卡住的伙伴',
      subtitle: '先把它救下来',
      w: 3100,
      start: 160,
      devices: [{ x: 700 }],
      fixedDevices: [],
      doors: [door(2200, 'wood')],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [{ x: 1500, top: GROUND - 320, bottom: GROUND - 30 }],
      switches: [],
      partners: [{ type: 'sheep', x: 1500, hang: GROUND - 250 }],
      home: 2750,
      stars: [135, 180],
      intro: ['小羊被绳子吊住了，用细光束把绳子烧断。']
    },

    /* ---------------- 第 5 关：铁门与晚饭 ---------------- */
    {
      id: 5,
      name: '铁门与晚饭',
      subtitle: '铁门要全功率',
      w: 3100,
      start: 160,
      devices: [{ x: 700 }],
      fixedDevices: [],
      doors: [door(1850, 'iron')],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [],
      switches: [],
      partners: [{ type: 'dog', x: 2400 }],
      home: 2800,
      stars: [165, 210],
      intro: ['这次是铁门——激光要开到最大功率。']
    },

    /* ---------------- 第 6 关：高处的门 ---------------- */
    {
      id: 6,
      name: '高处的门',
      subtitle: '站高点才打得着',
      w: 3200,
      start: 160,
      devices: [{ x: 700 }],
      fixedDevices: [],
      doors: [door(2150, 'wood', { top: GROUND - 300, bottom: GROUND - 180 })],
      walls: [],
      platforms: [{ x: 1880, y: GROUND - 170, w: 240 }],
      mirrors: [],
      ropes: [],
      switches: [],
      partners: [{ type: 'cat', x: 1980, y: GROUND - 170 }],
      home: 2850,
      stars: [165, 210],
      intro: ['矮墙挡住了激光，站到石台上去。']
    },

    /* ---------------- 第 7 关：双装置 ---------------- */
    {
      id: 7,
      name: '双装置',
      subtitle: '两束光一起上',
      w: 3300,
      start: 160,
      devices: [{ x: 700 }],
      fixedDevices: [{ x: 1500, dir: 1, duration: 6 }],
      doors: [door(2050, 'wood', { dual: true })],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [],
      switches: [],
      partners: [{ type: 'pig', x: 2750 }],
      home: 3000,
      stars: [165, 210],
      intro: ['这道门要两束激光同时照才打得开。']
    },

    /* ---------------- 第 8 关：光路迷宫 ---------------- */
    {
      id: 8,
      name: '光路迷宫',
      subtitle: '把光一路引过去',
      w: 3000,
      start: 160,
      devices: [{ x: 600 }],
      fixedDevices: [],
      doors: [door(1600, 'wood', { top: GROUND - 280, bottom: GROUND - 180 })],
      walls: [],
      platforms: [],
      mirrors: [
        { x: 1200, y: GROUND - 40, angle: '\\', size: 64 },   // 应为 /
        { x: 1200, y: GROUND - 300, angle: '/', size: 64 },
        { x: 1600, y: GROUND - 300, angle: '/', size: 64 },   // 应为 \
        { x: 2200, y: GROUND - 40, angle: '/', size: 64 }     // 干扰镜
      ],
      ropes: [],
      switches: [],
      partners: [{ type: 'rabbit', x: 2300 }],
      home: 2700,
      stars: [195, 240],
      intro: ['三面镜子接力，把激光一路引到高处那道门。']
    },

    /* ---------------- 第 9 关：断电危机 ---------------- */
    {
      id: 9,
      name: '断电危机',
      subtitle: '先合闸，再充能',
      w: 3400,
      start: 160,
      devices: [{ x: 800 }],
      fixedDevices: [],
      doors: [door(1700, 'wood'), door(2500, 'wood')],
      walls: [],
      platforms: [],
      mirrors: [],
      ropes: [],
      switches: [{ x: 1100 }],
      partners: [{ type: 'goose', x: 2100 }],
      home: 3050,
      stars: [195, 240],
      intro: ['电路坏了，回充变慢——先去合上电闸。'],
      powerFail: true
    },

    /* ---------------- 第 10 关：全家吃饭（综合） ---------------- */
    {
      id: 10,
      name: '全家吃饭',
      subtitle: '叫上所有人，回家！',
      w: 3200,
      start: 160,
      devices: [{ x: 600 }],
      fixedDevices: [],
      doors: [door(1500, 'iron', { top: GROUND - 320, bottom: GROUND - 200 })],
      walls: [],
      platforms: [],
      mirrors: [
        { x: 1200, y: GROUND - 40, angle: '\\', size: 64 },   // 应为 /
        { x: 1200, y: GROUND - 300, angle: '/', size: 64 }
      ],
      ropes: [],
      switches: [],
      partners: [],
      home: 2300,
      stars: [225, 280],
      intro: ['最后一道大门。破了它，全家就能一起吃饭了。'],
      finale: true
    }
  ];

  // 伙伴图鉴
  var PARTNER_INFO = {
    sparrow: { name: '小麻雀', color: '#C98A4B', from: 2 },
    mouse:   { name: '田鼠',   color: '#9A8C7A', from: 3 },
    sheep:   { name: '小羊',   color: '#F2EDE4', from: 4 },
    dog:     { name: '小狗',   color: '#D9A05B', from: 5 },
    cat:     { name: '小猫',   color: '#8E8B96', from: 6 },
    pig:     { name: '小猪',   color: '#F0A7B4', from: 7 },
    rabbit:  { name: '小兔',   color: '#EFE6DA', from: 8 },
    goose:   { name: '小鹅',   color: '#F5F2E8', from: 9 }
  };

  global.GameData = {
    GRID: GRID,
    GROUND: GROUND,
    LEVELS: LEVELS,
    PARTNER_INFO: PARTNER_INFO
  };
})(window);
