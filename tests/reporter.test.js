import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDaily, buildTopWorst, generateHTML } from '../src/reporter.js';

const fakeMeasurements = [
  {
    time: '2026-03-17T09:00:00Z', type: 'light',
    results: [
      { name: 'A', transport: 'tcp', status: 'ok', ttfb_ms: 300, speed_1mb_kbps: 900, speed_10mb_kbps: null },
      { name: 'B', transport: 'xhttp', status: 'fail', ttfb_ms: 0, speed_1mb_kbps: 0, speed_10mb_kbps: null },
    ],
  },
  {
    time: '2026-03-17T09:30:00Z', type: 'light',
    results: [
      { name: 'A', transport: 'tcp', status: 'ok', ttfb_ms: 400, speed_1mb_kbps: 800, speed_10mb_kbps: null },
      { name: 'B', transport: 'xhttp', status: 'ok', ttfb_ms: 500, speed_1mb_kbps: 700, speed_10mb_kbps: null },
    ],
  },
];

describe('aggregateDaily', () => {
  it('computes daily stats per proxy', () => {
    const daily = aggregateDaily(fakeMeasurements);
    const dayA = daily['2026-03-17']['A'];
    assert.equal(dayA.successRate, 100);
    assert.equal(dayA.avgTtfb, 350);
    assert.equal(dayA.tests, 2);
  });

  it('computes success rate correctly', () => {
    const daily = aggregateDaily(fakeMeasurements);
    const dayB = daily['2026-03-17']['B'];
    assert.equal(dayB.successRate, 50);
  });
});

describe('buildTopWorst', () => {
  it('returns top and worst by success rate', () => {
    const daily = aggregateDaily(fakeMeasurements);
    const { top, worst } = buildTopWorst(daily, '2026-03-17');
    assert.equal(top[0].name, 'A');
    assert.equal(worst[0].name, 'B');
  });
});

describe('generateHTML', () => {
  it('produces valid HTML string', () => {
    const html = generateHTML(fakeMeasurements);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('chart.js'));
    assert.ok(html.includes('const DATA ='));
  });
});
