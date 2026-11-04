import { loadData, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import type { ImageFrame, ImageMount, Layer } from '@/core/template';
import { logError } from '@/ui/log';

import type { LayerImage } from './template-scene';

/**
 * Our own photos (Pexels, see `assets/images/stock/SOURCES.md`), which every design's thumbnail and
 * every tile of a picture show, so we know how each one looks: never the user's. Small copies, 540 px
 * on their short side, enough for a thumbnail: all of them take about 1 MB in the app and 20 MB once
 * decoded, only on the screens that show them.
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
 * Decodes the stock photos, once a session, all at once: one after another they took 6 s in Expo Go
 * on the iPhone, where each comes from Metro over the WiFi. A load that fails is tried again the next
 * time.
 *
 * @throws Error when a photo can't be decoded.
 */
export function loadStockPhotos(): Promise<StockPhotos> {
  if (loadedStock !== null) {
    return Promise.resolve(loadedStock);
  }
  loadingStock ??= (async () => {
    const names = Object.keys(STOCK_FILES) as StockPhoto[];
    const images = await Promise.all(
      names.map((name) =>
        loadData(STOCK_FILES[name], (data) => Skia.Image.MakeImageFromEncoded(data)),
      ),
    );
    const photos: Partial<Record<StockPhoto, SkImage>> = {};
    names.forEach((name, i) => {
      const image = images[i];
      if (image === null) {
        throw new Error(`Could not decode the stock photo ${name}`);
      }
      photos[name] = image;
    });
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

const MOUNT_PHOTOS: Readonly<Record<ImageMount, StockPhoto>> = {
  filmFrame: 'monoSprinter',
  lightNegative: 'forestTrail',
  filmStrip: 'trackShoes',
  camera: 'forestBridge',
};
const FRAME_PHOTOS: Readonly<Record<ImageFrame, StockPhoto>> = {
  none: 'mountainRunner',
  light: 'stadiumField',
  dark: 'brickWall',
};

/** The stock photo of a tile of a picture: a different one each, for variety (the user's choice). */
function tilePhoto(layer: Extract<Layer, { kind: 'image' }>): StockPhoto {
  if (layer.mount !== undefined) {
    return MOUNT_PHOTOS[layer.mount];
  }
  if (layer.caption !== undefined) {
    return layer.caption === 'place' ? 'forestBridge' : 'streetCrossing';
  }
  return FRAME_PHOTOS[layer.frame];
}

/** A widget of the gallery with its stock photo, if it is a picture; any other, as it is. */
export function withStockPicture(layer: Layer): Layer {
  return layer.kind === 'image' ? { ...layer, image: tilePhoto(layer) } : layer;
}
