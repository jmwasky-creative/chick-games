/* ===== src/js/80-ui.js · DOM 覆盖层：标题/关卡/设置/暂停/结算/图鉴/引导 · 依赖 00/05/10/60 =====
 * ⚠️ 面板隐藏 = display:none（完全不响应 pointer-events），避免「隐藏了还吃点击」。
 * ⚠️ 所有按钮 min-height ≥44px（硬约束 #4）。
 */
(function (global) {
  'use strict';

  var K = global.DUCK;
  var S = global.Save;
  var A = global.Audio;
  var G = global.Game;
  var L = global.Levels;

  function $(id) { return document.getElementById(id); }
  var screens = {
    title: 'screen-title', levels: 'screen-levels', l5ask: 'screen-l5ask',
    gallery: 'screen-gallery', settings: 'screen-settings',
    pause: 'screen-pause', result: 'screen-result', rot: 'screen-rot'
  };
  var current = 'title';

  function show(name) {
    for (var k in screens) {
      if (!Object.prototype.hasOwnProperty.call(screens, k)) continue;
      var el = $(screens[k]);
      if (el) el.classList.toggle('show', k === name);
    }
    current = name || '';
    if (name) A.play('ui_tap');
  }
  function hideAll() {
    for (var k in screens) {
      if (!Object.prototype.hasOwnProperty.call(screens, k)) continue;
      var el = $(screens[k]);
      if (el) el.classList.remove('show');
    }
    current = '';
  }

  /* ================= 标题 ================= */
  function showTitle() {
    renderGalleryQuick();
    show('title');
  }

  /* ================= 关卡选择 ================= */
  function showLevels() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    var unlocked = S.data.progress.unlocked;
    for (var i = 0; i < L.count; i++) {
      (function (i) {
        var lv = L.get(i);
        var id = i + 1;
        var locked = id > unlocked;
        var cell = document.createElement('div');
        cell.className = 'level-cell' + (locked ? ' locked' : '') + (lv.roundTrip ? ' round' : '');
        var stars = S.data.progress.cleared[String(id)];
        var st = stars ? stars.stars : 0;
        var stTxt = '';
        for (var k = 0; k < 3; k++) stTxt += '<span class="' + (k < st ? '' : 'off') + '">★</span>';
        cell.innerHTML =
          '<div class="lv-no">' + (locked ? '🔒' : id) + '</div>' +
          '<div class="lv-name">' + lv.name + '</div>' +
          '<div class="lv-stars">' + (locked ? '' : stTxt) + '</div>' +
          (S.data.progress.l5Checkpoint && id === 5 ? '<div class="lv-ck">可续</div>' : '');
        if (!locked) {
          cell.addEventListener('click', function () { onPickLevel(i); });
        }
        grid.appendChild(cell);
      })(i);
    }
    show('levels');
  }

  /** 第 5 关有 inbound checkpoint → 询问式复用，默认高亮「从头跑」（R1 / PRD §10.4） */
  function onPickLevel(i) {
    var id = i + 1;
    var ck = S.data.progress.l5Checkpoint;
    if (id === 5 && ck && ck.phase === 'inbound') {
      $('btn-l5-fresh').focus();
      pendingLevel = i;
      show('l5ask');
      return;
    }
    startLevel(i);
  }
  var pendingLevel = 4;

  function startLevel(i) {
    hideAll();
    G.resetResultFlag();
    if (G.state === 'paused') G.prevState = '';
    G.goto('act3');
    G.loadLevel(i);
  }

  function resumeInbound() {
    var ck = S.data.progress.l5Checkpoint;
    hideAll();
    G.resetResultFlag();
    G.goto('act3');
    G.loadLevel(4);
    /* 「继续回程」：用 inbound 段重建 + 恢复 segTimeMs/bumps/met（门槛可比，D11）。
       loadSegment 的 keepStats 传 true，绝不把去程已跑出来的时间与碰撞清零。 */
    G.subState = 'goBack';
    G.loadSegment('inbound', G.level, true);
    if (ck) {
      G.segTimeMs = ck.segTimeMs;
      G.bumps = ck.bumps;
      G.met = (ck.met || []).slice();
      for (var i = 0; i < G.met.length; i++) {
        if (!G.team.some(function (m) { return m.id === G.met[i]; })) {
          G.team.push({ id: G.met[i], lag: K.FOLLOW_OFFSET, joined: true, t: 0 });
        }
      }
    }
    S.checkpoint({ phase: 'inbound', segTimeMs: G.segTimeMs, bumps: G.bumps, met: G.met.slice() });
  }

  /* ================= 图鉴（8 位，D6） ================= */
  var GAL = [
    { id: 'sheep', n: '小羊', i: '🐑' }, { id: 'qiaoqiao', n: '巧巧', i: '🐰' },
    { id: 'kelin', n: '可林', i: '🐶' }, { id: 'cat', n: '小猫', i: '🐱' },
    { id: 'dog', n: '小狗', i: '🐕' }, { id: 'pig', n: '小猪', i: '🐷' },
    { id: 'rabbit', n: '小兔', i: '🐇' }, { id: 'goose', n: '小鹅', i: '🦢' }
  ];
  function renderGallery() {
    var grid = $('gallery-grid');
    grid.innerHTML = '';
    for (var i = 0; i < GAL.length; i++) {
      var on = !!S.data.gallery[GAL[i].id];
      var cell = document.createElement('div');
      cell.className = 'gal-cell' + (on ? '' : ' off');
      cell.innerHTML = '<div class="gal-ic">' + GAL[i].i + '</div><div class="gal-nm">' + GAL[i].n + '</div>';
      grid.appendChild(cell);
    }
  }
  function renderGalleryQuick() { /* 标题页图鉴入口按需渲染 */ }
  function showGallery() { renderGallery(); show('gallery'); }

  /* ================= 设置 + 家长统计 ================= */
  function showSettings() {
    renderStats();
    syncSwitches();
    show('settings');
  }
  function syncSwitches() {
    var m = $('btn-music'), s = $('btn-sfx');
    m.setAttribute('aria-checked', S.data.settings.music ? 'true' : 'false');
    s.setAttribute('aria-checked', S.data.settings.sfx ? 'true' : 'false');
  }
  function renderStats() {
    var d = S.data, st = d.stats;
    var rows = '';
    var i, k, lv, c;
    rows += row('总游玩次数', st.totalRuns);
    rows += row('总碰撞次数', st.totalBumps);
    rows += row('卡关次数', st.stuckCount);
    rows += row('辅助前进次数', st.autoRun);
    rows += row('幕一跳过次数', st.act1Skip);
    rows += row('第5关去程完成', st.l5out);
    rows += row('第5关回程完成', st.l5back);
    rows += row('回程方向困惑', st.inboundStuck);
    var gal = 0;
    for (k in d.gallery) { if (d.gallery[k]) gal++; }
    rows += row('图鉴收集', gal + ' / 8');
    rows += '<div class="srow"><span>竖屏占比标记</span><b>' + (st.orientation === 'portrait' ? '竖屏' : '横屏') + '</b></div>';
    for (i = 0; i < L.count; i++) {
      lv = L.get(i); c = d.progress.cleared[String(i + 1)];
      if (!c) continue;
      rows += row('第' + (i + 1) + '关最好', '★' + c.stars + ' · ' + K.fmtTime(c.timeMs));
    }
    $('stats-box').innerHTML = '<h3>给家长看的统计</h3>' + rows;
  }
  function row(k, v) {
    return '<div class="srow"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  function toggleMusic() {
    S.data.settings.music = !S.data.settings.music;
    A.setMusicEnabled(S.data.settings.music);
    S.flush();
    syncSwitches();
  }
  function toggleSfx() {
    S.data.settings.sfx = !S.data.settings.sfx;
    A.setSfxEnabled(S.data.settings.sfx);
    S.flush();
    syncSwitches();
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  /** 复制统计数据（JSON）：clipboard 失败降级为「选中文本手动复制」，不报错 */
  function copyStats() {
    var json = JSON.stringify(S.data);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = json;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? '已复制统计 JSON' : '请长按选中文本手动复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { toast('已复制统计 JSON'); }, fallback);
    } else fallback();
  }

  function resetSave() {
    S.reset();
    A.setMusicEnabled(true); A.setSfxEnabled(true);
    toast('存档已清空');
    showTitle();
  }

  /* ================= 暂停 ================= */
  function showPause() {
    if (G.state === 'paused') return;
    G.prevState = G.state;
    G.state = 'paused';
    A.play('ui_pause');
    A.stopMusic(300);
    show('pause');
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    hideAll();
    G.state = G.prevState || 'act3';
    A.play('ui_back');
    /* 恢复 BGM */
    if (G.level) {
      var bgm = G.level.roundTrip ? G.level.bgm[G.segName] : G.level.bgm;
      A.music(bgm, { fadeMs: 400 });
    }
    /* 恢复主循环时间基准（暂停期间 last 被钳制，回来不补一大段物理帧） */
    if (global.__duck && global.__duck.resumeLoop) global.__duck.resumeLoop();
  }
  function quitToMenu() {
    G.state = 'title';
    G.prevState = '';
    A.stopMusic(400);
    showTitle();
  }

  /* ================= 结算 ================= */
  function showResult(r) {
    var stars = $('res-stars').children;
    for (var i = 0; i < 3; i++) stars[i].classList.remove('on');
    $('res-ttl').textContent = r.isFinale ? '大家一起回家啦！' : '过关啦！';

    var rows = '';
    rows += rrow('用时', K.fmtTime(r.timeMs));
    rows += rrow('碰撞', r.bumps + ' 次（上限 ' + r.bumpCap + '，不扣星）');
    rows += rrow('遇到同学', r.met.length + ' / ' + r.metTotal + ' 位');
    if (r.isFinale) rows += rrow('队伍', r.teamCount + ' 位一起回家');
    $('res-rows').innerHTML = rows;

    /* 三星是两个条件同时满足（用时 + 碰撞），这里明说缺哪个 */
    var extra = '';
    if (r.stars < 3) {
      extra = '三星：' + r.need3 + '，再试一次就能拿满 ★★★';
    } else if (r.met.length < r.metTotal) {
      extra = '三颗星到手啦！再跑一次看看还有谁没遇到～';
    } else {
      extra = '完美通关！★ ×3 而且 8 位同学全遇到了';
    }
    $('res-extra').textContent = extra;

    /* 按钮编排 */
    var isLast = r.levelId >= L.count;
    $('btn-next').style.display = isLast ? 'none' : '';
    $('btn-next').textContent = isLast ? '完成' : '下一关';
    show('result');

    /* 星星逐颗点亮，每颗一颗音效 */
    for (var k = 0; k < r.stars; k++) {
      (function (k) {
        setTimeout(function () {
          var el = $('res-stars').children[k];
          if (el) el.classList.add('on');
          A.play('star_ding', { i: k });
        }, 320 + k * 340);
      })(k);
    }
  }
  function rrow(k, v) {
    return '<div class="rrow"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  function nextLevel() {
    var i = G.levelIndex;
    if (i + 1 >= L.count) { quitToMenu(); return; }
    startLevel(i + 1);
  }
  function retryLevel() { startLevel(G.levelIndex); }
  function home() { quitToMenu(); }

  /* ================= 竖屏引导（一次性，存档记录） ================= */
  function maybeShowRotTip() {
    if (S.data.settings.rotTipShown) return;
    var portrait = window.innerHeight > window.innerWidth;
    S.data.stats.orientation = portrait ? 'portrait' : 'landscape';
    if (portrait) {
      S.data.settings.rotTipShown = true;
      S.flush();
      show('rot');
    }
  }

  /* ================= 绑定 ================= */
  function init() {
    $('btn-start').addEventListener('click', function () {
      A.unlock();
      hideAll();
      G.goto('act1');
      global.Story.play('act1');
    });
    $('btn-levels').addEventListener('click', function () { A.unlock(); showLevels(); });
    $('btn-gallery').addEventListener('click', function () { A.unlock(); showGallery(); });
    $('btn-settings').addEventListener('click', function () { A.unlock(); showSettings(); });
    $('btn-lv-back').addEventListener('click', function () { A.play('ui_back'); showTitle(); });
    $('btn-gl-back').addEventListener('click', function () { A.play('ui_back'); showTitle(); });
    $('btn-set-back').addEventListener('click', function () { A.play('ui_back'); showTitle(); });
    $('btn-l5-fresh').addEventListener('click', function () { startLevel(4); });
    $('btn-l5-resume').addEventListener('click', function () { resumeInbound(); });
    $('btn-l5-cancel').addEventListener('click', function () { A.play('ui_back'); showLevels(); });
    $('btn-music').addEventListener('click', toggleMusic);
    $('btn-sfx').addEventListener('click', toggleSfx);
    $('btn-copy-stats').addEventListener('click', copyStats);
    $('btn-reset-save').addEventListener('click', resetSave);
    $('btn-resume').addEventListener('click', resumeGame);
    $('btn-retry').addEventListener('click', function () { A.play('ui_back'); retryLevel(); });
    $('btn-quit').addEventListener('click', function () { A.play('ui_back'); quitToMenu(); });
    $('btn-next').addEventListener('click', function () { A.play('ui_back'); nextLevel(); });
    $('btn-again').addEventListener('click', function () { A.play('ui_back'); retryLevel(); });
    $('btn-home').addEventListener('click', function () { A.play('ui_back'); home(); });
    $('btn-rot-close').addEventListener('click', function () { A.play('ui_back'); showTitle(); });

    /* 记录朝向 */
    window.addEventListener('resize', function () {
      S.data.stats.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    });
  }

  global.UI = {
    init: init,
    showTitle: showTitle,
    showLevels: showLevels,
    showSettings: showSettings,
    showGallery: showGallery,
    showPause: showPause,
    resumeGame: resumeGame,
    quitToMenu: quitToMenu,
    showResult: showResult,
    hideStory: hideAll,
    hideAll: hideAll,
    startLevel: startLevel,
    nextLevel: nextLevel,
    toast: toast,
    maybeShowRotTip: maybeShowRotTip,
    currentScreen: function () { return current; },
    renderStats: renderStats
  };
})(window);
