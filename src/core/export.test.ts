import { exportEncoding, exportFileName, JPEG_QUALITY } from './export';

describe('exportEncoding', () => {
  it('saves a design over a photo as a high-quality JPEG', () => {
    expect(exportEncoding(true)).toMatchObject({
      format: 'jpeg',
      quality: JPEG_QUALITY,
      extension: 'jpg',
      mimeType: 'image/jpeg',
      uti: 'public.jpeg',
    });
  });

  it('saves a design without a photo as a PNG, which keeps its transparency', () => {
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
