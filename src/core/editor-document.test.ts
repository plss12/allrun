import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, newLayer } from './default-layout';
import {
  applyDesign,
  setLanguage,
  setUnits,
  canStartOver,
  type DefaultTemplate,
  editLayers,
  type EditorDesign,
  INITIAL_DESIGN,
  layoutTemplate,
  setBackground,
  setFormat,
  setLayers,
  setLayerTransform,
  setPhotoPlacement,
  startOver,
  setCellPlacement,
  setCollageFrame,
  setCollageLayout,
} from './editor-document';
import { commit, createHistory, undo } from './history';
import { COVER_PLACEMENT } from './photo-placement';
import { parseTemplate } from './template';
import { addLayer, removeLayer } from './template-edit';

const activity = makeActivity();
const defaultTemplate: DefaultTemplate = (format) => defaultActivityTemplate(activity, format);
const moved = { x: 0.3, y: 0.4, scale: 1.5, rotation: 0.2 };
const framed = { x: 0.4, y: 0.6, scale: 0.5, rotation: 0.1 };
const night = { kind: 'color', color: '#141B2D' } as const;

/** `design` with its first layer moved. */
function withFirstMoved(design: EditorDesign): EditorDesign {
  return editLayers(design, defaultTemplate, (current) =>
    setLayerTransform(current, current.layers[0].id, moved),
  );
}

describe('layoutTemplate', () => {
  it('uses the default layout of each format while the widgets are untouched', () => {
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(layoutTemplate(defaultTemplate, square)).toEqual(defaultTemplate('square'));
  });

  it("carries the design's photo placement and background", () => {
    const design = setBackground(setPhotoPlacement(INITIAL_DESIGN, framed), night);
    const template = layoutTemplate(defaultTemplate, design);
    expect(template.photo).toBe(framed);
    expect(template.background).toBe(night);
  });

  it("keeps the user's layers in any format", () => {
    const layers = defaultTemplate('story').layers.slice(1);
    const square = layoutTemplate(defaultTemplate, { ...INITIAL_DESIGN, format: 'square', layers });
    expect(square.format).toBe('square');
    expect(square.layers).toBe(layers);
  });
});

describe('editLayers', () => {
  it("applies the edit and makes the layers the user's own", () => {
    const [first, ...rest] = defaultTemplate('story').layers;
    const edited = editLayers(INITIAL_DESIGN, defaultTemplate, (current) =>
      removeLayer(current, first.id),
    );
    expect(edited.layers).toEqual(rest);
    expect(edited.format).toBe('story');
    expect(edited.photo).toBe(INITIAL_DESIGN.photo);
  });

  it('returns the same design when the edit changes nothing', () => {
    expect(
      editLayers(INITIAL_DESIGN, defaultTemplate, (current) => removeLayer(current, 'missing')),
    ).toBe(INITIAL_DESIGN);
  });
});

describe('setLayers, setFormat, setPhotoPlacement and setBackground', () => {
  it('return the same design when nothing changes, so no undo step is recorded', () => {
    expect(setLayers(INITIAL_DESIGN, null, defaultTemplate)).toBe(INITIAL_DESIGN);
    expect(setFormat(INITIAL_DESIGN, 'story')).toBe(INITIAL_DESIGN);
    expect(setPhotoPlacement(INITIAL_DESIGN, { ...COVER_PLACEMENT })).toBe(INITIAL_DESIGN);
    expect(setBackground(INITIAL_DESIGN, { kind: 'auto' })).toBe(INITIAL_DESIGN);
    expect(setBackground(INITIAL_DESIGN, { kind: 'auto', opacity: 1 })).toBe(INITIAL_DESIGN);
    const faint = setBackground(INITIAL_DESIGN, { kind: 'auto', opacity: 0.5 });
    expect(faint.background).toEqual({ kind: 'auto', opacity: 0.5 });
    expect(setBackground(faint, { kind: 'auto', opacity: 0.5 })).toBe(faint);
    const dark = setBackground(INITIAL_DESIGN, night);
    expect(setBackground(dark, { ...night })).toBe(dark);
  });

  it('change only their part of the design', () => {
    const layers = defaultTemplate('story').layers.slice(1);
    expect(setLayers(INITIAL_DESIGN, layers, defaultTemplate)).toEqual({
      ...INITIAL_DESIGN,
      layers,
    });
    expect(setFormat(INITIAL_DESIGN, 'landscape')).toEqual({
      ...INITIAL_DESIGN,
      format: 'landscape',
    });
    expect(setPhotoPlacement(INITIAL_DESIGN, framed)).toEqual({ ...INITIAL_DESIGN, photo: framed });
    expect(setBackground(INITIAL_DESIGN, night)).toEqual({ ...INITIAL_DESIGN, background: night });
  });
});

describe('applyDesign', () => {
  it("takes a saved design's widgets, photo placement and background, keeping the format", () => {
    const layers = defaultTemplate('square').layers.slice(2);
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(
      applyDesign(square, { layers, photo: framed, background: night }, defaultTemplate),
    ).toEqual({
      format: 'square',
      photo: framed,
      collage: null,
      background: night,
      layers,
      units: null,
      language: null,
    });
  });

  it("takes its unit and language too, and the device's and app's when it has none", () => {
    const layers = defaultTemplate('story').layers;
    const own = applyDesign(
      INITIAL_DESIGN,
      { layers, photo: framed, background: night, units: 'mi', language: 'en' },
      defaultTemplate,
    );
    expect([own.units, own.language]).toEqual(['mi', 'en']);
    const plain = applyDesign(own, { layers, photo: framed, background: night }, defaultTemplate);
    expect([plain.units, plain.language]).toEqual([null, null]);
  });
});

describe("the user's pictures", () => {
  const picture = newLayer({ kind: 'image', image: 'picked-1', frame: 'light' }, 'image', 'story');
  const withPicture = editLayers(INITIAL_DESIGN, defaultTemplate, (current) =>
    addLayer(current, picture),
  );

  it('stay on top when another design is applied, as they are never saved with one', () => {
    const layers = defaultTemplate('story').layers.slice(2);
    const applied = applyDesign(
      withPicture,
      { layers, photo: framed, background: night },
      defaultTemplate,
    );
    expect(applied.layers).toEqual([...layers, picture]);
  });

  it("stay over the format's default widgets when those are chosen", () => {
    const own = setLayers(withPicture, [], defaultTemplate);
    expect(own.layers).toEqual([picture]);
    expect(setLayers(own, null, defaultTemplate).layers).toEqual([
      ...defaultTemplate('story').layers,
      picture,
    ]);
  });
});

describe('setUnits and setLanguage', () => {
  it('set them for the whole design, and record no step when they are the same', () => {
    const miles = setUnits(INITIAL_DESIGN, 'mi');
    expect(miles).toEqual({ ...INITIAL_DESIGN, units: 'mi' });
    expect(setUnits(miles, 'mi')).toBe(miles);
    expect(setUnits(INITIAL_DESIGN, null)).toBe(INITIAL_DESIGN);
    const english = setLanguage(INITIAL_DESIGN, 'en');
    expect(english).toEqual({ ...INITIAL_DESIGN, language: 'en' });
    expect(setLanguage(english, 'en')).toBe(english);
  });

  it('go into the template only when the design has its own', () => {
    expect(layoutTemplate(defaultTemplate, INITIAL_DESIGN)).not.toHaveProperty('units');
    expect(layoutTemplate(defaultTemplate, INITIAL_DESIGN)).not.toHaveProperty('language');
    const own = setLanguage(setUnits(INITIAL_DESIGN, 'mi'), 'es');
    const template = layoutTemplate(defaultTemplate, own);
    expect([template.units, template.language]).toEqual(['mi', 'es']);
    expect(parseTemplate(template)).toEqual(template);
  });

  it('are undone by starting over', () => {
    const own = setLanguage(setUnits(INITIAL_DESIGN, 'mi'), 'en');
    expect(canStartOver(own)).toBe(true);
    expect(startOver(own)).toEqual(INITIAL_DESIGN);
  });
});

describe('setLayerTransform', () => {
  it('changes only that layer', () => {
    const template = defaultTemplate('story');
    const [first, second] = template.layers;
    const edited = setLayerTransform(template, second.id, moved);
    expect(edited.layers[1].transform).toEqual(moved);
    expect(edited.layers[0]).toBe(first);
  });

  it('returns the same template for a missing layer or an unchanged transform', () => {
    const template = defaultTemplate('story');
    const [first] = template.layers;
    expect(setLayerTransform(template, 'missing', moved)).toBe(template);
    expect(setLayerTransform(template, first.id, { ...first.transform })).toBe(template);
  });
});

describe('the history of a design', () => {
  it('keeps edited widgets where they are when the format changes, and undoes the change', () => {
    const edited = withFirstMoved(INITIAL_DESIGN);
    let history = commit(createHistory(INITIAL_DESIGN), edited);
    history = commit(history, setFormat(history.present, 'square'));
    const square = layoutTemplate(defaultTemplate, history.present);
    expect(square.format).toBe('square');
    expect(square.layers[0].transform).toEqual(moved);
    history = undo(history);
    expect(history.present).toBe(edited);
  });

  it('lays out the default widgets again in a new format while they are untouched', () => {
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(layoutTemplate(defaultTemplate, square)).toEqual(defaultTemplate('square'));
  });

  it("undoes the photo's placement and the background like any other step", () => {
    let history = commit(createHistory(INITIAL_DESIGN), setPhotoPlacement(INITIAL_DESIGN, framed));
    history = commit(history, setBackground(history.present, night));
    expect(history.present).toMatchObject({ photo: framed, background: night });
    history = undo(history);
    expect(history.present.background).toEqual({ kind: 'auto' });
    expect(undo(history).present).toBe(INITIAL_DESIGN);
  });
});

describe('startOver', () => {
  it('has nothing to start over in the design the editor opens with', () => {
    expect(canStartOver(INITIAL_DESIGN)).toBe(false);
    expect(startOver(INITIAL_DESIGN)).toBe(INITIAL_DESIGN);
    // Another format alone is no edit: the user picked it for where the image goes.
    const square = setFormat(INITIAL_DESIGN, 'square');
    expect(canStartOver(square)).toBe(false);
    expect(startOver(square)).toBe(square);
  });

  it('brings back the default widgets, photo placement and background, keeping the format', () => {
    const edited = setBackground(
      setPhotoPlacement(withFirstMoved(setFormat(INITIAL_DESIGN, 'portrait')), framed),
      night,
    );
    expect(canStartOver(edited)).toBe(true);
    expect(startOver(edited)).toEqual({ ...INITIAL_DESIGN, format: 'portrait' });
    expect(canStartOver(setPhotoPlacement(INITIAL_DESIGN, framed))).toBe(true);
    expect(canStartOver(setBackground(INITIAL_DESIGN, { kind: 'transparent' }))).toBe(true);
  });

  it('is one more undoable step', () => {
    const edited = withFirstMoved(INITIAL_DESIGN);
    const history = commit(commit(createHistory(INITIAL_DESIGN), edited), startOver(edited));
    expect(layoutTemplate(defaultTemplate, history.present)).toEqual(defaultTemplate('story'));
    expect(undo(history).present).toBe(edited);
  });
});

describe('a collage in the design', () => {
  const moved = { ...COVER_PLACEMENT, x: 0.3 };

  it('starts without one, as a single photo', () => {
    expect(INITIAL_DESIGN.collage).toBeNull();
  });

  it('lays the photos out, as one step, and back to one photo', () => {
    const collage = setCollageLayout(INITIAL_DESIGN, 'four');
    expect(collage.collage?.layout).toBe('four');
    expect(collage.collage?.frame).toBe('none');
    expect(setCollageLayout(collage, null).collage).toBeNull();
  });

  it('records nothing for the same layout, frame or placement', () => {
    expect(setCollageLayout(INITIAL_DESIGN, null)).toBe(INITIAL_DESIGN);
    const collage = setCollageLayout(INITIAL_DESIGN, 'two');
    expect(setCollageLayout(collage, 'two')).toBe(collage);
    expect(setCollageFrame(collage, 'none')).toBe(collage);
    expect(setCellPlacement(collage, 1, COVER_PLACEMENT)).toBe(collage);
  });

  it('has nothing to frame or place in a single photo', () => {
    expect(setCollageFrame(INITIAL_DESIGN, 'light')).toBe(INITIAL_DESIGN);
    expect(setCellPlacement(INITIAL_DESIGN, 1, moved)).toBe(INITIAL_DESIGN);
  });

  it('keeps the frame and where each photo was, on changing layouts', () => {
    const framed = setCollageFrame(setCollageLayout(INITIAL_DESIGN, 'six'), 'dark');
    const placed = setCellPlacement(framed, 5, moved);
    const fewer = setCollageLayout(placed, 'two');
    expect(fewer.collage?.frame).toBe('dark');
    expect(setCollageLayout(fewer, 'six').collage?.placements[5]).toEqual(moved);
  });

  it('goes into the template, and out of it when it has none', () => {
    const design = setCollageLayout(INITIAL_DESIGN, 'two');
    const template = layoutTemplate(
      (format) => defaultActivityTemplate(makeActivity(), format),
      design,
    );
    expect(parseTemplate(template).collage).toEqual(design.collage);
    const single = layoutTemplate(
      (format) => defaultActivityTemplate(makeActivity(), format),
      INITIAL_DESIGN,
    );
    expect(single).not.toHaveProperty('collage');
  });

  it('comes with a saved design, and goes with one without it', () => {
    const defaults = (format: Parameters<typeof defaultActivityTemplate>[1]) =>
      defaultActivityTemplate(makeActivity(), format);
    const saved = layoutTemplate(defaults, setCollageLayout(INITIAL_DESIGN, 'four'));
    const applied = applyDesign(INITIAL_DESIGN, saved, defaults);
    expect(applied.collage?.layout).toBe('four');
    const plain = layoutTemplate(defaults, INITIAL_DESIGN);
    expect(applyDesign(applied, plain, defaults).collage).toBeNull();
  });

  it('counts for starting over, which takes it away', () => {
    const collage = setCollageLayout(INITIAL_DESIGN, 'two');
    expect(canStartOver(collage)).toBe(true);
    expect(startOver(collage).collage).toBeNull();
  });
});
