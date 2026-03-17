import fs from 'node:fs';
import path from 'node:path';

function dateFromISO(isoString) {
  return isoString.slice(0, 10);
}

export function createStorage(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });

  return {
    append(measurement) {
      const dateStr = dateFromISO(measurement.time);
      const file = path.join(dataDir, `${dateStr}.json`);

      let data = [];
      if (fs.existsSync(file)) {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
      }
      data.push(measurement);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    },

    readDays(n) {
      const files = fs.readdirSync(dataDir)
        .filter(f => f.endsWith('.json') && f !== 'ip-history.json')
        .sort()
        .slice(-n);

      const measurements = [];
      for (const f of files) {
        const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
        measurements.push(...JSON.parse(content));
      }
      return measurements.sort((a, b) => a.time.localeCompare(b.time));
    },

    cleanup(referenceDate = new Date()) {
      const cutoff7 = new Date(referenceDate);
      cutoff7.setDate(cutoff7.getDate() - 7);
      const cutoffStr = cutoff7.toISOString().slice(0, 10);

      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'ip-history.json');
      for (const f of files) {
        const dateStr = f.replace('.json', '');
        if (dateStr < cutoffStr) {
          fs.unlinkSync(path.join(dataDir, f));
        }
      }

      const ipFile = path.join(dataDir, 'ip-history.json');
      if (fs.existsSync(ipFile)) {
        const cutoff2m = new Date(referenceDate);
        cutoff2m.setMonth(cutoff2m.getMonth() - 2);
        const history = JSON.parse(fs.readFileSync(ipFile, 'utf8'));
        for (const name of Object.keys(history)) {
          history[name] = history[name].filter(e => new Date(e.since) >= cutoff2m);
          if (history[name].length === 0) delete history[name];
        }
        fs.writeFileSync(ipFile, JSON.stringify(history, null, 2));
      }
    },

    updateIpHistory(results) {
      const ipFile = path.join(dataDir, 'ip-history.json');
      let history = {};
      if (fs.existsSync(ipFile)) {
        history = JSON.parse(fs.readFileSync(ipFile, 'utf8'));
      }

      const now = new Date().toISOString();
      for (const r of results) {
        if (!r.exit_ip) continue;
        if (!history[r.name]) history[r.name] = [];
        const entries = history[r.name];
        const lastIp = entries.length > 0 ? entries[entries.length - 1].ip : null;
        if (r.exit_ip !== lastIp) {
          entries.push({ ip: r.exit_ip, since: now });
        }
      }

      fs.writeFileSync(ipFile, JSON.stringify(history, null, 2));
    },

    getIpChanges() {
      const ipFile = path.join(dataDir, 'ip-history.json');
      if (!fs.existsSync(ipFile)) return {};
      const history = JSON.parse(fs.readFileSync(ipFile, 'utf8'));
      const changes = {};
      for (const [name, entries] of Object.entries(history)) {
        changes[name] = Math.max(0, entries.length - 1);
      }
      return changes;
    },
  };
}
