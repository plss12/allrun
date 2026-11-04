import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm/bin/full/canvaskit';

import { SPORT_ICON_PATHS, SPORT_ICON_SIZE } from '@/editor/icons/sport-icons.generated';
import { shiftToCenter } from '@/ui/centering';

describe('shiftToCenter', () => {
  it('moves a shape to the middle of the square', () => {
    expect(shiftToCenter({ x: 10, y: -30, width: 20, height: 40 }, 100)).toEqual({ x: 30, y: 60 });
  });

  describe('on the icons of the sports', () => {
    let canvasKit: CanvasKit;
    beforeAll(async () => {
      canvasKit = await CanvasKitInit({});
    });

    // Their boxes aren't their ink's: at 24 pt the trail runner was 2.5 pt low, the runner 1 pt left.
    it.each(Object.keys(SPORT_ICON_PATHS) as (keyof typeof SPORT_ICON_PATHS)[])(
      '%s ends up centered and inside its box',
      (icon) => {
        const path = canvasKit.Path.MakeFromSVGString(SPORT_ICON_PATHS[icon]);
        if (path === null) {
          throw new Error(`Invalid SVG path of the sport icon "${icon}"`);
        }
        const [left, top, right, bottom] = path.computeTightBounds();
        path.delete();
        const shift = shiftToCenter(
          { x: left, y: top, width: right - left, height: bottom - top },
          SPORT_ICON_SIZE,
        );
        expect(left + shift.x + (right + shift.x)).toBeCloseTo(SPORT_ICON_SIZE, 3);
        expect(top + shift.y + (bottom + shift.y)).toBeCloseTo(SPORT_ICON_SIZE, 3);
        expect(left + shift.x).toBeGreaterThanOrEqual(0);
        expect(top + shift.y).toBeGreaterThanOrEqual(0);
        expect(right + shift.x).toBeLessThanOrEqual(SPORT_ICON_SIZE);
        expect(bottom + shift.y).toBeLessThanOrEqual(SPORT_ICON_SIZE);
      },
    );
  });
});
