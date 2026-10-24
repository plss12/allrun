import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';

/**
 * Scene tests draw with CanvasKit instead of the native module, each test file in its own Jest
 * realm. A file mocks Skia's platform and exports first, which has to be done in the file itself
 * (Jest hoists `jest.mock` per file; see `editor/template-scene.test.tsx`), then calls
 * {@link loadSceneBeforeAll}. Heavy scene tests are split into files so that Jest draws them at once.
 */

/** The scene module, loaded once CanvasKit is. */
export type Scene = typeof import('@/editor/template-scene');

/**
 * Loads CanvasKit and the scene before the file's tests (with Node's `TextDecoder`, which the
 * realm lacks), and gives the scene to them.
 */
export function loadSceneBeforeAll(): () => Scene {
  let scene: Scene | null = null;
  beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    globalThis.TextDecoder = jest.requireActual<{ TextDecoder: typeof TextDecoder }>(
      'util',
    ).TextDecoder;
    (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit({});
    scene = jest.requireActual<Scene>('../editor/template-scene');
  });
  return () => {
    if (scene === null) {
      throw new Error('The scene loads before the tests');
    }
    return scene;
  };
}
