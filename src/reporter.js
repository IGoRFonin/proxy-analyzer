export function aggregateDaily(measurements) {
  const daily = {};

  for (const m of measurements) {
    const day = m.time.slice(0, 10);
    if (!daily[day]) daily[day] = {};

    for (const r of m.results) {
      if (!daily[day][r.name]) {
        daily[day][r.name] = {
          transport: r.transport,
          oks: 0, total: 0, ttfbs: [], speeds1mb: [], latestSpeed10mb: null,
        };
      }
      const entry = daily[day][r.name];
      entry.total++;
      if (r.status === 'ok') {
        entry.oks++;
        entry.ttfbs.push(r.ttfb_ms);
        entry.speeds1mb.push(r.speed_1mb_kbps);
      }
      if (r.speed_10mb_kbps !== null) {
        entry.latestSpeed10mb = r.speed_10mb_kbps;
      }
    }
  }

  for (const day of Object.keys(daily)) {
    for (const name of Object.keys(daily[day])) {
      const e = daily[day][name];
      const sorted = [...e.ttfbs].sort((a, b) => a - b);
      daily[day][name] = {
        transport: e.transport,
        tests: e.total,
        successRate: e.total > 0 ? Math.round((e.oks / e.total) * 100) : 0,
        avgTtfb: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        p95Ttfb: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] : 0,
        avgSpeed1mb: e.speeds1mb.length > 0 ? Math.round(e.speeds1mb.reduce((a, b) => a + b, 0) / e.speeds1mb.length) : 0,
        latestSpeed10mb: e.latestSpeed10mb,
      };
    }
  }

  return daily;
}

export function buildTopWorst(daily, today) {
  const dayData = daily[today];
  if (!dayData) return { top: [], worst: [] };

  const entries = Object.entries(dayData).map(([name, stats]) => ({ name, ...stats }));
  const sorted = [...entries].sort((a, b) => b.successRate - a.successRate || a.avgTtfb - b.avgTtfb);

  return {
    top: sorted.slice(0, 5),
    worst: [...sorted].reverse().slice(0, 5),
  };
}

export function generateHTML(measurements, ipChanges = {}) {
  const daily = aggregateDaily(measurements);
  const days = Object.keys(daily).sort();
  const today = days[days.length - 1] || '';
  const { top, worst } = buildTopWorst(daily, today);

  const allNames = new Set();
  for (const day of days) {
    for (const name of Object.keys(daily[day])) allNames.add(name);
  }
  const proxyNames = [...allNames].sort();

  let chartProxies = proxyNames;
  if (proxyNames.length > 15) {
    const avgSuccess = proxyNames.map(name => {
      let sum = 0, count = 0;
      for (const day of days) {
        if (daily[day][name]) { sum += daily[day][name].successRate; count++; }
      }
      return { name, avg: count > 0 ? sum / count : 0 };
    });
    avgSuccess.sort((a, b) => b.avg - a.avg);
    chartProxies = avgSuccess.slice(0, 10).map(e => e.name);
  }

  const availabilityData = chartProxies.map(name => ({
    label: name,
    data: days.map(d => daily[d][name]?.successRate ?? null),
  }));

  const ttfbData = chartProxies.map(name => ({
    label: name,
    data: days.map(d => daily[d][name]?.avgTtfb ?? null),
  }));

  const todayData = daily[today] || {};
  const tableRows = proxyNames.map(name => {
    const s = todayData[name] || {};
    return { name, ...s };
  });

  const lastMeasurement = measurements[measurements.length - 1] || null;

  const DATA = {
    days,
    today,
    top,
    worst,
    tableRows,
    availabilityData,
    ttfbData,
    lastMeasurement,
    proxyCount: proxyNames.length,
    ipChanges,
    generatedAt: new Date().toISOString(),
  };

  const scriptEnd = '<' + '/script>';

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proxy Analyzer</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js">${scriptEnd}
<script src="https://cdn.tailwindcss.com">${scriptEnd}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script>
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
        display: ['Orbitron', 'sans-serif'],
      },
      colors: {
        neon: {
          cyan: '#00FFD1',
          magenta: '#FF00FF',
          blue: '#00BFFF',
          lime: '#39FF14',
          pink: '#FF1493',
        }
      }
    },
  },
}
${scriptEnd}
<style>
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    .scanlines::before { display: none !important; }
  }
  body { font-family: 'Inter', sans-serif; }
  .font-mono { font-family: 'Fira Code', monospace; }
  .font-display { font-family: 'Orbitron', sans-serif; }

  .dark .scanlines::before {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 209, 0.015) 2px, rgba(0, 255, 209, 0.015) 4px);
    pointer-events: none;
    z-index: 100;
  }

  .dark .grid-bg {
    background-color: #0a0a0f;
    background-image:
      linear-gradient(rgba(0, 255, 209, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 255, 209, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  html:not(.dark) .grid-bg {
    background-color: #f1f5f9;
    background-image:
      linear-gradient(rgba(100, 116, 139, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(100, 116, 139, 0.08) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .neon-card {
    border: 1px solid rgba(0, 255, 209, 0.2);
    transition: box-shadow 300ms, border-color 300ms;
  }
  .dark .neon-card {
    background: rgba(10, 10, 20, 0.8);
  }
  .dark .neon-card:hover {
    border-color: rgba(0, 255, 209, 0.5);
    box-shadow: 0 0 20px rgba(0, 255, 209, 0.1), inset 0 0 20px rgba(0, 255, 209, 0.03);
  }
  html:not(.dark) .neon-card {
    background: white;
    border-color: #e2e8f0;
  }
  html:not(.dark) .neon-card:hover {
    border-color: #0d9488;
    box-shadow: 0 0 15px rgba(13, 148, 136, 0.1);
  }

  .neon-glow { text-shadow: 0 0 10px rgba(0, 255, 209, 0.5), 0 0 30px rgba(0, 255, 209, 0.2); }
  html:not(.dark) .neon-glow { text-shadow: none; color: #0f766e; }

  .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 10px 14px; text-align: left; white-space: nowrap; }
  th { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; cursor: pointer; transition: color 200ms; }
  .dark th { color: #00FFD1; opacity: 0.5; border-bottom: 1px solid rgba(0, 255, 209, 0.15); }
  .dark th:hover { opacity: 1; }
  .dark td { border-bottom: 1px solid rgba(0, 255, 209, 0.08); color: #e2e8f0; }
  html:not(.dark) th { color: #0f766e; border-bottom: 2px solid #e2e8f0; }
  html:not(.dark) td { border-bottom: 1px solid #f1f5f9; color: #334155; }
  html:not(.dark) th:hover { color: #134e4a; }

  .dark .ok { color: #00FFD1; }
  .dark .warn { color: #FFD700; }
  .dark .fail { color: #FF1493; }
  html:not(.dark) .ok { color: #059669; }
  html:not(.dark) .warn { color: #d97706; }
  html:not(.dark) .fail { color: #dc2626; }
</style>
</head>
<body class="min-h-screen transition-colors duration-300">
<div class="scanlines grid-bg min-h-screen">
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

  <div class="flex items-center justify-between mb-8">
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold font-display dark:text-neon-cyan text-teal-700 neon-glow tracking-wider">PROXY ANALYZER</h1>
      <p class="text-xs dark:text-slate-500 text-slate-400 mt-2 font-mono">
        <span class="dark:text-neon-cyan/40 text-teal-600">&gt;</span> Updated: <span id="updated"></span> &middot; Nodes: <span id="count"></span>
      </p>
    </div>
    <button id="themeToggle" class="cursor-pointer neon-card rounded-lg p-3 transition-all duration-200 hover:scale-105 active:scale-95" aria-label="Toggle theme">
      <svg id="iconSun" class="w-5 h-5 hidden dark:block text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      <svg id="iconMoon" class="w-5 h-5 block dark:hidden text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
    </button>
  </div>

  <div class="neon-card rounded-xl p-4 sm:p-6 mb-6">
    <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-cyan/50 text-teal-600 mb-4">// Today's Summary</h2>
    <div class="table-scroll">
      <table id="summary">
        <thead><tr><th>Name</th><th>Transport</th><th>Success %</th><th>Avg TTFB</th><th>P95 TTFB</th><th>Avg 1MB</th><th>10MB</th><th>IP Changes</th><th>Status</th></tr></thead>
        <tbody class="font-mono text-sm"></tbody>
      </table>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <div class="neon-card rounded-xl p-4 sm:p-6">
      <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-cyan/50 text-teal-600 mb-4">// Top 5 Nodes</h2>
      <div class="space-y-3" id="top5"></div>
    </div>
    <div class="neon-card rounded-xl p-4 sm:p-6">
      <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-magenta/50 text-rose-500 mb-4">// Worst 5 Nodes</h2>
      <div class="space-y-3" id="worst5"></div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <div class="neon-card rounded-xl p-4 sm:p-6">
      <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-cyan/50 text-teal-600 mb-4">// Availability (7 days)</h2>
      <canvas id="availChart"></canvas>
    </div>
    <div class="neon-card rounded-xl p-4 sm:p-6">
      <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-cyan/50 text-teal-600 mb-4">// TTFB (7 days)</h2>
      <canvas id="ttfbChart"></canvas>
    </div>
  </div>

  <div class="neon-card rounded-xl p-4 sm:p-6">
    <h2 class="text-xs font-display uppercase tracking-[0.2em] dark:text-neon-cyan/50 text-teal-600 mb-4">// Latest Scan</h2>
    <div class="table-scroll">
      <table id="latest">
        <thead><tr><th>Name</th><th>Status</th><th>TTFB</th><th>1MB Speed</th><th>10MB Speed</th></tr></thead>
        <tbody class="font-mono text-sm"></tbody>
      </table>
    </div>
  </div>

</div>
</div>

<script>
const DATA = ${JSON.stringify(DATA)};

const html = document.documentElement;
const THEME_KEY = 'proxy-analyzer-theme';
const saved = localStorage.getItem(THEME_KEY);
if (saved === 'light') {
  html.classList.remove('dark');
} else {
  html.classList.add('dark');
}
document.getElementById('themeToggle').addEventListener('click', () => {
  html.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, html.classList.contains('dark') ? 'dark' : 'light');
  updateCharts();
});
const isDark = () => html.classList.contains('dark');

document.getElementById('updated').textContent = new Date(DATA.generatedAt).toLocaleString();
document.getElementById('count').textContent = DATA.proxyCount;

const svgOk = '<svg class="w-5 h-5 inline ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>';
const svgWarn = '<svg class="w-5 h-5 inline warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const svgFail = '<svg class="w-5 h-5 inline fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

const tbody = document.querySelector('#summary tbody');
DATA.tableRows.forEach(r => {
  const statusClass = (r.successRate ?? 0) > 90 ? 'ok' : (r.successRate ?? 0) > 50 ? 'warn' : 'fail';
  const statusIcon = statusClass === 'ok' ? svgOk : statusClass === 'warn' ? svgWarn : svgFail;
  const ipChanges = DATA.ipChanges[r.name] ?? 0;
  tbody.innerHTML += '<tr class="transition-colors duration-150 dark:hover:bg-neon-cyan/5 hover:bg-teal-50"><td class="font-medium">' + (r.name||'') + '</td><td class="dark:text-slate-500 text-slate-400">' + (r.transport||'') + '</td><td class="font-semibold ' + statusClass + '">' + (r.successRate??0) + '%</td><td>' + (r.avgTtfb??0) + 'ms</td><td>' + (r.p95Ttfb??0) + 'ms</td><td>' + (r.avgSpeed1mb??0) + ' KB/s</td><td>' + (r.latestSpeed10mb != null ? r.latestSpeed10mb + ' KB/s' : '\\u2014') + '</td><td>' + ipChanges + '</td><td>' + statusIcon + '</td></tr>';
});

function renderCards(containerId, items) {
  const el = document.getElementById(containerId);
  const isWorst = containerId === 'worst5';
  items.forEach(r => {
    const cls = r.successRate > 90 ? 'ok' : r.successRate > 50 ? 'warn' : 'fail';
    const borderColor = isWorst ? 'border-pink-500/20 dark:border-neon-magenta/20' : 'border-teal-500/20 dark:border-neon-cyan/20';
    const hoverBorder = isWorst ? 'hover:border-pink-400 dark:hover:border-neon-magenta/50' : 'hover:border-teal-400 dark:hover:border-neon-cyan/50';
    el.innerHTML += '<div class="cursor-pointer rounded-lg p-4 border ' + borderColor + ' dark:bg-black/40 bg-white transition-all duration-200 ' + hoverBorder + ' flex items-center justify-between"><div><div class="font-semibold text-sm dark:text-slate-300 text-slate-700 font-mono">' + r.name + '</div><div class="text-xs dark:text-slate-500 text-slate-400 font-mono mt-1">' + r.avgTtfb + 'ms / ' + r.avgSpeed1mb + ' KB/s</div></div><div class="text-2xl font-bold font-display ' + cls + '">' + r.successRate + '%</div></div>';
  });
}
renderCards('top5', DATA.top);
renderCards('worst5', DATA.worst);

const neonColors = ['#00FFD1','#00BFFF','#FF00FF','#39FF14','#FF1493','#FFD700','#00FF7F','#7B68EE','#FF6347','#00CED1'];
const lightColors = ['#059669','#0284c7','#9333ea','#16a34a','#db2777','#d97706','#0d9488','#6d28d9','#dc2626','#0891b2'];
let availChartInst, ttfbChartInst;

function getChartOpts() {
  const d = isDark();
  return {
    responsive: true,
    plugins: { legend: { labels: { color: d ? '#94a3b8' : '#64748b', font: { family: 'Fira Code', size: 11 } } } },
    scales: {
      x: { ticks: { color: d ? '#64748b' : '#94a3b8' }, grid: { color: d ? 'rgba(0, 255, 209, 0.05)' : '#f1f5f9' } },
      y: { ticks: { color: d ? '#64748b' : '#94a3b8' }, grid: { color: d ? 'rgba(0, 255, 209, 0.05)' : '#f1f5f9' } },
    },
  };
}

function makeChart(canvasId, datasets) {
  const c = isDark() ? neonColors : lightColors;
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: DATA.days,
      datasets: datasets.map((ds, i) => ({
        label: ds.label, data: ds.data,
        borderColor: c[i % c.length],
        backgroundColor: 'transparent',
        tension: 0.3, pointRadius: 4, borderWidth: 2,
      })),
    },
    options: getChartOpts(),
  });
}

function updateCharts() {
  const c = isDark() ? neonColors : lightColors;
  [availChartInst, ttfbChartInst].forEach(chart => {
    if (!chart) return;
    chart.data.datasets.forEach((ds, i) => { ds.borderColor = c[i % c.length]; });
    Object.assign(chart.options, getChartOpts());
    chart.update();
  });
}

availChartInst = makeChart('availChart', DATA.availabilityData);
ttfbChartInst = makeChart('ttfbChart', DATA.ttfbData);

if (DATA.lastMeasurement) {
  const ltbody = document.querySelector('#latest tbody');
  DATA.lastMeasurement.results.forEach(r => {
    const cls = r.status === 'ok' ? 'ok' : 'fail';
    const icon = r.status === 'ok' ? svgOk : svgFail;
    ltbody.innerHTML += '<tr class="transition-colors duration-150 dark:hover:bg-neon-cyan/5 hover:bg-teal-50"><td class="font-medium">' + r.name + '</td><td>' + icon + '</td><td>' + r.ttfb_ms + 'ms</td><td>' + r.speed_1mb_kbps + ' KB/s</td><td>' + (r.speed_10mb_kbps != null ? r.speed_10mb_kbps + ' KB/s' : '\\u2014') + '</td></tr>';
  });
}

document.querySelectorAll('#summary th').forEach((th, i) => {
  th.addEventListener('click', () => {
    const tbody = th.closest('table').querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];
    const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
    th.dataset.dir = dir;
    rows.sort((a, b) => {
      const av = a.children[i].textContent;
      const bv = b.children[i].textContent;
      const an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return dir === 'asc' ? an - bn : bn - an;
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(r => tbody.appendChild(r));
  });
});
${scriptEnd}
</body>
</html>`;
}
