import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { drawGestureTextures, type TextureRequest, type TextureSlots } from './gesture-textures';
import { disposeLater } from './paragraph-arena';

/** What the fake Skia has made so far, to tell whose textures are in the slots. */
const made: { image: { readonly id: number; disposed: boolean } }[] = [];

jest.mock('@shopify/react-native-skia', () => ({
  drawAsPicture: jest.fn(() => Promise.resolve({ dispose: jest.fn() })),
  Skia: {
    Surface: {
      MakeOffscreen: jest.fn(() => ({
        getCanvas: () => ({ drawPicture: jest.fn() }),
        flush: jest.fn(),
        dispose: jest.fn(),
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
      })),
    },
  },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (work: () => void) => work(),
  scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args),
}));
jest.mock('react-native-reanimated', () => ({ useSharedValue: jest.fn() }));
jest.mock('./paragraph-arena', () => ({ disposeLater: jest.fn() }));

/** A shared value, as the UI thread sees it. */
function slot(): SharedValue<SkImage | null> {
  let value: SkImage | null = null;
  return {
    get: () => value,
    set: (next: SkImage | null) => {
      value = next;
    },
  } as unknown as SharedValue<SkImage | null>;
}

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
/** Lets the recording of the pictures, which is asynchronous, finish. */
const recorded = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('the textures of a gesture', () => {
  let slots: TextureSlots;
  let gestures: { current: number };
  beforeEach(() => {
    made.length = 0;
    waiting.mockClear();
    slots = { under: slot(), over: slot(), live: slot() };
    gestures = { current: 0 };
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
});
