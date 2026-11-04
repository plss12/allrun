import { type SkImage, useImage } from '@shopify/react-native-skia';

import { logError } from '@/ui/log';

/**
 * Our own photos (Pexels, see `assets/images/stock/SOURCES.md`), which every design's thumbnail
 * shows, so we know how each one looks: never the user's. Small copies, 540 px on their short side,
 * enough for a thumbnail: all of them take about 1 MB in the app and 20 MB once decoded, only on
 * the screens that show designs.
 */
const STOCK_FILES = {
  brickWall: require('../../assets/images/stock/brick-wall.jpg'),
  concreteWall: require('../../assets/images/stock/concrete-wall.jpg'),
  forestBridge: require('../../assets/images/stock/forest-bridge.jpg'),
  forestTrail: require('../../assets/images/stock/forest-trail.jpg'),
  monoSprinter: require('../../assets/images/stock/mono-sprinter.jpg'),
  monoStride: require('../../assets/images/stock/mono-stride.jpg'),
  runway: require('../../assets/images/stock/runway.jpg'),
  stadiumField: require('../../assets/images/stock/stadium-field.jpg'),
  streetCrossing: require('../../assets/images/stock/street-crossing.jpg'),
  trackShadow: require('../../assets/images/stock/track-shadow.jpg'),
  trackShoes: require('../../assets/images/stock/track-shoes.jpg'),
  woodlandPath: require('../../assets/images/stock/woodland-path.jpg'),
} as const;

export type StockPhoto = keyof typeof STOCK_FILES;

/** The stock photos, once all are decoded. */
export type StockPhotos = Readonly<Record<StockPhoto, SkImage>>;

/**
 * Decodes the stock photos when `wanted`, and keeps them while the screen lasts.
 *
 * @returns All of them, or `null` until the last is decoded.
 */
export function useStockPhotos(wanted: boolean): StockPhotos | null {
  const load = (file: number) =>
    // A fixed number of hooks, one per file; the list never changes.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useImage(wanted ? file : null, (error) => logError('Could not decode a stock photo', error));
  const brickWall = load(STOCK_FILES.brickWall);
  const concreteWall = load(STOCK_FILES.concreteWall);
  const forestBridge = load(STOCK_FILES.forestBridge);
  const forestTrail = load(STOCK_FILES.forestTrail);
  const monoSprinter = load(STOCK_FILES.monoSprinter);
  const monoStride = load(STOCK_FILES.monoStride);
  const runway = load(STOCK_FILES.runway);
  const stadiumField = load(STOCK_FILES.stadiumField);
  const streetCrossing = load(STOCK_FILES.streetCrossing);
  const trackShadow = load(STOCK_FILES.trackShadow);
  const trackShoes = load(STOCK_FILES.trackShoes);
  const woodlandPath = load(STOCK_FILES.woodlandPath);
  return brickWall === null ||
    concreteWall === null ||
    forestBridge === null ||
    forestTrail === null ||
    monoSprinter === null ||
    monoStride === null ||
    runway === null ||
    stadiumField === null ||
    streetCrossing === null ||
    trackShadow === null ||
    trackShoes === null ||
    woodlandPath === null
    ? null
    : {
        brickWall,
        concreteWall,
        forestBridge,
        forestTrail,
        monoSprinter,
        monoStride,
        runway,
        stadiumField,
        streetCrossing,
        trackShadow,
        trackShoes,
        woodlandPath,
      };
}
