import { execFile } from 'node:child_process';
import { logger } from './logger.js';

const TTFB_URL = 'https://www.google.com';
const SPEED_1MB_URL = 'https://speed.cloudflare.com/__down?bytes=1000000';
const SPEED_10MB_URL = 'https://speed.cloudflare.com/__down?bytes=10000000';

export function parseCurlOutput(stdout) {
  const parts = stdout.trim().split(',');
  return {
    http_code: parseInt(parts[0], 10) || 0,
    ttfb_ms: Math.round((parseFloat(parts[1]) || 0) * 1000),
    total_ms: Math.round((parseFloat(parts[2]) || 0) * 1000),
  };
}

function curlExec(proxy, url, maxTime) {
  return new Promise((resolve) => {
    execFile('curl', [
      '-s', '-o', '/dev/null',
      '-w', '%{http_code},%{time_starttransfer},%{time_total}',
      '--proxy', proxy,
      '--connect-timeout', '10',
      '--max-time', String(maxTime),
      url,
    ], { timeout: (maxTime + 5) * 1000 }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function curlText(proxy, url, maxTime) {
  return new Promise((resolve) => {
    execFile('curl', [
      '-s',
      '--proxy', proxy,
      '--connect-timeout', '10',
      '--max-time', String(maxTime),
      url,
    ], { timeout: (maxTime + 5) * 1000 }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim() || null);
      }
    });
  });
}

function curlSpeed(proxy, url, maxTime) {
  return new Promise((resolve) => {
    execFile('curl', [
      '-s', '-o', '/dev/null',
      '-w', '%{speed_download}',
      '--proxy', proxy,
      '--connect-timeout', '10',
      '--max-time', String(maxTime),
      url,
    ], { timeout: (maxTime + 5) * 1000 }, (error, stdout) => {
      if (error) {
        resolve(0);
      } else {
        resolve(Math.round(parseFloat(stdout.trim() || '0') / 1024));
      }
    });
  });
}

export async function runPool(tasks, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function testProxies(proxies, mode = 'light') {
  const time = new Date().toISOString();
  logger.info(`Starting ${mode} test for ${proxies.length} proxies`);

  const tasks = proxies.map((p) => async () => {
    const ttfbRaw = await curlExec(p.proxy, TTFB_URL, 15);
    let ttfb = ttfbRaw ? parseCurlOutput(ttfbRaw) : null;

    const speed1mb = await curlSpeed(p.proxy, SPEED_1MB_URL, 30);

    let speed10mb = null;
    if (mode === 'heavy') {
      speed10mb = await curlSpeed(p.proxy, SPEED_10MB_URL, 60);
    }

    const exitIp = await curlText(p.proxy, 'https://ifconfig.me', 10);

    const ok = ttfb && ttfb.http_code === 200;

    return {
      name: p.name,
      transport: p.transport,
      proxy: p.proxy,
      status: ok ? 'ok' : 'fail',
      http_code: ttfb?.http_code || 0,
      ttfb_ms: ttfb?.ttfb_ms || 0,
      total_ms: ttfb?.total_ms || 0,
      speed_1mb_kbps: ok ? speed1mb : 0,
      speed_10mb_kbps: speed10mb,
      exit_ip: exitIp,
    };
  });

  const results = await runPool(tasks, 10);
  const okCount = results.filter(r => r.status === 'ok').length;
  logger.info(`Test complete: ${okCount}/${results.length} ok`);

  return { time, type: mode, results };
}
