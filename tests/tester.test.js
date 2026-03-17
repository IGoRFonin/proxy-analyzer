import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurlOutput, runPool } from '../src/tester.js';

describe('parseCurlOutput', () => {
  it('parses successful TTFB result', () => {
    const result = parseCurlOutput('200,0.340,0.520');
    assert.deepEqual(result, { http_code: 200, ttfb_ms: 340, total_ms: 520 });
  });

  it('handles zero values', () => {
    const result = parseCurlOutput('0,0.000,0.000');
    assert.deepEqual(result, { http_code: 0, ttfb_ms: 0, total_ms: 0 });
  });

  it('handles non-200 codes', () => {
    const result = parseCurlOutput('503,1.200,2.500');
    assert.equal(result.http_code, 503);
  });

  it('handles malformed input gracefully', () => {
    const result = parseCurlOutput('');
    assert.equal(Number.isNaN(result.http_code), false);
  });

  it('handles partial output', () => {
    const result = parseCurlOutput('200');
    assert.equal(result.http_code, 200);
    assert.equal(result.ttfb_ms, 0);
  });
});

describe('runPool', () => {
  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let current = 0;

    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      await new Promise(r => setTimeout(r, 10));
      current--;
      return i;
    });

    const results = await runPool(tasks, 5);
    assert.equal(results.length, 20);
    assert.ok(maxConcurrent <= 5, `maxConcurrent was ${maxConcurrent}`);
  });
});
