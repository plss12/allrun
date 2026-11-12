import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { drawGestureTextures, type TextureRequest, type TextureSlots } from './gesture-textures';
import { disposeLater } from './paragraph-arena';

/** What the fake Skia has made so far, to tell whose textures are in the slots. */
const made: { image: { readonly id: number; disposed: boolean } }[] = [];
/** The offscreen surfaces it has made: their color space, and whether each was freed. */
const surfacesMade: {
  readonly width: number;
  readonly height: number;
  readonly colorSpace: string | undefined;
  disposed: boolean;
}[] = [];

jest.mock('@shopify/react-native-skia', () => ({
  ColorSpace: { SRGB: 'srgb', DisplayP3: 'display-p3' },
  drawAsPicture: jest.fn(() => Promise.resolve({ dispose: jest.fn() })),
  Skia: {
    Surface: {
      MakeOffscreen: jest.fn((width: number, height: number, options?: { colorSpace: string }) => {
        const surface = { width, height, colorSpace: options?.colorSpace, disposed: false };
        surfacesMade.push(surface);
        return {
          width: () => width,
          height: () => height,
          getCanvas: () => ({ drawPicture: jest.fn(), clear: jest.fn() }),
          flush: jest.fn(),
          dispose: () => {
            surface.disposed = true;
          },
          makeImageSnapshot: () => {
            const image = {
              id: made.length,
              disposed: false,
              dispose() {
                this.disposed = true;
              },
            };
            made.push({ image });
            return image;
          },
        };
      }),
    },
    Color: jest.fn(() => 0),
  },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (work: () => void) => work(),
  scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args),
}));
jest.mock('react-native-reanimated', () => ({ useSharedValue: jest.fn() }));
jest.mock('./paragraph-arena', () => ({ disposeLater: jest.fn() }));

/** A shared value, as the UI thread sees it. */
function slot<T>(): SharedValue<T | null> {
  let value: T | null = null;
  return {
    get: () => value,
    set: (next: T | null) => {
      value = next;
    },
  } as unknown as SharedValue<T | null>;
}

/** The UI thread's frames asked for, run when a test says so. */
const frames: (() => void)[] = [];
globalThis.requestAnimationFrame = (run: FrameRequestCallback) => {
  frames.push(() => run(0));
  return frames.length;
};
const runFrame = () => {
  frames.shift()?.();
};
const runFrames = () => {
  while (frames.length > 0) {
    runFrame();
  }
};

const element = {} as ReactElement;
const request = (key: string): TextureRequest => ({
  key,
  sceneSize: { width: 100, height: 200 },
  under: element,
  over: null,
  live: { element, size: { width: 10, height: 10 } },
});

/** The frees waiting their moment (`disposeLater`), to run when a test says it has come. */
const waiting = jest.mocked(disposeLater);
const runFrees = () => {
  waiting.mock.calls.splice(0).forEach(([free]) => free());
};
/** Lets the recording of the pictures, which is asynchronous, finish, without the frames after. */
const recordedOnly = () => new Promise<void>((resolve) => setImmediate(() => resolve()));
/** Lets the recording finish, and the frames that draw the textures pass. */
const recorded = async () => {
  await recordedOnly();
  runFrames();
};

describe('the textures of a gesture', () => {
  let slots: TextureSlots;
  let gestures: { current: number };
  beforeEach(() => {
    made.length = 0;
    surfacesMade.length = 0;
    frames.length = 0;
    waiting.mockClear();
    slots = {
      under: slot<SkImage>(),
      over: slot<SkImage>(),
      live: slot<SkImage>(),
      before: slot<SkImage>(),
      after: slot<SkImage>(),
    };
    gestures = { current: 0 };
  });

  it("draws the photo with the filters either side of a swipe's, and frees them too", async () => {
    const end = drawGestureTextures(
      { ...request('filter'), live: null, sides: { before: element, after: element } },
      slots,
      gestures,
      jest.fn(),
    );
    await recorded();
    expect(slots.before.get()).not.toBeNull();
    expect(slots.after.get()).not.toBeNull();
    end();
    runFrees();
    runFrames();
    expect(slots.before.get()).toBeNull();
    expect(slots.after.get()).toBeNull();
  });

  it('says they are ready once drawn', async () => {
    const onReady = jest.fn();
    drawGestureTextures(request('a'), slots, gestures, onReady);
    expect(onReady).not.toHaveBeenCalled();
    await recorded();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(slots.under.get()).not.toBeNull();
    expect(slots.live.get()).not.toBeNull();
  });

  it('frees them a moment after the gesture ends, not at once', async () => {
    const end = drawGestureTextures(request('a'), slots, gestures, jest.fn());
    await recorded();
    const image = made[0].image;
    end();
    expect(image.disposed).toBe(false);
    runFrees();
    expect(image.disposed).toBe(true);
    expect(slots.under.get()).toBeNull();
  });

  // The canvas went black when moving widgets a lot: the first gesture freed the second's textures.
  it("doesn't free those of a gesture that starts less than a second after", async () => {
    const endFirst = drawGestureTextures(request('a'), slots, gestures, jest.fn());
    await recorded();
    endFirst();
    drawGestureTextures(request('b'), slots, gestures, jest.fn());
    await recorded();
    const drawn = [slots.under.get(), slots.live.get()] as unknown as { disposed: boolean }[];
    runFrees();
    expect(slots.under.get()).not.toBeNull();
    expect(slots.live.get()).not.toBeNull();
    expect(drawn.map((image) => image.disposed)).toEqual([false, false]);
  });

  it('frees those it replaces, not to pile them up', async () => {
    const endFirst = drawGestureTextures(request('a'), slots, gestures, jest.fn());
    await recorded();
    const first = made.map(({ image }) => image);
    endFirst();
    drawGestureTextures(request('b'), slots, gestures, jest.fn());
    await recorded();
    expect(first.map((image) => image.disposed)).toEqual([true, true]);
  });

  it("doesn't draw for a gesture over before its pictures are recorded", async () => {
    const onReady = jest.fn();
    const end = drawGestureTextures(request('a'), slots, gestures, onReady);
    end();
    await recorded();
    expect(made).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    expect(slots.under.get()).toBeNull();
  });

  it("leaves a late gesture's pictures out when a newer one has drawn", async () => {
    const endFirst = drawGestureTextures(request('a'), slots, gestures, jest.fn());
    endFirst();
    drawGestureTextures(request('b'), slots, gestures, jest.fn());
    await recorded();
    // Only the second one's two textures: the first never drew over them.
    expect(made).toHaveLength(2);
    expect(made.every(({ image }) => !image.disposed)).toBe(true);
  });

  // Every drag left the GPU's memory of surfaces kept for the next one behind: each is freed at once.
  it('frees each surface as soon as its texture is drawn', async () => {
    drawGestureTextures(request('a'), slots, gestures, jest.fn());
    await recorded();
    expect(surfacesMade).toHaveLength(2);
    expect(surfacesMade.every((surface) => surface.disposed)).toBe(true);
  });

  it('draws one texture per frame, and is ready after the last', async () => {
    const onReady = jest.fn();
    drawGestureTextures(request('a'), slots, gestures, onReady);
    await recordedOnly();
    expect(made).toHaveLength(1);
    runFrame();
    expect(made).toHaveLength(2);
    expect(onReady).not.toHaveBeenCalled();
    runFrame();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  // On the iPhone the photo looked duller while a widget moved: its textures were sRGB, and the
  // canvas and the photos are Display P3 there.
  it.each([
    ['ios', 'display-p3'],
    ['android', 'srgb'],
  ])('draws them on %s in the color space of its canvas, %s', async (os, colorSpace) => {
    let isolated: typeof drawGestureTextures = drawGestureTextures;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: os } }));
      ({ drawGestureTextures: isolated } =
        jest.requireActual<typeof import('./gesture-textures')>('./gesture-textures'));
    });
    isolated(request('a'), slots, gestures, jest.fn());
    await recorded();
    expect(surfacesMade.map((surface) => surface.colorSpace)).toEqual([colorSpace, colorSpace]);
  });
});
