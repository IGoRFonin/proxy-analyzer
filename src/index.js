import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import { validate } from './validator.js';
import { testProxies } from './tester.js';
import { createStorage } from './storage.js';
import { generateHTML } from './reporter.js';
import { push } from './pusher.js';
import { logger } from './logger.js';


const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PROXIES_FILE = path.join(ROOT, 'proxies.txt');

// Validate proxies
const content = fs.readFileSync(PROXIES_FILE, 'utf8');
const { ok, errors, proxies } = validate(content);

if (!ok) {
  logger.error('proxies.txt validation failed:');
  errors.forEach(e => logger.error(`  ${e}`));
  process.exit(1);
}

logger.info(`Loaded ${proxies.length} proxies`);

const storage = createStorage(DATA_DIR);
let testRunning = false;

const HEAVY_HOURS = [9, 15, 22];

function isHeavyTime() {
  const now = new Date();
  return HEAVY_HOURS.includes(now.getHours()) && now.getMinutes() === 0;
}

async function runTest(mode) {
  if (testRunning) {
    logger.warn(`Skipping ${mode} test — previous still running`);
    return;
  }
  testRunning = true;
  try {
    const measurement = await testProxies(proxies, mode);
    storage.append(measurement);
    storage.updateIpHistory(measurement.results);

    // Regenerate HTML
    const allData = storage.readDays(7);
    const ipChanges = storage.getIpChanges();
    const html = generateHTML(allData, ipChanges);
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), html);
    logger.info('HTML report regenerated');
  } catch (err) {
    logger.error(`Test error: ${err.message}`);
  } finally {
    testRunning = false;
  }
}

// Light test every 30 min (skip if heavy time)
cron.schedule('*/30 * * * *', () => {
  if (isHeavyTime()) {
    logger.info('Light test skipped — heavy test scheduled');
    return;
  }
  runTest('light');
});

// Heavy test 3x daily
cron.schedule('0 9,15,22 * * *', () => {
  runTest('heavy');
});

// Sync data to Coolify server hourly at :05
cron.schedule('5 * * * *', () => {
  push(ROOT);
});

// Cleanup daily at 3:00
cron.schedule('0 3 * * *', () => {
  storage.cleanup();
  logger.info('Old data cleaned up');
});

logger.info('Proxy Analyzer started');

// Run initial light test on startup
runTest('light');
