import type { LatLng } from './geo';

/**
 * Encoded Polyline Algorithm Format, used by Strava for `map.summary_polyline`.
 *
 * Idea: each coordinate is rounded to `precision` decimals and stored as the delta from the
 * previous point. Each delta is zigzag-encoded (sign moved to the lowest bit), split into 5-bit
 * chunks from least significant, each chunk ORed with 0x20 when more follow, and offset by 63 to
 * land in printable ASCII.
 *
 * Source: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 * Time O(n) in the length of the string (decode) or number of points (encode); space O(n).
 */

const CHUNK_BITS = 5;
const CHUNK_MASK = 0x1f;
const CONTINUATION = 0x20;
const ASCII_OFFSET = 63;

/**
 * Decodes an encoded polyline into points.
 *
 * @param encoded - Encoded polyline; an empty string yields no points.
 * @param precision - Decimal places of the encoding (5 for Strava and Google).
 * @throws Error if the string is truncated or contains characters outside the format.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const latStep = decodeValue(encoded, index);
    const lngStep = decodeValue(encoded, latStep.next);
    index = lngStep.next;
    lat += latStep.value;
    lng += lngStep.value;
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

function decodeValue(encoded: string, start: number) {
  let result = 0;
  let multiplier = 1;
  let index = start;
  let chunk: number;
  do {
    if (index >= encoded.length) {
      throw new Error(`Malformed polyline: value starting at index ${start} is truncated`);
    }
    chunk = encoded.charCodeAt(index) - ASCII_OFFSET;
    if (chunk < 0 || chunk > 63) {
      throw new Error(`Malformed polyline: invalid character at index ${index}`);
    }
    index++;
    // Multiplication instead of bit shifts: shifts overflow 32-bit integers for large values.
    result += (chunk & CHUNK_MASK) * multiplier;
    multiplier *= 2 ** CHUNK_BITS;
  } while (chunk >= CONTINUATION);
  // Undo the zigzag encoding: odd numbers are negative.
  const value = result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  return { value, next: index };
}

/**
 * Encodes points as a polyline. Inverse of {@link decodePolyline} up to `precision` rounding.
 *
 * @param points - Points to encode.
 * @param precision - Decimal places to keep (5 for Strava and Google).
 */
export function encodePolyline(points: readonly LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let encoded = '';
  let previousLat = 0;
  let previousLng = 0;
  for (const [lat, lng] of points) {
    const roundedLat = Math.round(lat * factor);
    const roundedLng = Math.round(lng * factor);
    encoded += encodeValue(roundedLat - previousLat) + encodeValue(roundedLng - previousLng);
    previousLat = roundedLat;
    previousLng = roundedLng;
  }
  return encoded;
}

function encodeValue(value: number): string {
  let remaining = value < 0 ? -2 * value - 1 : 2 * value;
  let encoded = '';
  while (remaining >= CONTINUATION) {
    encoded += String.fromCharCode(((remaining & CHUNK_MASK) | CONTINUATION) + ASCII_OFFSET);
    remaining = Math.floor(remaining / 2 ** CHUNK_BITS);
  }
  return encoded + String.fromCharCode(remaining + ASCII_OFFSET);
}
