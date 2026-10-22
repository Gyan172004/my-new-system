import { createHash } from 'node:crypto';
import { PACK_LIMITS } from './pack-schema';

/** Safe diagnostics never interpolate authored keys, values or dependency errors. */
export class PackJsonFailure extends Error {
  readonly path = 'bundle';
  constructor(readonly code: string) {
    super(code);
    this.name = 'PackJsonFailure';
  }
}
function fail(code = 'invalid_json'): never {
  throw new PackJsonFailure(code);
}
function validString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0) fail('invalid_unicode');
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('invalid_unicode');
    } else if (c >= 0xdc00 && c <= 0xdfff) fail('invalid_unicode');
  }
}
/** Token checks precede native parsing, so unsafe integer spellings cannot round. */
export function parsePackJson(raw: Uint8Array | string): unknown {
  let source: string;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > PACK_LIMITS.bundle) fail('pack_too_large');
    validString(raw);
    source = raw;
  } else {
    if (raw.byteLength > PACK_LIMITS.bundle) fail('pack_too_large');
    try {
      source = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(raw);
    } catch {
      fail('invalid_utf8');
    }
  }
  let offset = 0;
  const whitespace = () => {
    while (offset < source.length && ' \t\n\r'.includes(source[offset]!))
      offset++;
  };
  const stringToken = (): string => {
    const start = offset++;
    while (offset < source.length) {
      const c = source.charCodeAt(offset++);
      if (c === 34) {
        let decoded: unknown;
        try {
          decoded = JSON.parse(source.slice(start, offset));
        } catch {
          fail();
        }
        if (typeof decoded !== 'string') fail();
        validString(decoded);
        return decoded;
      }
      if (c < 32) fail();
      if (c === 92) {
        if (offset >= source.length) fail();
        offset++;
      }
    }
    return fail();
  };
  const value = (depth: number): void => {
    whitespace();
    const c = source[offset];
    if (c === '{' || c === '[') {
      if (depth > PACK_LIMITS.depth) fail('pack_too_deep');
      const object = c === '{',
        close = object ? '}' : ']',
        keys = new Set<string>();
      offset++;
      whitespace();
      if (source[offset] === close) {
        offset++;
        return;
      }
      while (true) {
        if (object) {
          if (source[offset] !== '"') fail();
          const key = stringToken();
          if (keys.has(key)) fail('duplicate_key');
          keys.add(key);
          whitespace();
          if (source[offset++] !== ':') fail();
        }
        value(depth + 1);
        whitespace();
        const separator = source[offset++];
        if (separator === close) return;
        if (separator !== ',') fail();
        whitespace();
      }
    }
    if (c === '"') {
      stringToken();
      return;
    }
    for (const literal of ['true', 'false', 'null'])
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
      const start = offset;
      while (offset < source.length && !' \t\n\r,}]'.includes(source[offset]!))
        offset++;
      const token = source.slice(start, offset);
      if (
        token.length > 17 ||
        !/^-?(0|[1-9][0-9]*)$/.test(token) ||
        token === '-0'
      )
        fail('invalid_number');
      const number = BigInt(token);
      if (number < -9007199254740991n || number > 9007199254740991n)
        fail('invalid_number');
      return;
    }
    fail();
  };
  value(1);
  whitespace();
  if (offset !== source.length) fail();
  try {
    return JSON.parse(source);
  } catch {
    return fail();
  }
}

/** Project pack-json-v1 encoding; object keys use ECMAScript UTF-16 ordering. */
export function canonicalizePack(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (item: unknown, depth: number): string => {
    if (item === null) return 'null';
    if (typeof item === 'string') {
      validString(item);
      return JSON.stringify(item);
    }
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || Object.is(item, -0))
        fail('invalid_number');
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') fail('invalid_json_value');
    if (depth > PACK_LIMITS.depth) fail('pack_too_deep');
    if (ancestors.has(item)) fail('invalid_json_value');
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null)
      fail('invalid_json_value');
    ancestors.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Reflect.ownKeys(descriptors).some((k) => typeof k === 'symbol'))
        fail('invalid_json_value');
      for (const descriptor of Object.values(descriptors))
        if (descriptor.get || descriptor.set) fail('invalid_json_value');
      if (Array.isArray(item)) {
        if (
          Object.keys(descriptors).length !== item.length + 1 ||
          Object.keys(item).length !== item.length
        )
          fail('invalid_json_value');
        return (
          '[' +
          Array.from({ length: item.length }, (_, i) =>
            encode(descriptors[String(i)]?.value, depth + 1),
          ).join(',') +
          ']'
        );
      }
      return (
        '{' +
        Object.keys(descriptors)
          .sort()
          .map((key) => {
            validString(key);
            const descriptor = descriptors[key]!;
            if (!descriptor.enumerable) fail('invalid_json_value');
            return (
              JSON.stringify(key) + ':' + encode(descriptor.value, depth + 1)
            );
          })
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(item);
    }
  };
  return encode(value, 1);
}
export function checksumPack(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizePack(value), 'utf8')
    .digest('hex');
}
