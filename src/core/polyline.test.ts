import { decodePolyline, encodePolyline } from './polyline';

// Worked example from Google's polyline algorithm documentation.
const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const GOOGLE_POINTS = [
  [38.5, -120.2],
  [40.7, -120.95],
  [43.252, -126.453],
] as const;

describe('decodePolyline', () => {
  it('decodes the documented example', () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual(GOOGLE_POINTS);
  });

  it('returns no points for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('rejects truncated input', () => {
    // Drop the last character so the final longitude is cut mid-value.
    expect(() => decodePolyline(GOOGLE_EXAMPLE.slice(0, -1))).toThrow(/truncated/);
  });

  it('rejects characters outside the format', () => {
    expect(() => decodePolyline('_p~iF ~ps|U')).toThrow(/invalid character/);
  });
});

describe('encodePolyline', () => {
  it('encodes the documented example', () => {
    expect(encodePolyline(GOOGLE_POINTS)).toBe(GOOGLE_EXAMPLE);
  });

  it('round-trips points in every hemisphere, rounded to 5 decimals', () => {
    const points = [
      [55.676_123, 12.568_337],
      [-33.868_82, 151.209_29],
      [-0.000_01, -179.999_99],
      [89.999_99, 0],
    ] as const;
    const decoded = decodePolyline(encodePolyline(points));
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(points[i][0], 5);
      expect(lng).toBeCloseTo(points[i][1], 5);
    });
  });
});
