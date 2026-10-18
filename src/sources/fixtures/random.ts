/** A source of random numbers in [0, 1), like `Math.random`. */
export type Random = () => number;

/**
 * Mulberry32: a small, fast 32-bit seeded PRNG, good enough for test data (not cryptography).
 * Source: Tommy Ettinger, public domain:
 * https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
