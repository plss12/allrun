import { packRows } from './tile-rows';

const one = () => 1;
/** 'w' tiles are wide, two columns; the rest take one. */
const spanOf = (item: string) => (item.startsWith('w') ? 2 : 1);

describe('packRows', () => {
  it('lays tiles of one column out in full rows, the last one short', () => {
    expect(packRows(['a', 'b', 'c', 'd'], one, 3)).toEqual([['a', 'b', 'c'], ['d']]);
    expect(packRows([], one, 3)).toEqual([]);
  });

  it('starts a new row with a wide tile that does not fit in what is left of its own', () => {
    expect(packRows(['a', 'w1', 'b', 'c', 'w2'], spanOf, 3)).toEqual([
      ['a', 'w1'],
      ['b', 'c'],
      ['w2'],
    ]);
    expect(packRows(['a', 'b', 'w1'], spanOf, 3)).toEqual([['a', 'b'], ['w1']]);
  });

  it('leaves room in the first row for a tile that is not one of them, even with none', () => {
    expect(packRows(['w1', 'a', 'b'], spanOf, 3, 1)).toEqual([['w1'], ['a', 'b']]);
    expect(packRows(['a', 'w1'], spanOf, 3, 1)).toEqual([['a'], ['w1']]);
    expect(packRows([], spanOf, 3, 1)).toEqual([[]]);
  });

  it('keeps every span between one column and a whole row', () => {
    expect(packRows(['a', 'b'], () => 5, 3)).toEqual([['a'], ['b']]);
    expect(packRows(['a', 'b'], () => 0, 2)).toEqual([['a', 'b']]);
  });
});
