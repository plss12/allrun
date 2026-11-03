import { EDITOR_MAX_SIDE, EXPORT_MAX_SIDE, mimeTypeOf, planPhoto } from './photo-plan';

const photo = (mimeType: string | null, width = 1536, height = 2048) => ({
  uri: 'file:///photo',
  width,
  height,
  mimeType,
});

describe('mimeTypeOf', () => {
  it('reads what Skia decodes, and what it has to re-encode', () => {
    expect(mimeTypeOf('file:///a/IMG_1.JPG')).toBe('image/jpeg');
    expect(mimeTypeOf('file:///a/FullSizeRender.jpeg')).toBe('image/jpeg');
    expect(mimeTypeOf('file:///a/b.png')).toBe('image/png');
    expect(mimeTypeOf('file:///a/b.webp')).toBe('image/webp');
    expect(mimeTypeOf('file:///a/IMG_2.HEIC')).toBe('image/heic');
    expect(mimeTypeOf('file:///a/b.heif')).toBe('image/heif');
  });

  it('ignores what follows the file name', () => {
    expect(mimeTypeOf('file:///a/b.png?version=2#x')).toBe('image/png');
  });

  it('knows nothing of other files, or of none', () => {
    expect(mimeTypeOf('file:///a/b.gif')).toBeNull();
    expect(mimeTypeOf('ph://ABC/L0/001')).toBeNull();
  });
});

describe('planPhoto', () => {
  it('uses JPEG, PNG and WebP photos within the size limit untouched', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG']) {
      expect(planPhoto(photo(type), EDITOR_MAX_SIDE)).toEqual({ kind: 'original' });
    }
  });

  it('re-encodes HEIC, HEIF and unknown types without resizing them when small enough', () => {
    for (const type of ['image/heic', 'image/heif', null]) {
      expect(planPhoto(photo(type), EDITOR_MAX_SIDE)).toEqual({ kind: 'reencode', resize: null });
    }
  });

  it('shrinks a 12 MP photo for the editor but keeps it whole for export', () => {
    const twelveMegapixels = photo('image/jpeg', 3024, 4032);
    expect(planPhoto(twelveMegapixels, EDITOR_MAX_SIDE)).toEqual({
      kind: 'reencode',
      resize: { height: EDITOR_MAX_SIDE },
    });
    expect(planPhoto(twelveMegapixels, EXPORT_MAX_SIDE)).toEqual({ kind: 'original' });
  });

  it('shrinks very large photos along their longest side', () => {
    expect(planPhoto(photo('image/heic', 8064, 6048), EXPORT_MAX_SIDE)).toEqual({
      kind: 'reencode',
      resize: { width: EXPORT_MAX_SIDE },
    });
  });

  it('keeps photos exactly at the limit', () => {
    expect(planPhoto(photo('image/jpeg', 1536, EDITOR_MAX_SIDE), EDITOR_MAX_SIDE)).toEqual({
      kind: 'original',
    });
  });

  it('re-encodes on demand after a failed decode', () => {
    expect(planPhoto(photo('image/jpeg'), EDITOR_MAX_SIDE, true)).toEqual({
      kind: 'reencode',
      resize: null,
    });
  });
});
