// === Dad's Daily Tracker - App Logic ===

(function () {
  'use strict';

  // --- Utility ---
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatTime(isoStr) {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function formatDuration(minutes) {
    if (minutes < 60) return Math.round(minutes) + ' min';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(function () {
      el.classList.remove('show');
    }, 2000);
  }

  // --- Date Header ---
  function updateDateHeader() {
    document.getElementById('header-date').textContent = formatDate(todayKey());
  }

  // --- Tab Navigation ---
  function initTabs() {
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(function (s) {
          s.classList.remove('active');
        });
        document.getElementById('tab-' + target).classList.add('active');
        if (target === 'history') refreshHistory();
      });
    });
  }

  // =====================
  //  MEALS
  // =====================
  function getMeals(dateKey) {
    return load('tracker-meals-' + dateKey) || [];
  }

  function saveMeals(dateKey, meals) {
    save('tracker-meals-' + dateKey, meals);
  }

  function renderMeals() {
    var meals = getMeals(todayKey());
    document.getElementById('meals-count').textContent = meals.length;
    var list = document.getElementById('meals-list');
    list.innerHTML = '';
    meals.forEach(function (meal, i) {
      var li = document.createElement('li');
      li.className = 'entry-item';
      li.innerHTML =
        '<span class="entry-time">' + formatTime(meal.time) + '</span>' +
        '<button class="entry-undo" data-index="' + i + '">Remove</button>';
      list.appendChild(li);
    });
    // Attach undo handlers
    list.querySelectorAll('.entry-undo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-index'));
        var m = getMeals(todayKey());
        m.splice(idx, 1);
        saveMeals(todayKey(), m);
        renderMeals();
        showToast('Meal removed');
      });
    });
  }

  function initMeals() {
    document.getElementById('btn-ate').addEventListener('click', function () {
      var meals = getMeals(todayKey());
      meals.push({ time: new Date().toISOString() });
      saveMeals(todayKey(), meals);
      renderMeals();
      showToast('Meal logged!');
    });
    renderMeals();
  }

  // =====================
  //  WALKING
  // =====================
  var walkTimerInterval = null;
  var stepCounter = { count: 0, listener: null, lastPeak: 0, lastAccel: 0 };

  function getWalks(dateKey) {
    return load('tracker-walks-' + dateKey) || [];
  }

  function saveWalks(dateKey, walks) {
    save('tracker-walks-' + dateKey, walks);
  }

  function getActiveWalk() {
    return load('tracker-walk-active');
  }

  function setActiveWalk(data) {
    if (data) save('tracker-walk-active', data);
    else localStorage.removeItem('tracker-walk-active');
  }

  function updateWalkTimer() {
    var active = getActiveWalk();
    if (!active) return;
    var elapsed = (Date.now() - new Date(active.start).getTime()) / 1000;
    var min = Math.floor(elapsed / 60);
    var sec = Math.floor(elapsed % 60);
    document.getElementById('walk-timer').textContent =
      min + ':' + (sec < 10 ? '0' : '') + sec;
    document.getElementById('walk-steps').textContent = stepCounter.count + ' steps';
  }

  function startStepCounting() {
    stepCounter.count = 0;
    stepCounter.lastPeak = 0;
    stepCounter.lastAccel = 0;

    function handleMotion(e) {
      var acc = e.accelerationIncludingGravity;
      if (!acc) return;
      var mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      // Simple peak detection for steps
      if (mag > 12 && stepCounter.lastAccel <= 12) {
        var now = Date.now();
        if (now - stepCounter.lastPeak > 300) {
          stepCounter.count++;
          stepCounter.lastPeak = now;
        }
      }
      stepCounter.lastAccel = mag;
    }

    // Request permission on iOS
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(function (state) {
        if (state === 'granted') {
          window.addEventListener('devicemotion', handleMotion);
          stepCounter.listener = handleMotion;
        }
      }).catch(function () {
        // Permission denied - no step counting
      });
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      window.addEventListener('devicemotion', handleMotion);
      stepCounter.listener = handleMotion;
    }
  }

  function stopStepCounting() {
    if (stepCounter.listener) {
      window.removeEventListener('devicemotion', stepCounter.listener);
      stepCounter.listener = null;
    }
    return stepCounter.count;
  }

  function renderWalks() {
    var walks = getWalks(todayKey());
    var totalMin = walks.reduce(function (sum, w) { return sum + (w.duration || 0); }, 0);
    document.getElementById('walks-total-time').textContent = formatDuration(totalMin);
    document.getElementById('walks-count').textContent = walks.length + ' walk' + (walks.length !== 1 ? 's' : '');

    var list = document.getElementById('walks-list');
    list.innerHTML = '';
    walks.forEach(function (walk, i) {
      var li = document.createElement('li');
      li.className = 'entry-item';
      var detail = formatDuration(walk.duration);
      if (walk.steps) detail += ' · ' + walk.steps + ' steps';
      li.innerHTML =
        '<div><span class="entry-time">' + formatTime(walk.start || walk.end) + '</span>' +
        '<span class="entry-detail"> — ' + detail + '</span></div>' +
        '<button class="entry-undo" data-index="' + i + '">Remove</button>';
      list.appendChild(li);
    });
    list.querySelectorAll('.entry-undo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-index'));
        var w = getWalks(todayKey());
        w.splice(idx, 1);
        saveWalks(todayKey(), w);
        renderWalks();
        showToast('Walk removed');
      });
    });
  }

  function setWalkButtonState(active) {
    var btn = document.getElementById('btn-walk');
    var timer = document.getElementById('walk-timer');
    var steps = document.getElementById('walk-steps');
    if (active) {
      btn.querySelector('.big-button-text').textContent = 'Stop Walk';
      btn.querySelector('.big-button-icon').textContent = '✋';
      btn.classList.add('active-walk');
      timer.classList.remove('hidden');
      steps.classList.remove('hidden');
    } else {
      btn.querySelector('.big-button-text').textContent = 'Start Walk';
      btn.querySelector('.big-button-icon').textContent = '🚶';
      btn.classList.remove('active-walk');
      timer.classList.add('hidden');
      steps.classList.add('hidden');
    }
  }

  function initWalking() {
    var btn = document.getElementById('btn-walk');

    // Restore active walk state
    var active = getActiveWalk();
    if (active) {
      setWalkButtonState(true);
      startStepCounting();
      walkTimerInterval = setInterval(updateWalkTimer, 1000);
      updateWalkTimer();
    }

    btn.addEventListener('click', function () {
      var active = getActiveWalk();
      if (!active) {
        // Start walk
        setActiveWalk({ start: new Date().toISOString() });
        setWalkButtonState(true);
        startStepCounting();
        walkTimerInterval = setInterval(updateWalkTimer, 1000);
        updateWalkTimer();
        showToast('Walk started!');
      } else {
        // Stop walk
        clearInterval(walkTimerInterval);
        var steps = stopStepCounting();
        var start = new Date(active.start);
        var end = new Date();
        var duration = (end - start) / 60000; // minutes
        var walks = getWalks(todayKey());
        walks.push({
          start: active.start,
          end: end.toISOString(),
          duration: Math.round(duration * 10) / 10,
          steps: steps || undefined,
        });
        saveWalks(todayKey(), walks);
        setActiveWalk(null);
        setWalkButtonState(false);
        renderWalks();
        showToast('Walk logged! ' + formatDuration(duration));
      }
    });

    // Manual walk logging
    document.getElementById('btn-log-walk').addEventListener('click', function () {
      var input = document.getElementById('walk-minutes');
      var mins = parseInt(input.value);
      if (!mins || mins < 1) {
        showToast('Enter how many minutes');
        return;
      }
      var walks = getWalks(todayKey());
      walks.push({
        end: new Date().toISOString(),
        duration: mins,
      });
      saveWalks(todayKey(), walks);
      input.value = '';
      renderWalks();
      showToast('Walk logged! ' + formatDuration(mins));
    });

    renderWalks();
  }

  // =====================
  //  SLEEP
  // =====================
  function getSleep(dateKey) {
    return load('tracker-sleep-' + dateKey);
  }

  function saveSleep(dateKey, data) {
    save('tracker-sleep-' + dateKey, data);
  }

  function getActiveSleep() {
    return load('tracker-sleep-active');
  }

  function setActiveSleep(data) {
    if (data) save('tracker-sleep-active', data);
    else localStorage.removeItem('tracker-sleep-active');
  }

  function renderSleep() {
    var activeSleep = getActiveSleep();
    var btnSleep = document.getElementById('btn-sleep');
    var btnWake = document.getElementById('btn-wake');

    if (activeSleep) {
      btnSleep.classList.add('hidden');
      btnWake.classList.remove('hidden');
    } else {
      btnSleep.classList.remove('hidden');
      btnWake.classList.add('hidden');
    }

    // Show last sleep record
    var sleep = getSleep(todayKey());
    if (sleep && sleep.bedtime && sleep.waketime) {
      var bed = new Date(sleep.bedtime);
      var wake = new Date(sleep.waketime);
      var duration = (wake - bed) / 60000;
      document.getElementById('sleep-duration').textContent = formatDuration(duration);
      document.getElementById('sleep-times').textContent =
        formatTime(sleep.bedtime) + ' → ' + formatTime(sleep.waketime);
    } else if (activeSleep) {
      document.getElementById('sleep-duration').textContent = 'Sleeping...';
      document.getElementById('sleep-times').textContent =
        'Since ' + formatTime(activeSleep.bedtime);
    } else {
      document.getElementById('sleep-duration').textContent = '—';
      document.getElementById('sleep-times').textContent = '';
    }
  }

  function initSleep() {
    document.getElementById('btn-sleep').addEventListener('click', function () {
      setActiveSleep({ bedtime: new Date().toISOString() });
      renderSleep();
      showToast('Good night! Sleep well.');
    });

    document.getElementById('btn-wake').addEventListener('click', function () {
      var active = getActiveSleep();
      if (!active) return;
      var wakeTime = new Date().toISOString();
      // Save to today's date
      saveSleep(todayKey(), {
        bedtime: active.bedtime,
        waketime: wakeTime,
      });
      setActiveSleep(null);
      renderSleep();
      var duration = (new Date(wakeTime) - new Date(active.bedtime)) / 60000;
      showToast('Good morning! Slept ' + formatDuration(duration));
    });

    // Manual sleep entry
    document.getElementById('btn-log-sleep').addEventListener('click', function () {
      var bedInput = document.getElementById('sleep-bedtime');
      var wakeInput = document.getElementById('sleep-waketime');
      if (!bedInput.value || !wakeInput.value) {
        showToast('Enter both bedtime and wake time');
        return;
      }
      // Build date objects - assume bedtime was yesterday if wake is earlier
      var today = todayKey();
      var bedDate = new Date(today + 'T' + bedInput.value + ':00');
      var wakeDate = new Date(today + 'T' + wakeInput.value + ':00');
      // If bedtime is after wake time, bedtime was the previous day
      if (bedDate >= wakeDate) {
        bedDate.setDate(bedDate.getDate() - 1);
      }
      saveSleep(today, {
        bedtime: bedDate.toISOString(),
        waketime: wakeDate.toISOString(),
      });
      bedInput.value = '';
      wakeInput.value = '';
      renderSleep();
      var duration = (wakeDate - bedDate) / 60000;
      showToast('Sleep logged! ' + formatDuration(duration));
    });

    renderSleep();
  }

  // =====================
  //  HISTORY
  // =====================
  var historyOffset = 0; // 0 = today, 1 = yesterday, etc.

  function getHistoryDate() {
    var d = new Date();
    d.setDate(d.getDate() - historyOffset);
    return d.toISOString().slice(0, 10);
  }

  function refreshHistory() {
    var dateKey = getHistoryDate();
    document.getElementById('history-date').textContent = formatDate(dateKey);
    document.getElementById('btn-next-day').disabled = historyOffset <= 0;

    // Meals
    var meals = getMeals(dateKey);
    if (meals.length > 0) {
      document.getElementById('history-meals').innerHTML =
        '<strong>' + meals.length + ' meal' + (meals.length !== 1 ? 's' : '') + '</strong><br>' +
        meals.map(function (m) { return formatTime(m.time); }).join(', ');
    } else {
      document.getElementById('history-meals').textContent = 'No meals recorded';
    }

    // Walks
    var walks = getWalks(dateKey);
    if (walks.length > 0) {
      var totalMin = walks.reduce(function (s, w) { return s + (w.duration || 0); }, 0);
      var totalSteps = walks.reduce(function (s, w) { return s + (w.steps || 0); }, 0);
      var html = '<strong>' + walks.length + ' walk' + (walks.length !== 1 ? 's' : '') +
        ' · ' + formatDuration(totalMin) + '</strong>';
      if (totalSteps > 0) html += ' · ' + totalSteps + ' steps';
      html += '<br>' + walks.map(function (w) {
        var d = formatDuration(w.duration);
        return formatTime(w.start || w.end) + ' (' + d + ')';
      }).join('<br>');
      document.getElementById('history-walks').innerHTML = html;
    } else {
      document.getElementById('history-walks').textContent = 'No walks recorded';
    }

    // Sleep
    var sleep = getSleep(dateKey);
    if (sleep && sleep.bedtime && sleep.waketime) {
      var duration = (new Date(sleep.waketime) - new Date(sleep.bedtime)) / 60000;
      document.getElementById('history-sleep').innerHTML =
        '<strong>' + formatDuration(duration) + '</strong><br>' +
        formatTime(sleep.bedtime) + ' → ' + formatTime(sleep.waketime);
    } else {
      document.getElementById('history-sleep').textContent = 'No sleep recorded';
    }
  }

  function initHistory() {
    document.getElementById('btn-prev-day').addEventListener('click', function () {
      historyOffset++;
      refreshHistory();
    });
    document.getElementById('btn-next-day').addEventListener('click', function () {
      if (historyOffset > 0) {
        historyOffset--;
        refreshHistory();
      }
    });
  }

  // =====================
  //  SERVICE WORKER
  // =====================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // SW registration failed - app still works
      });
    }
  }

  // =====================
  //  INIT
  // =====================
  function init() {
    updateDateHeader();
    initTabs();
    initMeals();
    initWalking();
    initSleep();
    initHistory();
    registerSW();

    // Refresh date at midnight
    setInterval(function () {
      updateDateHeader();
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();