import { normalizeAngle, snapAngle } from './angles';

describe('normalizeAngle', () => {
  it('maps any angle into (-π, π]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normalizeAngle(-5 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('snapAngle', () => {
  const threshold = 0.05;

  it('snaps to straight angles, including upside down', () => {
    expect(snapAngle(0.03, threshold)).toEqual({ angle: 0, snapped: true });
    expect(snapAngle(Math.PI / 2 - 0.02, threshold).angle).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(snapAngle(-Math.PI + 0.01, threshold).angle)).toBeCloseTo(Math.PI);
  });

  it('leaves other angles alone, normalized', () => {
    expect(snapAngle(0.4, threshold)).toEqual({ angle: 0.4, snapped: false });
    expect(snapAngle(2 * Math.PI + 0.4, threshold).angle).toBeCloseTo(0.4);
  });
});
