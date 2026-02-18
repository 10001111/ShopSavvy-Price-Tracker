// ============================================================
// OfertaRadar - Theme Debug Console Scripts
// Paste any section into the browser DevTools console.
// Written for the OfertaRadar light/dark theme system.
// ============================================================


// -- 1. THEME STATUS
// Shows everything about the current theme state.
(function themeStatus() {
  var theme  = document.documentElement.getAttribute('data-theme');
  var saved  = localStorage.getItem('theme');
  var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var toggle = document.getElementById('themeToggle');
  console.group('%c Theme Status', 'color:#3c91ed;font-weight:bold;font-size:14px');
  console.log('%cActive theme',          'color:#a0aec0', theme  || '(not set)');
  console.log('%cSaved in localStorage', 'color:#a0aec0', saved  || '(none - defaulting to dark)');
  console.log('%cSystem preference',     'color:#a0aec0', system);
  console.log('%cToggle button exists',  'color:#a0aec0', !!toggle);
  console.log('%chtml[data-theme]',      'color:#a0aec0', document.documentElement.getAttribute('data-theme'));
  console.groupEnd();
})();


// -- 2. CSS VARIABLE INSPECTOR
// Shows the resolved value of every theme CSS variable.
(function cssVarInspector() {
  var vars = [
    '--bg-primary', '--bg-secondary', '--bg-tertiary',
    '--bg-card',    '--bg-input',     '--bg-accent',
    '--text-primary', '--text-secondary', '--text-muted',
    '--text-light',   '--text-inverse',
    '--accent-primary', '--accent-secondary', '--accent-hover',
    '--accent-light',   '--accent-glow',
    '--border-color',   '--border-light',
    '--shadow-soft',    '--shadow-medium', '--shadow-hover',
    '--color-scheme'
  ];
  var theme  = document.documentElement.getAttribute('data-theme');
  var styles = getComputedStyle(document.documentElement);
  console.group('%c CSS Variables (' + theme + ' theme)', 'color:#3c91ed;font-weight:bold;font-size:14px');
  vars.forEach(function(v) {
    var val     = styles.getPropertyValue(v).trim();
    var isColor = /^#|^rgb|^hsl/.test(val);
    if (isColor) {
      console.log('%c' + v + ': %c' + val + ' %c  ',
        'color:#718096', 'color:#f5f5f5',
        'background:' + val + ';color:' + val + ';font-size:12px');
    } else {
      console.log('%c' + v + ':', 'color:#718096', val || '(empty)');
    }
  });
  console.groupEnd();
})();


// -- 3. TOGGLE AND WATCH
// Switches theme once then watches for further changes (10s).
(function toggleAndWatch() {
  var current = document.documentElement.getAttribute('data-theme');
  var next    = current === 'dark' ? 'light' : 'dark';
  console.log('%c Switching: ' + current + ' -> ' + next, 'color:#3c91ed;font-weight:bold');
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === 'data-theme') {
        console.log('%c data-theme changed to:', 'color:#10b981;font-weight:bold',
          document.documentElement.getAttribute('data-theme'));
      }
    });
  });
  obs.observe(document.documentElement, { attributes: true });
  setTimeout(function() {
    obs.disconnect();
    console.log('%c Observer stopped (10s elapsed)', 'color:#718096');
  }, 10000);
})();


// -- 4. FORCE LIGHT MODE
(function forceLightMode() {
  document.documentElement.setAttribute('data-theme', 'light');
  localStorage.setItem('theme', 'light');
  console.log('%c Forced LIGHT mode', 'color:#f6ad55;font-weight:bold');
})();


// -- 5. FORCE DARK MODE
(function forceDarkMode() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('theme', 'dark');
  console.log('%c Forced DARK mode', 'color:#7f9cf5;font-weight:bold');
})();


// -- 6. RESET TO SYSTEM DEFAULT
// Removes localStorage override so the OS preference takes effect.
(function resetToSystemTheme() {
  localStorage.removeItem('theme');
  var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', system);
  console.log('%c Reset to system preference:', 'color:#3c91ed;font-weight:bold', system);
})();


// -- 7. FLASH TEST
// Rapidly cycles dark->light->dark. Elements that do NOT change
// have hardcoded inline styles bypassing the CSS variable system.
(function flashTest() {
  var original = document.documentElement.getAttribute('data-theme');
  var delay    = 400;
  console.log('%c Flash test - cycling every ' + delay + 'ms', 'color:#ed8936;font-weight:bold');
  ['light', 'dark', 'light', 'dark', original].forEach(function(t, i) {
    setTimeout(function() {
      document.documentElement.setAttribute('data-theme', t);
      console.log('%c  -> ' + t, i === 4 ? 'color:#10b981' : 'color:#a0aec0');
    }, i * delay);
  });
})();


// -- 8. TOGGLE BUTTON HEALTH CHECK
// Verifies #themeToggle exists, is visible, and has its icons.
(function toggleButtonCheck() {
  var btn = document.getElementById('themeToggle');
  console.group('%c Toggle Button Check', 'color:#3c91ed;font-weight:bold;font-size:14px');
  if (!btn) {
    console.error('ERROR: #themeToggle not found in the DOM');
    console.groupEnd();
    return;
  }
  console.log('%cFound',      'color:#10b981', btn);
  console.log('%cVisible',    'color:#a0aec0', btn.offsetParent !== null);
  console.log('%cDisabled',   'color:#a0aec0', btn.disabled);
  console.log('%c.sun-icon',  'color:#a0aec0', !!btn.querySelector('.sun-icon'));
  console.log('%c.moon-icon', 'color:#a0aec0', !!btn.querySelector('.moon-icon'));
  var listeners = typeof getEventListeners === 'function'
    ? getEventListeners(btn) : '(Chrome DevTools only)';
  console.log('%cListeners',  'color:#a0aec0', listeners);
  console.groupEnd();
})();


// -- 9. ELEMENT SCAN
// Lists every element with a hardcoded inline colour that will
// NOT update when the theme changes.
(function elementScan() {
  var suspects = [];
  document.querySelectorAll('*').forEach(function(el) {
    var s = el.style;
    if ((s.background      && s.background.includes('#'))       ||
        (s.backgroundColor && s.backgroundColor.includes('rgb')) ||
        (s.color           && s.color.includes('rgb'))) {
      suspects.push({ el: el, bg: s.background || s.backgroundColor, color: s.color });
    }
  });
  var c = suspects.length ? '#f56565' : '#10b981';
  console.group('%c Hardcoded inline colours (' + suspects.length + ' found)',
    'color:' + c + ';font-weight:bold;font-size:14px');
  if (!suspects.length) {
    console.log('%c OK - theme switching is fully CSS-variable-driven.', 'color:#10b981');
  } else {
    suspects.slice(0, 20).forEach(function(s) {
      console.warn(s.el, 'bg:', s.bg, 'color:', s.color);
    });
    if (suspects.length > 20) console.log('...and', suspects.length - 20, 'more');
  }
  console.groupEnd();
})();


// -- 10. FULL REPORT
// Runs all checks at once. Paste this for a complete overview.
(function fullThemeReport() {
  var theme   = document.documentElement.getAttribute('data-theme');
  var saved   = localStorage.getItem('theme');
  var system  = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var btn     = document.getElementById('themeToggle');
  var styles  = getComputedStyle(document.documentElement);
  var core    = ['--bg-primary','--bg-card','--text-primary','--accent-primary','--border-color','--color-scheme'];
  var suspects = 0;
  document.querySelectorAll('*').forEach(function(el) {
    var s = el.style;
    if ((s.background      && s.background.includes('#'))       ||
        (s.backgroundColor && s.backgroundColor.includes('rgb')) ||
        (s.color           && s.color.includes('rgb'))) suspects++;
  });
  console.group('%c OfertaRadar - Full Theme Report', 'color:#3c91ed;font-weight:bold;font-size:15px');
  console.log('%c Theme:           ', 'color:#a0aec0', theme);
  console.log('%c localStorage:    ', 'color:#a0aec0', saved || '(not set - using dark default)');
  console.log('%c System pref:     ', 'color:#a0aec0', system);
  console.log('%c Toggle button:   ', btn ? 'color:#10b981' : 'color:#f56565',
    btn ? 'OK - found' : 'ERROR - missing');
  console.log('%c Core CSS vars:   ', 'color:#a0aec0');
  core.forEach(function(v) {
    console.log('    ' + v + ' = ' + styles.getPropertyValue(v).trim());
  });
  console.log('%c Inline conflicts:', suspects ? 'color:#f56565' : 'color:#10b981',
    suspects
      ? 'WARNING: ' + suspects + ' elements may not respond to theme changes'
      : 'OK - none found');
  console.groupEnd();
})();
