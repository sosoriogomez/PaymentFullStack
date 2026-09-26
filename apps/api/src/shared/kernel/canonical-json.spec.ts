import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('should produce the same text regardless of key order', () => {
    const a = canonicalJson({ b: 1, a: { d: [1, { z: true, y: null }], c: 'x' } });
    const b = canonicalJson({ a: { c: 'x', d: [1, { y: null, z: true }] }, b: 1 });

    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":"x","d":[1,{"y":null,"z":true}]},"b":1}');
  });

  it('should drop undefined properties', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('should serialize primitives', () => {
    expect(canonicalJson('text')).toBe('"text"');
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('canonicalJson with sparse arrays', () => {
  it('should serialize undefined array items as null, like JSON.stringify', () => {
    expect(canonicalJson([1, undefined] as never)).toBe('[1,null]');
  });
});
