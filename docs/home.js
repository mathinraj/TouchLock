(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------- store links -- */
  var STORES = {
    chrome:  { label: 'Add to Chrome',  icon: 'fa-chrome',          url: 'https://chromewebstore.google.com/detail/touchlock-%E2%80%93-fingerprint-b/jajgeiifpgdfnphjklcogipefkfdacdl' },
    brave:   { label: 'Add to Brave',   icon: 'fa-brave',           url: 'https://chromewebstore.google.com/detail/touchlock-%E2%80%93-fingerprint-b/jajgeiifpgdfnphjklcogipefkfdacdl' },
    opera:   { label: 'Add to Opera',   icon: 'fa-opera',           url: 'https://chromewebstore.google.com/detail/touchlock-%E2%80%93-fingerprint-b/jajgeiifpgdfnphjklcogipefkfdacdl' },
    edge:    { label: 'Add to Edge',    icon: 'fa-edge',            url: 'https://microsoftedge.microsoft.com/addons/detail/touchlock-%E2%80%93-fingerprint-b/aibbojojoeamjgikgailflpbhdpcjgln' },
    firefox: { label: 'Add to Firefox', icon: 'fa-firefox-browser', url: 'https://addons.mozilla.org/en-US/firefox/addon/touchlock-fingerprint-lock/' }
  };

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/OPR\//.test(ua)) return 'opera';
    if (navigator.brave) return 'brave';
    return 'chrome';
  }

  function isPhoneOrTablet() {
    var ua = navigator.userAgent;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  var onMobile = isPhoneOrTablet();
  var store = STORES[detectBrowser()];

  document.querySelectorAll('[data-store-link]').forEach(function (a) {
    var label = a.querySelector('[data-store-label]');
    var icon = a.querySelector('[data-store-icon]');
    if (onMobile) {
      var direct = a.hasAttribute('data-store-direct');
      if (label) label.textContent = direct ? 'Send the link to my computer' : 'Get it on desktop';
      if (icon) icon.className = 'fa-solid ' + (direct ? 'fa-paper-plane' : 'fa-desktop');
      if (direct) {
        a.removeAttribute('target');
        a.href = '#install';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          sendLink(label);
        });
      }
      return;
    }
    if (label) label.textContent = store.label;
    if (icon) icon.className = 'fa-brands ' + store.icon;
    if (a.hasAttribute('data-store-direct')) a.href = store.url;
  });

  if (onMobile) {
    document.querySelectorAll('[data-mobile-note]').forEach(function (n) { n.hidden = false; });
  }

  function sendLink(label) {
    var url = 'https://touchlock.vercel.app/';
    var data = { title: 'TouchLock', text: 'Lock your browser with your fingerprint. Install on desktop:', url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        label.textContent = 'Link copied';
        setTimeout(function () { label.textContent = 'Send the link to my computer'; }, 2000);
      });
    }
  }

  /* ------------------------------------------------------------ bar -- */
  var bar = document.getElementById('bar');
  var darkZones = Array.prototype.slice.call(document.querySelectorAll('.ground-dark'));
  function paintBar() {
    bar.classList.toggle('is-scrolled', window.scrollY > 24);
    var mid = bar.offsetHeight / 2;
    var overDark = darkZones.some(function (z) {
      var r = z.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    });
    bar.classList.toggle('is-dark', overDark);
  }
  window.addEventListener('scroll', paintBar, { passive: true });
  window.addEventListener('resize', paintBar);
  paintBar();

  /* ------------------------------------------------- hero lock demo -- */
  var demo = document.getElementById('demo');
  if (demo) {
    var HOLD_MS = 900;
    var IDLE_S = 12;
    var PIN = '2580';

    var panel = document.getElementById('lock-panel');
    var hint = document.getElementById('lock-hint');
    var sensor = document.getElementById('sensor');
    var bio = document.getElementById('lock-bio');
    var pinPane = document.getElementById('lock-pin');
    var dots = document.getElementById('pin-dots').children;
    var keypad = document.getElementById('keypad');
    var status = document.getElementById('demo-status');
    var lockNow = document.getElementById('lock-now');
    var addr = demo.querySelector('[data-addr]');
    var tabs = demo.querySelectorAll('[data-tab]');
    var pages = demo.querySelectorAll('[data-page]');
    var hosts = { inbox: 'mail.example.com', bank: 'bank.example.com', history: 'browser://history' };

    var entered = '';
    var holdStart = 0, holdRaf = 0, holding = false;
    var idleLeft = IDLE_S, idleTimer = 0;
    var DEFAULT_HINT = 'Hold the sensor to unlock';

    var isLocked = function () { return demo.getAttribute('data-state') === 'locked'; };

    function setHint(text, error) {
      hint.textContent = text;
      hint.classList.toggle('is-error', !!error);
    }

    function shake(el) {
      el.classList.remove('is-shaking');
      void el.offsetWidth;
      el.classList.add('is-shaking');
    }

    function setProgress(p) { sensor.style.setProperty('--p', p.toFixed(3)); }

    function startHold() {
      if (!isLocked() || holding) return;
      holding = true;
      holdStart = performance.now();
      sensor.classList.add('is-holding');
      setHint('Keep holding…');
      cancelAnimationFrame(holdRaf);
      holdRaf = requestAnimationFrame(function tick(now) {
        var p = Math.min((now - holdStart) / HOLD_MS, 1);
        setProgress(p);
        if (p >= 1) {
          holding = false;
          sensor.classList.remove('is-holding');
          sensor.classList.add('is-done');
          setHint('Fingerprint matched');
          setTimeout(function () { unlock('fingerprint'); }, reduce ? 0 : 260);
          return;
        }
        if (holding) holdRaf = requestAnimationFrame(tick);
      });
    }

    function endHold() {
      if (!holding) return;
      holding = false;
      cancelAnimationFrame(holdRaf);
      sensor.classList.remove('is-holding');
      setProgress(0);
      setHint('Hold a little longer', true);
    }

    sensor.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      sensor.setPointerCapture(e.pointerId);
      startHold();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      sensor.addEventListener(t, endHold);
    });
    sensor.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    sensor.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); }
    });
    sensor.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') endHold();
    });

    function showPin(on) {
      bio.hidden = on;
      pinPane.hidden = !on;
      entered = '';
      paintDots();
      setHint(on ? 'Enter your PIN' : DEFAULT_HINT);
      (on ? keypad.querySelector('button') : sensor).focus({ preventScroll: true });
    }
    document.getElementById('use-pin').addEventListener('click', function () { showPin(true); });

    function paintDots() {
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-on', i < entered.length);
    }

    function pressKey(k) {
      if (!isLocked()) return;
      if (k === 'bio') { showPin(false); return; }
      if (k === 'del') { entered = entered.slice(0, -1); paintDots(); return; }
      if (entered.length >= 4) return;
      entered += k;
      paintDots();
      if (entered.length === 4) {
        if (entered === PIN) {
          setHint('PIN accepted');
          setTimeout(function () { unlock('PIN'); }, reduce ? 0 : 180);
        } else {
          setHint('Wrong PIN. The demo PIN is 2580.', true);
          shake(panel);
          setTimeout(function () { entered = ''; paintDots(); }, 320);
        }
      }
    }

    keypad.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) pressKey(b.getAttribute('data-key') || b.textContent.trim());
    });

    demo.addEventListener('keydown', function (e) {
      if (pinPane.hidden || !isLocked()) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pressKey(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); pressKey('del'); }
    });

    function showTab(name) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-tab') === name;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      pages.forEach(function (p) { p.hidden = p.getAttribute('data-page') !== name; });
      addr.textContent = hosts[name];
      demo.setAttribute('data-view', name);
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        if (isLocked()) {
          setHint('Nothing opens while locked', true);
          shake(panel);
          return;
        }
        showTab(t.getAttribute('data-tab'));
        resetIdle();
      });
    });

    function paintIdle() {
      status.textContent = 'Unlocked. Idle lock in ' + idleLeft + 's';
    }

    function resetIdle() {
      if (isLocked()) return;
      idleLeft = IDLE_S;
      paintIdle();
    }

    function unlock(how) {
      demo.setAttribute('data-state', 'unlocked');
      lockNow.disabled = false;
      idleLeft = IDLE_S;
      paintIdle();
      clearInterval(idleTimer);
      idleTimer = setInterval(function () {
        idleLeft -= 1;
        if (idleLeft <= 0) { lock('Locked after 12 seconds idle'); return; }
        paintIdle();
      }, 1000);
      if (demo.contains(document.activeElement)) lockNow.focus({ preventScroll: true });
      demo.setAttribute('data-unlocked-with', how);
    }

    function lock(message) {
      clearInterval(idleTimer);
      demo.setAttribute('data-state', 'locked');
      lockNow.disabled = true;
      status.textContent = message || 'Locked';
      sensor.classList.remove('is-done');
      setProgress(0);
      entered = '';
      paintDots();
      bio.hidden = false;
      pinPane.hidden = true;
      setHint(DEFAULT_HINT);
      if (demo.contains(document.activeElement)) sensor.focus({ preventScroll: true });
    }

    lockNow.disabled = true;
    lockNow.addEventListener('click', function () { lock('Locked from the toolbar'); });
    ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(function (t) {
      demo.addEventListener(t, resetIdle, { passive: true });
    });

    document.addEventListener('keydown', function (e) {
      var typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
      if (typing || !e.altKey || e.code !== 'KeyL') return;
      if (isLocked()) return;
      e.preventDefault();
      lock('Locked with Alt+L');
    });
  }

  /* ---------------------------------------------------- site lock -- */
  var relockSay = document.getElementById('relock-say');
  var RELOCK = {
    leave: 'Close the tab or go somewhere else, and the site asks for your fingerprint next time.',
    time: 'Stay as long as you like. Fifteen minutes after you unlock it, the site locks again. Pick anywhere from 5 to 60.',
    browser: 'Unlock a site once and it stays open until the whole browser locks.'
  };
  document.querySelectorAll('input[name="relock"]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) relockSay.textContent = RELOCK[r.value]; });
  });

  var sub = document.getElementById('subdomains');
  if (sub) {
    var subSay = document.getElementById('sub-say');
    var subHost = document.querySelector('[data-sub-host]');
    sub.addEventListener('change', function () {
      subSay.textContent = sub.checked
        ? 'google.com also covers mail.google.com'
        : 'Only google.com itself. mail.google.com opens freely.';
      subHost.textContent = sub.checked ? 'google.com' : 'google.com only';
    });
  }

  /* --------------------------------------------------- duress demo -- */
  var vault = document.getElementById('vault');
  if (vault) {
    var list = document.getElementById('vault-list');
    var say = document.getElementById('vault-say');
    var buttons = vault.querySelectorAll('[data-unlock]');
    var original = list.innerHTML;
    var busy = false;

    function setButtons(locked) {
      buttons.forEach(function (b) { b.disabled = !locked; });
    }

    function relockVault() {
      list.innerHTML = original;
      vault.setAttribute('data-state', 'locked');
      say.classList.remove('is-open');
      say.textContent = 'Locked. Try both PINs and compare.';
      setButtons(true);
      resetBtn.hidden = true;
    }

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn--ghost vault__reset';
    resetBtn.textContent = 'Lock it again';
    resetBtn.hidden = true;
    resetBtn.style.marginTop = '12px';
    resetBtn.addEventListener('click', function () { relockVault(); buttons[0].focus({ preventScroll: true }); });
    vault.appendChild(resetBtn);

    function openUp() {
      vault.setAttribute('data-state', 'open');
      say.classList.add('is-open');
      say.textContent = 'Browser unlocked.';
      busy = false;
      resetBtn.hidden = false;
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (busy) return;
        busy = true;
        setButtons(false);
        var duress = b.getAttribute('data-unlock') === 'duress';
        if (!duress) { setTimeout(openUp, reduce ? 0 : 220); return; }

        var targets = list.querySelectorAll('[data-erase]');
        vault.setAttribute('data-state', 'erasing');
        var step = reduce ? 0 : 340;
        targets.forEach(function (li, i) {
          setTimeout(function () { li.classList.add('is-gone'); }, step + i * (reduce ? 0 : 160));
          setTimeout(function () { li.classList.add('is-removed'); }, step * 2 + i * (reduce ? 0 : 160) + (reduce ? 0 : 200));
        });
        setTimeout(openUp, step * 2 + targets.length * (reduce ? 0 : 160) + (reduce ? 0 : 260));
      });
    });
  }

  /* --------------------------------------------------------- engine -- */
  if (window.ScrollCraft) window.ScrollCraft.mount(document.body);
})();
