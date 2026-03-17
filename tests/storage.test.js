import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStorage } from '../src/storage.js';

const TEST_DIR = '/tmp/proxy-analyzer-test-data';

describe('storage', () => {
  let storage;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    storage = createStorage(TEST_DIR);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('appends measurement to new file', () => {
    const measurement = { time: '2026-03-17T14:30:00Z', type: 'light', results: [] };
    storage.append(measurement);

    const file = path.join(TEST_DIR, '2026-03-17.json');
    assert.ok(fs.existsSync(file));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0].time, '2026-03-17T14:30:00Z');
  });

  it('appends to existing file', () => {
    const m1 = { time: '2026-03-17T09:00:00Z', type: 'heavy', results: [] };
    const m2 = { time: '2026-03-17T09:30:00Z', type: 'light', results: [] };
    storage.append(m1);
    storage.append(m2);

    const file = path.join(TEST_DIR, '2026-03-17.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.length, 2);
  });

  it('readDays returns measurements sorted by time', () => {
    const m1 = { time: '2026-03-16T10:00:00Z', type: 'light', results: [{ name: 'a' }] };
    const m2 = { time: '2026-03-17T09:00:00Z', type: 'light', results: [{ name: 'b' }] };

    fs.writeFileSync(path.join(TEST_DIR, '2026-03-16.json'), JSON.stringify([m1]));
    fs.writeFileSync(path.join(TEST_DIR, '2026-03-17.json'), JSON.stringify([m2]));

    const result = storage.readDays(7);
    assert.equal(result.length, 2);
    assert.equal(result[0].time, '2026-03-16T10:00:00Z');
    assert.equal(result[1].time, '2026-03-17T09:00:00Z');
  });

  it('readDays returns empty array when no files', () => {
    const result = storage.readDays(7);
    assert.deepEqual(result, []);
  });

  it('handles corrupt JSON file gracefully', () => {
    fs.writeFileSync(path.join(TEST_DIR, '2026-03-17.json'), 'NOT JSON');
    assert.throws(() => storage.readDays(7));
  });

  it('updateIpHistory tracks new IPs', () => {
    storage.updateIpHistory([{ name: 'A', exit_ip: '1.2.3.4' }]);
    storage.updateIpHistory([{ name: 'A', exit_ip: '1.2.3.4' }]);
    storage.updateIpHistory([{ name: 'A', exit_ip: '5.6.7.8' }]);

    const changes = storage.getIpChanges();
    assert.equal(changes['A'], 1);
  });

  it('updateIpHistory skips null exit_ip', () => {
    storage.updateIpHistory([{ name: 'A', exit_ip: null }]);
    const changes = storage.getIpChanges();
    assert.equal(changes['A'], undefined);
  });

  it('cleanup removes old files', () => {
    const old = path.join(TEST_DIR, '2026-03-01.json');
    const recent = path.join(TEST_DIR, '2026-03-17.json');
    fs.writeFileSync(old, '[]');
    fs.writeFileSync(recent, '[]');

    storage.cleanup(new Date('2026-03-17'));

    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(recent));
  });
});
