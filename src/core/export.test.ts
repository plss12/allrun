import {
  exportEncoding,
  exportFileName,
  JPEG_QUALITY,
  STICKER_MAX_SIDE,
  STICKER_ROOM,
  stickerPlan,
} from './export';

describe('exportEncoding', () => {
  it('saves an opaque design as a high-quality JPEG', () => {
    expect(exportEncoding(true)).toMatchObject({
      format: 'jpeg',
      quality: JPEG_QUALITY,
      extension: 'jpg',
      mimeType: 'image/jpeg',
      uti: 'public.jpeg',
    });
  });

  it('saves a design with see-through parts as a PNG, which keeps its transparency', () => {
    expect(exportEncoding(false)).toMatchObject({
      format: 'png',
      extension: 'png',
      mimeType: 'image/png',
      uti: 'public.png',
    });
  });
});

describe('exportFileName', () => {
  it('names the file after the moment it was made, with its extension', () => {
    expect(exportFileName(exportEncoding(true), '20261018-153012')).toBe(
      'AllRun-20261018-153012.jpg',
    );
    expect(exportFileName(exportEncoding(false), '20261018-153012')).toBe(
      'AllRun-20261018-153012.png',
    );
  });
});

describe('stickerPlan', () => {
  it('draws a widget at twice its size, with room for its shadow', () => {
    expect(stickerPlan(300, 100)).toEqual({
      width: 2 * (300 + 2 * STICKER_ROOM),
      height: 2 * (100 + 2 * STICKER_ROOM),
      scale: 2,
    });
  });

  it('keeps a tall widget within its longest side, in proportion', () => {
    const { width, height, scale } = stickerPlan(500, 1900);
    expect(height).toBeLessThanOrEqual(STICKER_MAX_SIDE);
    expect(scale).toBeLessThan(2);
    expect(width).toBe(Math.ceil((500 + 2 * STICKER_ROOM) * scale));
  });
});
