import { MAX_PHOTO_SIDE, planPhoto } from './photo-plan';

const photo = (mimeType: string | null, width = 3024, height = 4032) => ({
  uri: 'file:///photo',
  width,
  height,
  mimeType,
});

describe('planPhoto', () => {
  it('uses JPEG, PNG and WebP photos of a normal size untouched', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG']) {
      expect(planPhoto(photo(type))).toEqual({ kind: 'original' });
    }
  });

  it('re-encodes HEIC, HEIF and unknown types without resizing them', () => {
    for (const type of ['image/heic', 'image/heif', null]) {
      expect(planPhoto(photo(type))).toEqual({ kind: 'reencode', resize: null });
    }
  });

  it('shrinks very large photos along their longest side', () => {
    // 48 MP portrait and landscape photos.
    expect(planPhoto(photo('image/heic', 6048, 8064))).toEqual({
      kind: 'reencode',
      resize: { height: MAX_PHOTO_SIDE },
    });
    expect(planPhoto(photo('image/jpeg', 8064, 6048))).toEqual({
      kind: 'reencode',
      resize: { width: MAX_PHOTO_SIDE },
    });
  });

  it('keeps photos exactly at the limit', () => {
    expect(planPhoto(photo('image/jpeg', MAX_PHOTO_SIDE, 3072))).toEqual({ kind: 'original' });
  });

  it('re-encodes on demand after a failed decode', () => {
    expect(planPhoto(photo('image/jpeg'), true)).toEqual({ kind: 'reencode', resize: null });
  });
});
