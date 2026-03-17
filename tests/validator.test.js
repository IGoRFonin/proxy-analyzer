import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validator.js';

describe('validate', () => {
  it('parses valid proxies', () => {
    const input = 'tcp|finland-tcp|http://192.168.31.102:3084\nxhttp|sweden-1|http://10.0.0.1:3085';
    const result = validate(input);
    assert.equal(result.ok, true);
    assert.equal(result.proxies.length, 2);
    assert.deepEqual(result.proxies[0], {
      transport: 'tcp',
      name: 'finland-tcp',
      proxy: 'http://192.168.31.102:3084',
    });
  });

  it('skips comments and empty lines', () => {
    const input = '# comment\n\ntcp|test-1|http://1.2.3.4:80\n';
    const result = validate(input);
    assert.equal(result.ok, true);
    assert.equal(result.proxies.length, 1);
  });

  it('rejects invalid transport', () => {
    const input = 'ftp|bad|http://1.2.3.4:80';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('invalid transport'));
  });

  it('rejects invalid name characters', () => {
    const input = 'tcp|bad name!|http://1.2.3.4:80';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('invalid name'));
  });

  it('rejects duplicate names', () => {
    const input = 'tcp|dup|http://1.2.3.4:80\nxhttp|dup|http://1.2.3.4:81';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('duplicate name')));
  });

  it('rejects duplicate urls', () => {
    const input = 'tcp|a|http://1.2.3.4:80\nxhttp|b|http://1.2.3.4:80';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('duplicate url')));
  });

  it('rejects url without protocol', () => {
    const input = 'tcp|bad|192.168.1.1:80';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('invalid url'));
  });

  it('rejects empty proxy list', () => {
    const input = '# only comments\n\n';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('at least one proxy'));
  });

  it('rejects malformed lines', () => {
    const input = 'tcp|only-two-fields';
    const result = validate(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes('expected 3 fields'));
  });
});
