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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proxy Analyzer</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e1e4e8; padding: 20px; }
  h1 { margin-bottom: 8px; }
  .meta { color: #8b949e; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
  th { cursor: pointer; color: #8b949e; font-weight: 600; }
  th:hover { color: #e1e4e8; }
  .ok { color: #3fb950; }
  .warn { color: #d29922; }
  .fail { color: #f85149; }
  .chart-container { max-width: 900px; margin: 0 auto 32px; }
  .section { margin-bottom: 32px; }
  .section h2 { margin-bottom: 12px; color: #8b949e; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  .cards { display: flex; gap: 16px; flex-wrap: wrap; }
  .card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 12px 16px; min-width: 160px; }
  .card .name { font-weight: 600; margin-bottom: 4px; }
  .card .stat { font-size: 24px; font-weight: 700; }
</style>
</head>
<body>
<h1>Proxy Analyzer</h1>
<p class="meta">Updated: <span id="updated"></span> | Proxies: <span id="count"></span></p>

<div class="section">
  <h2>Today's Summary</h2>
  <table id="summary">
    <thead>
      <tr><th>Name</th><th>Transport</th><th>Success %</th><th>Avg TTFB</th><th>P95 TTFB</th><th>Avg 1MB</th><th>10MB</th><th>IP Changes</th><th>Status</th></tr>
    </thead>
    <tbody></tbody>
  </table>
</div>

<div class="section">
  <h2>Top 5</h2>
  <div class="cards" id="top5"></div>
</div>

<div class="section">
  <h2>Worst 5</h2>
  <div class="cards" id="worst5"></div>
</div>

<div class="section">
  <h2>Availability (7 days)</h2>
  <div class="chart-container"><canvas id="availChart"></canvas></div>
</div>

<div class="section">
  <h2>TTFB (7 days)</h2>
  <div class="chart-container"><canvas id="ttfbChart"></canvas></div>
</div>

<div class="section">
  <h2>Latest Measurement</h2>
  <table id="latest">
    <thead><tr><th>Name</th><th>Status</th><th>TTFB</th><th>1MB Speed</th><th>10MB Speed</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<script>
const DATA = ${JSON.stringify(DATA)};

document.getElementById('updated').textContent = new Date(DATA.generatedAt).toLocaleString();
document.getElementById('count').textContent = DATA.proxyCount;

const tbody = document.querySelector('#summary tbody');
DATA.tableRows.forEach(r => {
  const statusClass = (r.successRate ?? 0) > 90 ? 'ok' : (r.successRate ?? 0) > 50 ? 'warn' : 'fail';
  const statusIcon = statusClass === 'ok' ? '\\u2705' : statusClass === 'warn' ? '\\u26A0\\uFE0F' : '\\u274C';
  const ipChanges = DATA.ipChanges[r.name] ?? 0;
  tbody.innerHTML += '<tr><td>' + (r.name||'') + '</td><td>' + (r.transport||'') + '</td><td class="' + statusClass + '">' + (r.successRate??0) + '%</td><td>' + (r.avgTtfb??0) + 'ms</td><td>' + (r.p95Ttfb??0) + 'ms</td><td>' + (r.avgSpeed1mb??0) + ' KB/s</td><td>' + (r.latestSpeed10mb != null ? r.latestSpeed10mb + ' KB/s' : '\\u2014') + '</td><td>' + ipChanges + '</td><td>' + statusIcon + '</td></tr>';
});

function renderCards(containerId, items) {
  const el = document.getElementById(containerId);
  items.forEach(r => {
    const cls = r.successRate > 90 ? 'ok' : r.successRate > 50 ? 'warn' : 'fail';
    el.innerHTML += '<div class="card"><div class="name">' + r.name + '</div><div class="stat ' + cls + '">' + r.successRate + '%</div><div>' + r.avgTtfb + 'ms / ' + r.avgSpeed1mb + ' KB/s</div></div>';
  });
}
renderCards('top5', DATA.top);
renderCards('worst5', DATA.worst);

const colors = ['#3fb950','#58a6ff','#d29922','#f85149','#bc8cff','#39d2c0','#ff7b72','#79c0ff','#ffa657','#f778ba'];

function makeChart(canvasId, datasets, label) {
  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: DATA.days,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: colors[i % colors.length],
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8b949e' } } },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
      },
    },
  });
}
makeChart('availChart', DATA.availabilityData, 'Success %');
makeChart('ttfbChart', DATA.ttfbData, 'TTFB ms');

if (DATA.lastMeasurement) {
  const ltbody = document.querySelector('#latest tbody');
  DATA.lastMeasurement.results.forEach(r => {
    const cls = r.status === 'ok' ? 'ok' : 'fail';
    ltbody.innerHTML += '<tr><td>' + r.name + '</td><td class="' + cls + '">' + r.status + '</td><td>' + r.ttfb_ms + 'ms</td><td>' + r.speed_1mb_kbps + ' KB/s</td><td>' + (r.speed_10mb_kbps != null ? r.speed_10mb_kbps + ' KB/s' : '\\u2014') + '</td></tr>';
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
</script>
</body>
</html>`;
}
