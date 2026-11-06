import { exportEncoding } from '@/core/export';

jest.mock('@shopify/react-native-skia', () => ({
  ColorSpace: { SRGB: 'srgb', DisplayP3: 'display-p3' },
  ImageFormat: { JPEG: 3, PNG: 4 },
}));
jest.mock('expo-file-system', () => ({}));
jest.mock('./export-scene', () => ({}));

/** `exportColorSpace` as on a phone of `os`. */
function onPhone(os: string) {
  let colorSpaceOf: typeof import('./export-image').exportColorSpace = () => 'srgb';
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    ({ exportColorSpace: colorSpaceOf } =
      jest.requireActual<typeof import('./export-image')>('./export-image'));
  });
  return colorSpaceOf;
}

describe("an exported image's color space", () => {
  it("is the screen's for a JPEG, so it looks as it was edited: P3 on the iPhone", () => {
    expect(onPhone('ios')(exportEncoding(true))).toBe('display-p3');
    expect(onPhone('android')(exportEncoding(true))).toBe('srgb');
  });

  it("is sRGB for a PNG, whose P3 profile from Skia Instagram doesn't read", () => {
    expect(onPhone('ios')(exportEncoding(false))).toBe('srgb');
    expect(onPhone('android')(exportEncoding(false))).toBe('srgb');
  });
});
