import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  parsePackJson,
  canonicalizePack,
  checksumPack,
} from '../../../src/modules/content-publishing/domain/checksum';

describe('pack-json-v1', () => {
  it('uses an independent literal vector, UTF-16 order, preserved arrays and no normalization', () => {
    const value = { '\ue000': 1, '😀': 2, z: [3, 1], a: { y: 2, x: 1 } };
    const canonical = '{"a":{"x":1,"y":2},"z":[3,1],"😀":2,"":1}';
    expect(canonicalizePack(value)).toBe(canonical);
    expect(checksumPack(value)).toBe(
      createHash('sha256').update(canonical).digest('hex'),
    );
    expect(checksumPack({ x: 'é' })).not.toBe(checksumPack({ x: 'e\u0301' }));
    expect(checksumPack({ a: 1, b: 2 })).toBe(checksumPack({ b: 2, a: 1 }));
    expect(checksumPack([1, 2])).not.toBe(checksumPack([2, 1]));
  });
  it('handles prototype-looking keys as own data without pollution', () => {
    const parsed = parsePackJson(
      '{"__proto__":{"polluted":true},"constructor":1,"prototype":2}',
    );
    expect(canonicalizePack(parsed)).toBe(
      '{"__proto__":{"polluted":true},"constructor":1,"prototype":2}',
    );
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it.each([
    '1.0',
    '1e0',
    '-0',
    '9007199254740992',
    '-9007199254740992',
    '99999999999999999999999999999',
    '01',
    'NaN',
    'Infinity',
  ])('rejects numeric spelling %s before parsing', (token) =>
    expect(() => parsePackJson(`{"n":${token}}`)).toThrow(),
  );
  it('allows exact integer endpoints and numeric-looking quoted prose', () =>
    expect(
      parsePackJson('[9007199254740991,-9007199254740991,"1e100",0]'),
    ).toEqual([9007199254740991, -9007199254740991, '1e100', 0]));
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '"\\u0000"',
    '"\\ud800"',
    '"\\udfff"',
    '{"\\ud800":1}',
    '[1,]',
    '{"a":1,}',
    'true false',
    '"unterminated',
    '{"canary-secret":1,"canary-secret":2}',
  ])('rejects unsafe or malformed JSON safely %s', (raw) => {
    try {
      parsePackJson(raw);
      throw new Error('unexpected success');
    } catch (error) {
      expect(error).toHaveProperty('path', 'bundle');
      expect(String(error)).not.toContain('canary-secret');
    }
  });
  it('rejects invalid UTF8, unpaired JS surrogates, excessive depth and bytes', () => {
    expect(() => parsePackJson(new Uint8Array([0xc0, 0xaf]))).toThrow();
    expect(() => parsePackJson('"\ud800"')).toThrow();
    expect(() =>
      parsePackJson('['.repeat(33) + '0' + ']'.repeat(33)),
    ).toThrow();
    expect(() => parsePackJson(' '.repeat(2 * 1024 * 1024 + 1))).toThrow();
  });
  it('rejects non JSON runtime values rather than coercing or invoking getters', () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    for (const value of [
      undefined,
      NaN,
      1.5,
      -0,
      new Date(),
      () => 0,
      cycle,
      { x: undefined },
      { x: BigInt(1) },
    ])
      expect(() => canonicalizePack(value)).toThrow();
    let accessed = false;
    const value = {
      get x() {
        accessed = true;
        return 1;
      },
    };
    expect(() => canonicalizePack(value)).toThrow();
    expect(accessed).toBe(false);
  });
});

describe('cheap bounded admission', () => {
  it('rejects raw string byte size before inspecting Unicode content', () => {
    expect(() => parsePackJson(' '.repeat(2 * 1024 * 1024) + '\ud800')).toThrow(
      'pack_too_large',
    );
  });
  it('rejects nonenumerable extra array properties rather than silently omitting them', () => {
    const value = [1];
    Object.defineProperty(value, 'extra', {
      value: 'private-canary',
      enumerable: false,
    });
    expect(() => canonicalizePack(value)).toThrow('invalid_json_value');
  });
});
