/* ===== src/js/05-save.js · 存档层（5 层损坏回退） · 依赖 00-const ===== */
(function (global) {
  'use strict';

  var K = global.DUCK.SAVE_KEY;
  var VER = global.DUCK.SAVE_VERSION;

  /* ---------- 默认存档（唯一来源） ---------- */
  function defaultSave() {
    return {
      version: VER,
      progress: {
        unlocked: 1,
        cleared: {},                 /* {"1": {stars,timeMs,bumps,met}} */
        l5Checkpoint: null           /* null | {phase:'mid'|'inbound', segTimeMs, bumps, met} */
      },
      gallery: {
        sheep: false, cat: false, dog: false, pig: false,
        rabbit: false, goose: false, qiaoqiao: false, kelin: false
      },
      hygiene: { potty: false, wash: false, wipe: false, bag: false },
      settings: { music: true, sfx: true, rotTipShown: false },
      stats: {
        totalRuns: 0, totalBumps: 0,
        firstPlayAt: null, lastPlayAt: null,
        l5out: 0, l5back: 0, inboundStuck: 0, act1Skip: 0,
        stuckCount: 0, autoRun: 0,
        orientation: 'unknown'
      }
    };
  }

  var FRIENDS = global.DUCK.FRIENDS;
  var CLEARED_CLAMP = { stars: [0, 3], timeMs: [0, 3600000], bumps: [0, 9999] };

  /* ---------- 逐字段 sanitize：只接受类型匹配的字段，其余回默认 ---------- */
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function num(src, def, lo, hi) {
    if (typeof src !== 'number' || !isFinite(src)) return def;
    var v = src;
    if (lo !== undefined && v < lo) v = lo;
    if (hi !== undefined && v > hi) v = hi;
    return v;
  }

  function sanitizeCleared(src, def) {
    var out = {};
    if (!isPlainObject(src)) return out;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (!/^[1-5]$/.test(k)) continue;                    /* 只有 1..5 关 */
      var v = src[k];
      if (!isPlainObject(v)) continue;
      var met = [];
      if (Array.isArray(v.met)) {
        for (var i = 0; i < v.met.length; i++) {
          var id = v.met[i];
          if (typeof id === 'string' && FRIENDS.indexOf(id) >= 0) met.push(id);
        }
      }
      out[k] = {
        stars: num(v.stars, 0, CLEARED_CLAMP.stars[0], CLEARED_CLAMP.stars[1]),
        timeMs: num(v.timeMs, 0, CLEARED_CLAMP.timeMs[0], CLEARED_CLAMP.timeMs[1]),
        bumps: num(v.bumps, 0, CLEARED_CLAMP.bumps[0], CLEARED_CLAMP.bumps[1]),
        met: met
      };
    }
    return out;
  }

  function sanitizeCheckpoint(v) {
    if (!isPlainObject(v)) return null;
    if (v.phase !== 'mid' && v.phase !== 'inbound') return null;   /* D5：只有两态 */
    if (typeof v.segTimeMs !== 'number' || !isFinite(v.segTimeMs) || v.segTimeMs < 0) return null;
    var met = [];
    if (Array.isArray(v.met)) {
      for (var i = 0; i < v.met.length; i++) {
        if (typeof v.met[i] === 'string' && FRIENDS.indexOf(v.met[i]) >= 0) met.push(v.met[i]);
      }
    }
    return {
      phase: v.phase,
      segTimeMs: v.segTimeMs,
      bumps: num(v.bumps, 0, 0, CLEARED_CLAMP.bumps[1]),
      met: met
    };
  }

  /**
   * 深合并 sanitize。
   * 规则：src 有而 def 没有的键一律丢弃（防旧版/恶意数据渗入）。
   */
  function sanitize(src, def) {
    if (!isPlainObject(def)) return def;
    if (!isPlainObject(src)) return def;
    var out = {};
    for (var k in def) {
      if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
      var d = def[k], s = src[k];
      if (Array.isArray(d)) { out[k] = d.slice(); continue; }
      if (isPlainObject(d)) {
        /* 特殊结构 */
        if (k === 'cleared') { out[k] = sanitizeCleared(s, d); continue; }
        if (k === 'l5Checkpoint') { out[k] = sanitizeCheckpoint(s); continue; }
        out[k] = sanitize(s, d);
        continue;
      }
      if (d === null) { out[k] = (s === null) ? null : def[k]; continue; }
      if (typeof d === 'number') { out[k] = num(s, d, fieldClamp(k)[0], fieldClamp(k)[1]); continue; }
      if (typeof d === 'boolean') { out[k] = (typeof s === 'boolean') ? s : d; continue; }
      if (typeof d === 'string') {
        if (typeof s !== 'string') { out[k] = d; continue; }
        if (k === 'orientation') { out[k] = (s === 'portrait' || s === 'landscape') ? s : d; continue; }
        out[k] = s;
        continue;
      }
      out[k] = d;
    }
    return out;
  }

  /* number 字段的区间钳制表 */
  function fieldClamp(key) {
    switch (key) {
      case 'unlocked': return [1, 5];
      case 'segTimeMs': return [0, 3600000];
      case 'bumps': return [0, 9999];
      case 'totalRuns': case 'totalBumps': case 'l5out': case 'l5back':
      case 'inboundStuck': case 'act1Skip': case 'stuckCount': case 'autoRun':
        return [0, 999999];
      default: return [undefined, undefined];
    }
  }

  /* ---------- 5 层回退 ---------- */
  var data = defaultSave();

  /** 就地替换内容但**保持对象身份**（Save.data 是活引用，整体换对象会让所有调用方读到孤儿对象） */
  function replaceAll(target, src) {
    for (var k in target) {
      if (Object.prototype.hasOwnProperty.call(target, k)) delete target[k];
    }
    for (var j in src) {
      if (Object.prototype.hasOwnProperty.call(src, j)) target[j] = src[j];
    }
    return target;
  }

  function load() {
    var DEF = defaultSave();
    var raw = null;
    try { raw = global.localStorage.getItem(K); }        /* 第 1 层：隐私模式 */
    catch (e) { return replaceAll(data, DEF); }
    if (raw === null || raw === undefined) { return replaceAll(data, DEF); }

    var parsed = null;
    try { parsed = JSON.parse(raw); }                      /* 第 2 层：JSON 损坏 */
    catch (e) { return replaceAll(data, DEF); }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return replaceAll(data, DEF);                        /* 第 3 层：类型错 */
    }
    /* 版本超前：整体重置（宁可重置也不乱读） */
    if (typeof parsed.version === 'number' && parsed.version > VER) {
      return replaceAll(data, DEF);
    }

    /* 第 4 层：逐字段类型校验 + 深合并 */
    var base = sanitize(parsed, DEF);
    base.version = VER;
    return replaceAll(data, base);
  }

  function flush() {
    try { global.localStorage.setItem(K, JSON.stringify(data)); }
    catch (e) { /* 配额满 / Safari 隐私模式：静默失败，游戏继续 */ }
  }

  function reset() {
    replaceAll(data, defaultSave());
    flush();
    return data;
  }

  /** 统计打点：自动夹在合法区间并限制 key 长度 */
  function bumpStat(name, add) {
    var st = data.stats;
    if (!st) return;
    var n = (add === undefined) ? 1 : add;
    var v = st[name];
    if (typeof v !== 'number' || !isFinite(v)) v = 0;
    v += n;
    if (v < 0) v = 0;
    if (v > 999999) v = 999999;
    st[name] = Math.round(v);
  }

  function now() {
    try { return new Date().toISOString(); } catch (e) { return null; }
  }

  function markRun() {
    if (!data.stats.firstPlayAt) data.stats.firstPlayAt = now();
    data.stats.lastPlayAt = now();
    bumpStat('totalRuns', 1);
  }

  /** 读取原始字符串（QA 钩子用；存储不可用返回 null） */
  function saveRaw() {
    try { return global.localStorage.getItem(K); } catch (e) { return null; }
  }

  /** 写坏存档，模拟 QA 的破坏测试 */
  function corruptSave(kind) {
    try {
      if (kind === 'json') global.localStorage.setItem(K, '{{{');
      else if (kind === 'type') global.localStorage.setItem(K, '{"version":1,"progress":{"unlocked":"abc"}}');
      else if (kind === 'array') global.localStorage.setItem(K, '[]');
      else if (kind === 'null') global.localStorage.setItem(K, 'null');
      else if (kind === 'future') global.localStorage.setItem(K, '{"version":999}');
      else if (kind === 'met') global.localStorage.setItem(K, JSON.stringify({
        version: 1, progress: { cleared: { '1': { stars: 99, timeMs: 'x', bumps: -5, met: ['sheep', 'hacker'] } } }
      }));
      else return false;
    } catch (e) { return false; }
    return true;
  }

  global.Save = {
    data: data,
    load: load,
    flush: flush,
    reset: reset,
    sanitize: sanitize,
    defaultSave: defaultSave,
    bumpStat: bumpStat,
    markRun: markRun,
    saveRaw: saveRaw,
    corruptSave: corruptSave,
    /** l5Checkpoint 读写删（R1 / A8） */
    checkpoint: function (write) {
      if (write === undefined) return data.progress.l5Checkpoint;
      if (write === null) { data.progress.l5Checkpoint = null; flush(); return null; }
      data.progress.l5Checkpoint = sanitizeCheckpoint(write);
      flush();
      return data.progress.l5Checkpoint;
    }
  };
})(window);
