/* 界面、存档与流程控制 */
(function (global) {
  'use strict';

  var SAVE_KEY = 'chick_dinner_save_v1';

  var Save = {
    data: { unlocked: 1, stars: {}, partners: {}, duck: false, sound: true },
    load: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          for (var k in o) if (o.hasOwnProperty(k)) this.data[k] = o[k];
        }
      } catch (e) {}
      return this.data;
    },
    save: function () {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    reset: function () {
      this.data = { unlocked: 1, stars: {}, partners: {}, duck: false, sound: this.data.sound };
      this.save();
    }
  };

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['screen-menu', 'screen-levels', 'screen-result', 'screen-codex', 'screen-intro', 'screen-pause'].forEach(function (s) {
      $(s).classList.add('hidden');
    });
    if (id) $(id).classList.remove('hidden');
  }

  var UI = {
    Save: Save,
    current: 0,

    init: function () {
      Save.load();
      this.buildMenu();
      this.buildLevels();
      this.buildCodex();
      show('screen-menu');
    },

    buildMenu: function () {
      var total = Object.keys(Save.data.partners).filter(function (k) { return Save.data.partners[k]; }).length;
      $('menu-progress').textContent = '已通关 ' + Object.keys(Save.data.stars).length + ' 关 · 伙伴 ' + total + '/8';
    },

    buildLevels: function () {
      var wrap = $('level-list');
      wrap.innerHTML = '';
      var self = this;
      global.GameData.LEVELS.forEach(function (L, i) {
        var unlocked = (i + 1) <= Save.data.unlocked;
        var st = Save.data.stars[L.id] || 0;
        var el = document.createElement('div');
        el.className = 'lv' + (unlocked ? '' : ' lock');
        el.innerHTML =
          '<div class="lv-no">' + L.id + '</div>' +
          '<div class="lv-main"><div class="lv-name">' + L.name + '</div>' +
          '<div class="lv-sub">' + (unlocked ? L.subtitle : '未解锁') + '</div></div>' +
          '<div class="lv-stars">' + starStr(st) + '</div>';
        if (unlocked) el.onclick = function () { self.startLevel(i); };
        wrap.appendChild(el);
      });
    },

    buildCodex: function () {
      var wrap = $('codex-list');
      wrap.innerHTML = '';
      var info = global.GameData.PARTNER_INFO;
      Object.keys(info).forEach(function (key) {
        var got = !!Save.data.partners[key];
        var el = document.createElement('div');
        el.className = 'cx' + (got ? '' : ' lock');
        var cv = document.createElement('canvas');
        cv.width = 130; cv.height = 130;
        var c = cv.getContext('2d');
        c.save(); c.translate(65, 108);
        if (!got) c.globalAlpha = 0.25;
        global.Render.drawCritterByName(c, key, 0, 0, 0, false, 1);
        c.restore();
        if (!got) {
          c.globalAlpha = 1;
          c.fillStyle = '#9A8C7A'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center';
          c.fillText('?', 65, 90);
        }
        el.appendChild(cv);
        var nm = document.createElement('div');
        nm.className = 'cx-name';
        nm.textContent = got ? info[key].name : '？？？';
        el.appendChild(nm);
        wrap.appendChild(el);
      });
      // 小胖鸭
      var dEl = document.createElement('div');
      dEl.className = 'cx' + (Save.data.duck ? '' : ' lock');
      var cv2 = document.createElement('canvas');
      cv2.width = 130; cv2.height = 130;
      var c2 = cv2.getContext('2d');
      c2.save(); c2.translate(65, 108);
      if (!Save.data.duck) c2.globalAlpha = 0.25;
      global.Render.drawCritterByName(c2, 'duck', 0, 0, 0, false, 1);
      c2.restore();
      dEl.appendChild(cv2);
      var nm2 = document.createElement('div');
      nm2.className = 'cx-name';
      nm2.textContent = Save.data.duck ? '小胖鸭（已入席）' : '？？？（捣蛋鬼）';
      dEl.appendChild(nm2);
      wrap.appendChild(dEl);
    },

    startLevel: function (i) {
      this.current = i;
      var L = global.GameData.LEVELS[i];
      show('screen-intro');
      $('intro-title').textContent = '第 ' + L.id + ' 关 · ' + L.name;
      $('intro-text').innerHTML = L.intro.map(function (s) { return '<p>' + s + '</p>'; }).join('');
      var self = this;
      $('btn-intro-go').onclick = function () {
        show(null);
        $('hud').classList.remove('hidden');
        self.launch(i);
      };
      $('btn-intro-back').onclick = function () { self.showLevels(); };
    },

    launch: function (i) {
      var self = this;
      var G = global.Game;
      G.load(i);
      G.onClear = function (res) { self.showResult(res); };
      G.onHud = function () { self.updateHud(); };
      $('hud-level').textContent = '第 ' + G.level.id + ' 关 · ' + G.level.name;
      $('hud').classList.remove('hidden');
      G.start();
    },

    updateHud: function () {
      var G = global.Game;
      $('energy-fill').style.width = (G.energy) + '%';
      $('energy-fill').style.background = G.energy < 25 ? '#E4453A' : (G.energy < 55 ? '#F5A623' : '#7FC96A');
      $('hud-team').textContent = '×' + G.team.length;
      $('hud-time').textContent = G.time.toFixed(1) + 's';
      var el = $('energy-fill');
      el.style.width = (G.energy) + '%';
      el.style.background = G.energy < 25 ? '#E4453A' : (G.energy < 55 ? '#F5A623' : '#7FC96A');
      el.classList.toggle('low', G.lowFlash > 0);
      var pw = G.power;
      $('fire-btn').className = 'fire-btn p' + pw;
      $('fire-btn').textContent = pw === 0 ? '按住发射' : (pw === 1 ? '一档' : (pw === 2 ? '二档' : '三档 全功率'));
    },

    showResult: function (res) {
      var self = this;
      var G = global.Game;
      var L = res.level;
      // 存档
      var s = Save.data;
      s.stars[L.id] = Math.max(s.stars[L.id] || 0, res.stars);
      if (L.id + 1 > s.unlocked && L.id < 10) s.unlocked = L.id + 1;
      G.team.forEach(function (p) { s.partners[p.type] = true; });
      Save.save();

      show('screen-result');
      $('hud').classList.add('hidden');
      $('result-title').textContent = L.finale ? '团圆饭！' : '回到家啦！';
      $('result-stars').innerHTML = '';
      for (var i = 0; i < 3; i++) {
        var sp = document.createElement('span');
        sp.className = 'rst-star';
        sp.textContent = '★';
        sp.style.opacity = '0';
        $('result-stars').appendChild(sp);
        if (i < res.stars) {
          (function (idx) {
            setTimeout(function () {
              sp.style.opacity = '1';
              sp.style.transform = 'scale(1.25)';
              setTimeout(function () { sp.style.transform = 'scale(1)'; }, 180);
              if (global.SFX) global.SFX.star(idx);
            }, 240 + idx * 240);
          })(i);
        }
      }
      var miss = [];
      if (res.time > L.stars[0]) miss.push('再快 ' + (res.time - L.stars[0]).toFixed(1) + ' 秒');
      var un = L.partners.filter(function (p) { return !p.invited; }).length;
      if (un > 0) miss.push('还有 ' + un + ' 位伙伴没叫上');
      if (res.usedHint) miss.push('别用提示');
      $('result-info').innerHTML =
        '<div>用时 <b>' + res.time.toFixed(1) + 's</b>　三星线 ' + L.stars[0] + 's</div>' +
        '<div>本关伙伴 <b>' + res.partners + '/' + L.partners.length + '</b></div>' +
        '<div class="miss">' + (res.stars >= 3 ? '完美通关！' : '距三星：' + miss.join('、')) + '</div>';

      // 结局分支（第 10 关）
      var finaleBox = $('result-finale');
      if (L.finale) {
        finaleBox.classList.remove('hidden');
        var invited = Object.keys(Save.data.partners).filter(function (k) { return Save.data.partners[k]; }).length;
        $('finale-text').textContent = '你叫来了 ' + invited + ' 位小伙伴。门外，小胖鸭探头探脑……';
        $('btn-duck-yes').onclick = function () {
          Save.data.duck = true; Save.save();
          $('finale-text').textContent = '「也一起吃吧！」——一桌子人，热热闹闹。';
          finaleBox.classList.add('done');
          if (global.SFX) global.SFX.cheer();
        };
        $('btn-duck-no').onclick = function () {
          $('finale-text').textContent = '小胖鸭在窗外看了一会儿，摇摇摆摆走了。';
          finaleBox.classList.add('done');
        };
      } else {
        finaleBox.classList.add('hidden');
        finaleBox.classList.remove('done');
      }

      $('btn-next').classList.toggle('hidden', L.id >= 10);
      $('btn-next').onclick = function () {
        if (L.id < 10) self.startLevel(self.current + 1);
      };
      $('btn-retry').onclick = function () { self.startLevel(self.current); };
      $('btn-menu').onclick = function () { self.showMenu(); };
    },

    showMenu: function () {
      global.Game.stop();
      $('hud').classList.add('hidden');
      this.buildMenu(); this.buildLevels(); this.buildCodex();
      show('screen-menu');
    },

    showLevels: function () {
      global.Game.stop();
      $('hud').classList.add('hidden');
      this.buildLevels();
      show('screen-levels');
    },

    showCodex: function () {
      this.buildCodex();
      show('screen-codex');
    },

    pauseGame: function () {
      var G = global.Game;
      if (G.state !== 'play') return;
      G.setFiring(false);
      G.pause();
      if (global.SFX) global.SFX.laserStop();
      show('screen-pause');
    },

    resumeGame: function () {
      global.Game.resume();
      show(null);
      $('hud').classList.remove('hidden');
    },

    quitToMenu: function () {
      global.Game.stop();
      global.Game.paused = false;
      global.SFX.laserStop();
      $('hud').classList.add('hidden');
      this.showMenu();
    }
  };

  function starStr(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += (i < n ? '★' : '☆');
    return s;
  }

  global.UI = UI;
  global.UI.$ = $;
  global.UI.show = show;
})(window);
