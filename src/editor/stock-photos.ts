import { loadData, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import type { ImageMount, Layer } from '@/core/template';
import { logError } from '@/ui/log';

import type { LayerImage } from './template-scene';

/**
 * Our own photos (Pexels, see `assets/images/stock/SOURCES.md`), which every design's thumbnail and
 * every tile of a picture show, so we know how each one looks: never the user's. Small copies, 432 px
 * on their short side, enough for a thumbnail: all of them take about 1.4 MB in the app and 27 MB
 * once decoded, once a session.
 */
const STOCK_FILES = {
  brickWall: require('../../assets/images/stock/brick-wall.jpg'),
  concreteWall: require('../../assets/images/stock/concrete-wall.jpg'),
  forestBridge: require('../../assets/images/stock/forest-bridge.jpg'),
  forestTrail: require('../../assets/images/stock/forest-trail.jpg'),
  monoSprinter: require('../../assets/images/stock/mono-sprinter.jpg'),
  monoStride: require('../../assets/images/stock/mono-stride.jpg'),
  mountainRunner: require('../../assets/images/stock/mountain-runner.jpg'),
  runway: require('../../assets/images/stock/runway.jpg'),
  stadiumField: require('../../assets/images/stock/stadium-field.jpg'),
  streetCrossing: require('../../assets/images/stock/street-crossing.jpg'),
  trackShadow: require('../../assets/images/stock/track-shadow.jpg'),
  trackShoes: require('../../assets/images/stock/track-shoes.jpg'),
  woodlandPath: require('../../assets/images/stock/woodland-path.jpg'),
  trailRidge: require('../../assets/images/stock/trail-ridge.jpg'),
  foggyHill: require('../../assets/images/stock/foggy-hill.jpg'),
  duskSilhouette: require('../../assets/images/stock/dusk-silhouette.jpg'),
  muddyLegs: require('../../assets/images/stock/muddy-legs.jpg'),
  sunriseCyclist: require('../../assets/images/stock/sunrise-cyclist.jpg'),
  mountainRoad: require('../../assets/images/stock/mountain-road.jpg'),
  seasideRide: require('../../assets/images/stock/seaside-ride.jpg'),
  riversideRun: require('../../assets/images/stock/riverside-run.jpg'),
  beachSunset: require('../../assets/images/stock/beach-sunset.jpg'),
  shoreSplash: require('../../assets/images/stock/shore-splash.jpg'),
  harbourSwim: require('../../assets/images/stock/harbour-swim.jpg'),
  seaSwimmer: require('../../assets/images/stock/sea-swimmer.jpg'),
} as const;

export type StockPhoto = keyof typeof STOCK_FILES;

/** The stock photos, once all are decoded. */
export type StockPhotos = Readonly<Record<StockPhoto, SkImage>>;

/**
 * The stock photos once decoded, for the whole session, as the editor's fonts: each screen decoding
 * its own made the Designs tab wait the first time it opened, and kept two copies in memory.
 */
let loadedStock: StockPhotos | null = null;
/** The load under way, shared by everyone waiting for it. */
let loadingStock: Promise<StockPhotos> | null = null;

/**
 * Decodes the stock photos, once a session: their bytes all at once (one after another they took
 * 6 s in Expo Go on the iPhone, where each comes from Metro over the WiFi), and then one photo per
 * turn of the JavaScript thread, not to hold the first screens. A load that fails is tried again the
 * next time.
 *
 * @throws Error when a photo can't be decoded.
 */
export function loadStockPhotos(): Promise<StockPhotos> {
  if (loadedStock !== null) {
    return Promise.resolve(loadedStock);
  }
  loadingStock ??= (async () => {
    const names = Object.keys(STOCK_FILES) as StockPhoto[];
    const files = await Promise.all(
      names.map((name) => loadData(STOCK_FILES[name], (data) => data)),
    );
    const photos: Partial<Record<StockPhoto, SkImage>> = {};
    for (const [i, name] of names.entries()) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const file = files[i];
      const image = file === null ? null : Skia.Image.MakeImageFromEncoded(file);
      if (image === null) {
        throw new Error(`Could not decode the stock photo ${name}`);
      }
      photos[name] = image;
    }
    // Every name was set above: the loop goes over all of them.
    loadedStock = photos as StockPhotos;
    return loadedStock;
  })().catch((error: unknown) => {
    loadingStock = null;
    throw error;
  });
  return loadingStock;
}

/**
 * The stock photos (see `loadStockPhotos`): at once when already decoded.
 *
 * @returns All of them, or `null` until the last is decoded.
 */
export function useStockPhotos(): StockPhotos | null {
  const [stock, setStock] = useState(loadedStock);
  useEffect(() => {
    if (stock === null) {
      loadStockPhotos().then(setStock, (error: unknown) =>
        logError('Could not decode the stock photos', error),
      );
    }
  }, [stock]);
  return stock;
}

/** The stock photos as pictures of layers, by their names as keys. Time and space O(p). */
export function stockImages(stock: StockPhotos): ReadonlyMap<string, LayerImage> {
  return new Map(
    (Object.keys(stock) as StockPhoto[]).map((name): [string, LayerImage] => [
      name,
      { size: { width: stock[name].width(), height: stock[name].height() }, image: stock[name] },
    ]),
  );
}

/**
 * The stock photos of each holder's tile, one per window (see `windowCount`): every photo in one
 * tile only, chosen by what it shows (the user's choice), the pieces of several with a theme.
 */
const MOUNT_PHOTOS: Readonly<Record<ImageMount, readonly StockPhoto[]>> = {
  camera: ['trailRidge'],
  crop: ['duskSilhouette'],
  // Black and white in the black frame.
  filmFrame: ['monoStride'],
  lightNegative: ['forestTrail'],
  filmStrip: ['sunriseCyclist'],
  // A trail run, and a ride.
  margins: ['muddyLegs', 'forestBridge', 'woodlandPath'],
  marginsPair: ['seasideRide', 'mountainRoad'],
  // A day at the sea, and a session on the track.
  slides: ['harbourSwim', 'seaSwimmer', 'beachSunset'],
  photobooth: ['trackShadow', 'trackShoes', 'runway'],
  // The city.
  chat: ['streetCrossing'],
  chatPair: ['brickWall', 'concreteWall'],
  calendar: ['mountainRunner'],
};
/**
 * The photo of "Your photo"'s tile, the same in its three pages, as is and in each frame, so they
 * compare (the user's choice).
 */
const PICTURE_PHOTO: StockPhoto = 'riversideRun';

/**
 * The stock photos of a tile of a picture, one per window: a different one each, for variety (the
 * user's choice).
 */
function tilePhotos(layer: Extract<Layer, { kind: 'image' }>): readonly StockPhoto[] {
  if (layer.mount !== undefined) {
    return MOUNT_PHOTOS[layer.mount];
  }
  if (layer.caption !== undefined) {
    return [layer.caption === 'place' ? 'foggyHill' : 'shoreSplash'];
  }
  return [PICTURE_PHOTO];
}

/** A widget of the gallery with its stock photos, if it is a picture; any other, as it is. */
export function withStockPicture(layer: Layer): Layer {
  if (layer.kind !== 'image') {
    return layer;
  }
  const [image, ...extraImages] = tilePhotos(layer);
  return { ...layer, image, ...(extraImages.length === 0 ? {} : { extraImages }) };
}
