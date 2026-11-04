import { bottomRowWidth, NARROWEST_SCREEN } from '@/editor/editor-layout';
import { tabsWidth } from '@/ui/tabs-layout';

describe('the rows on the narrowest phone', () => {
  it('fits the bottom row of the editor', () => {
    expect(bottomRowWidth()).toBeLessThanOrEqual(NARROWEST_SCREEN);
  });

  it.each([
    ['home', 230],
    ['selection', 260],
  ])('keeps the tabs of the %s clear of the buttons beside them', (_screen, wanted) => {
    const beside = 8 + 46;
    const width = tabsWidth(wanted, NARROWEST_SCREEN);
    expect((NARROWEST_SCREEN - width) / 2).toBeGreaterThanOrEqual(beside);
  });

  it('gives the tabs the width they ask for when it fits', () => {
    expect(tabsWidth(260, 390)).toBe(260);
  });
});
