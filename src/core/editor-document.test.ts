import { makeActivity } from '@/test-utils/make-activity';

import { defaultActivityTemplate, newLayer } from './default-layout';
import {
  applyCollage,
  applyDesign,
  setLanguage,
  setUnits,
  canStartOver,
  designStart,
  type DefaultTemplate,
  editLayers,
  type EditorDesign,
  INITIAL_DESIGN,
  layoutTemplate,
  setBackground,
  setCollageLayout,
  setFormat,
  setLayerTransform,
  setPhotoPlacement,
  startOver,
  setCellPlacement,
  setFrame,
} from './editor-document';
import { newCollage } from './collage';
import { commit, createHistory, mapHistory, undo } from './history';
import { EDITOR_PHOTO, SAMPLE_IMAGE } from './image-layer';
import { COVER_PLACEMENT } from './photo-placement';
import { type Layer, parseTemplate } from './template';
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

describe('setFormat with the widgets measured', () => {
  it('keeps a piece that fitted the canvas inside the new one, and the rest where they were', () => {
    const piece: Layer = {
      id: 'strip',
      kind: 'image',
      image: SAMPLE_IMAGE,
      frame: 'none',
      mount: 'photobooth',
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
      opacity: 1,
    };
    const text = defaultTemplate('story').layers[0];
    const design = { ...INITIAL_DESIGN, layers: [text, piece] };
    const size = { width: 500, height: 1400 };
    const sizeOf = (id: string) => (id === 'strip' ? size : undefined);
    const wide = setFormat(design, 'landscape', sizeOf);
    expect(wide.format).toBe('landscape');
    const [kept, fitted] = wide.layers ?? [];
    // Not measured: where it was.
    expect(kept).toEqual(text);
    expect(fitted.transform.scale).toBeCloseTo(566 / 1400);
    // Back on a story, untouched, it is as it was.
    expect(setFormat(wide, 'story', sizeOf).layers).toEqual(design.layers);
    // Through a third format too, placed from where it was.
    const square = setFormat(wide, 'square', sizeOf);
    expect(square.layers?.[1].transform.scale).toBeCloseTo(1080 / 1400);
    expect(setFormat(square, 'story', sizeOf).layers).toEqual(design.layers);
  });

  it('keeps a strip of film off the canvas along it, laid up a wide one, and back on a story', () => {
    const strip: Layer = {
      id: 'strip',
      kind: 'image',
      image: SAMPLE_IMAGE,
      frame: 'none',
      mount: 'filmStrip',
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0.035 },
      opacity: 1,
    };
    // Across a story, and up a wide canvas, as the scene measures it in each.
    const sizeOf = (_id: string, format: string) =>
      format === 'landscape' ? { width: 640, height: 1300 } : { width: 1300, height: 640 };
    const design = { ...INITIAL_DESIGN, layers: [strip] };
    const wide = setFormat(design, 'landscape', sizeOf);
    const laid = wide.layers?.[0].transform;
    // Never turned: only its tilt; as much of the canvas along it as it took across the story, so it
    // still runs off it, and no more across it than it took down the story.
    expect(laid?.rotation).toBe(0.035);
    expect(((laid?.scale ?? 0) * 1300) / 566).toBeCloseTo(1300 / 1080);
    expect(((laid?.scale ?? 0) * 640) / 1080).toBeLessThanOrEqual(640 / 1920 + 1e-9);
    expect(setFormat(wide, 'story', sizeOf).layers).toEqual(design.layers);
  });

  it('places a widget moved after a change where it is now', () => {
    const piece: Layer = {
      id: 'strip',
      kind: 'image',
      image: SAMPLE_IMAGE,
      frame: 'none',
      mount: 'photobooth',
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
      opacity: 1,
    };
    const size = { width: 500, height: 1400 };
    const sizeOf = () => size;
    const wide = setFormat({ ...INITIAL_DESIGN, layers: [piece] }, 'landscape', sizeOf);
    const moved = {
      ...wide,
      layers: (wide.layers ?? []).map((layer) => ({
        ...layer,
        transform: { ...layer.transform, x: 0.3 },
      })),
    };
    const back = setFormat(moved, 'story', sizeOf);
    expect(back.layers?.[0].transform.x).toBeCloseTo(0.3);
    expect(back.layers?.[0].transform.scale).toBeCloseTo(566 / 1400);
  });
});

describe('setFormat, setPhotoPlacement and setBackground', () => {
  it('return the same design when nothing changes, so no undo step is recorded', () => {
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
    expect(applyDesign(square, { layers, photo: framed, background: night }, [])).toMatchObject({
      format: 'square',
      photo: framed,
      collage: null,
      frame: 'none',
      background: night,
      layers,
      units: null,
      language: null,
    });
  });

  it('keeps the unit and language of the canvas, whatever the design has', () => {
    const layers = defaultTemplate('story').layers;
    const own = setLanguage(setUnits(INITIAL_DESIGN, 'km'), 'es');
    const applied = applyDesign(
      own,
      { layers, photo: framed, background: night, units: 'mi', language: 'en' } as Parameters<
        typeof applyDesign
      >[1],
      [],
    );
    expect([applied.units, applied.language]).toEqual(['km', 'es']);
  });

  it('keeps nothing of the design before: no widgets of it, no frame, no background', () => {
    const layers = defaultTemplate('story').layers.slice(2);
    const before = setFrame(setBackground(withFirstMoved(INITIAL_DESIGN), night), 'dark');
    const applied = applyDesign(
      before,
      { layers, photo: framed, background: { kind: 'auto' } },
      [],
    );
    expect(applied.layers).toEqual(layers);
    expect(applied.frame).toBe('none');
    expect(applied.background).toEqual({ kind: 'auto' });
  });
});

describe("the user's pictures", () => {
  const picture = newLayer({ kind: 'image', image: 'picked-1', frame: 'light' }, 'image', 'story');
  const withPicture = editLayers(INITIAL_DESIGN, defaultTemplate, (current) =>
    addLayer(current, picture),
  );

  it('leave with the other widgets when another design is applied, and undoing brings them back', () => {
    const layers = defaultTemplate('story').layers.slice(2);
    const applied = applyDesign(withPicture, { layers, photo: framed, background: night }, []);
    expect(applied.layers).toEqual(layers);
    const history = commit(createHistory<EditorDesign>(withPicture), applied);
    expect(undo(history).present).toBe(withPicture);
  });
});

describe('the slots of an applied design', () => {
  const slot = (id: string, image: string): Layer => ({
    id,
    kind: 'image',
    image,
    frame: 'none',
    slot: true,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  });
  const twoSlots = {
    layers: [slot('a', SAMPLE_IMAGE), slot('b', SAMPLE_IMAGE)],
    photo: COVER_PLACEMENT,
    background: night,
  };

  it("take the editor's photo in the first, and the second stays empty", () => {
    expect(applyDesign(INITIAL_DESIGN, twoSlots, [EDITOR_PHOTO]).layers).toEqual([
      slot('a', EDITOR_PHOTO),
      slot('b', SAMPLE_IMAGE),
    ]);
  });

  it('stay empty without a photo', () => {
    expect(applyDesign(INITIAL_DESIGN, twoSlots, []).layers).toEqual(twoSlots.layers);
  });

  it('take the photos that go on, in order, and those left over stay out', () => {
    expect(
      applyDesign(INITIAL_DESIGN, twoSlots, [EDITOR_PHOTO, 'picked-1', 'picked-2']).layers,
    ).toEqual([slot('a', EDITOR_PHOTO), slot('b', 'picked-1')]);
  });

  it('are given back by undoing, with the photo over the canvas again', () => {
    const history = commit(
      createHistory<EditorDesign>(INITIAL_DESIGN),
      applyDesign(INITIAL_DESIGN, twoSlots, [EDITOR_PHOTO]),
    );
    expect(undo(history).present).toEqual(INITIAL_DESIGN);
  });

  it('leave with every widget and the background on choosing a collage, as starting from zero', () => {
    const applied = {
      ...applyDesign(INITIAL_DESIGN, twoSlots, [EDITOR_PHOTO]),
      units: 'mi' as const,
      format: 'square' as const,
    };
    const collage = applyCollage(applied, 'two', 'light');
    expect(collage).toMatchObject({
      ...INITIAL_DESIGN,
      format: 'square',
      units: 'mi',
      collage: newCollage('two'),
      frame: 'light',
      isDesign: false,
    });
  });

  it('do nothing on choosing the collage it already has', () => {
    const collage = applyCollage(INITIAL_DESIGN, 'two', 'light');
    expect(applyCollage(collage, 'two', 'light')).toBe(collage);
  });
});

describe('choosing a collage', () => {
  const slot: Layer = {
    id: 'a',
    kind: 'image',
    image: SAMPLE_IMAGE,
    frame: 'none',
    slot: true,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  };
  const inDesign = applyDesign(
    INITIAL_DESIGN,
    { layers: [slot], photo: COVER_PLACEMENT, background: night },
    [],
  );

  it('keeps the widgets and background of what is not a design, and takes its frame', () => {
    const own = setBackground(withFirstMoved(INITIAL_DESIGN), night);
    const collage = applyCollage(own, 'four', 'light');
    expect(collage.layers).toEqual(own.layers);
    expect(collage.background).toEqual(night);
    expect(collage.frame).toBe('light');
  });

  it('starts from zero over a design, from the gallery and from the panel', () => {
    for (const collage of [
      applyCollage(inDesign, 'four', 'none'),
      setCollageLayout(inDesign, 'four'),
    ]) {
      expect(collage.layers).toBeNull();
      expect(collage.background).toEqual(INITIAL_DESIGN.background);
      expect(collage.collage?.layout).toBe('four');
    }
  });

  it('leaves a design with one photo, the way out of it in the panel', () => {
    const out = setCollageLayout(inDesign, null);
    expect(out).toEqual(INITIAL_DESIGN);
  });

  it('does nothing in the panel with the layout it has, out of a design', () => {
    const collage = setCollageLayout(INITIAL_DESIGN, 'two');
    expect(setCollageLayout(collage, 'two')).toBe(collage);
    expect(setCollageLayout(INITIAL_DESIGN, null)).toBe(INITIAL_DESIGN);
  });
});

describe('start over, to how the canvas started', () => {
  const slot = (image: string): Layer => ({
    id: 'a',
    kind: 'image',
    image,
    frame: 'none',
    slot: true,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    opacity: 1,
  });
  const design = { layers: [slot(SAMPLE_IMAGE)], photo: COVER_PLACEMENT, background: night };
  const chosen = applyDesign(INITIAL_DESIGN, design, []);
  const start = designStart(chosen);

  it('counts a change of format as no edit, though it fitted a widget into the new canvas', () => {
    // A piece as tall as the story: on a wide canvas it is shrunk to fit.
    const sizeOf = () => ({ width: 500, height: 1400 });
    const wide = setFormat(chosen, 'landscape', sizeOf);
    expect(wide.layers?.[0].transform.scale).toBeLessThan(1);
    expect(canStartOver(wide, start)).toBe(false);
    // Moved by hand after it, it is an edit again.
    const moved = {
      ...wide,
      layers: (wide.layers ?? []).map((layer) => ({
        ...layer,
        transform: { ...layer.transform, x: 0.3 },
      })),
    };
    expect(canStartOver(moved, start)).toBe(true);
  });

  it('has nothing to do while the design is as it opened', () => {
    expect(canStartOver(chosen, start)).toBe(false);
    expect(startOver(chosen, start)).toBe(chosen);
  });

  it('goes from a design chosen later back to an empty canvas, if it opened empty', () => {
    const later = applyDesign({ ...INITIAL_DESIGN, photoId: 1 }, design, [EDITOR_PHOTO]);
    expect(canStartOver(later)).toBe(true);
    const back = startOver(later);
    expect(back.layers).toBeNull();
    expect(back.isDesign).toBe(false);
    expect(back.photoId).toBe(1);
  });

  it('goes from another design chosen later back to the one it opened with, its slots empty', () => {
    const later = applyDesign(chosen, { layers: [], photo: framed, background: night }, []);
    expect(canStartOver(later, start)).toBe(true);
    const back = startOver({ ...later, cells: ['picked-1', null, null, null, null] }, start);
    // The collage's photos stay in the collage: the widgets' slots never take them.
    expect(back.layers).toEqual([slot(SAMPLE_IMAGE)]);
    expect(back.cells).toEqual(['picked-1', null, null, null, null]);
    expect(back.photo).toEqual(COVER_PLACEMENT);
    expect(back.isDesign).toBe(true);
  });

  it('counts its photos in its slots as no edit, and keeps them', () => {
    const filled = { ...chosen, layers: [slot('picked-1')] };
    expect(canStartOver(filled, start)).toBe(false);
    const changed = setBackground(filled, { kind: 'transparent' });
    expect(canStartOver(changed, start)).toBe(true);
    expect(startOver(changed, start).layers).toEqual([slot('picked-1')]);
    expect(startOver(changed, start).background).toEqual(night);
  });

  it('goes back to the collage it opened with, with its frame', () => {
    const collage = applyCollage(INITIAL_DESIGN, 'four', 'light');
    const opened = designStart(collage);
    expect(canStartOver(collage, opened)).toBe(false);
    expect(startOver(withFirstMoved(collage), opened)).toMatchObject({
      layers: null,
      collage: newCollage('four'),
      frame: 'light',
    });
  });
});

describe('the photos of a design', () => {
  const withPhoto = { ...INITIAL_DESIGN, photoId: 1, cells: ['picked-1', null, null, null, null] };

  it('stay on starting over', () => {
    const edited = withFirstMoved(withPhoto);
    expect(startOver(edited).photoId).toBe(1);
    expect(startOver(edited).cells).toEqual(withPhoto.cells);
  });

  it('come back on undoing', () => {
    const history = commit(createHistory<EditorDesign>(withPhoto), { ...withPhoto, photoId: 2 });
    expect(undo(history).present.photoId).toBe(1);
  });

  it('are no edit by themselves, for Start over', () => {
    expect(canStartOver(withPhoto)).toBe(false);
  });

  it('stay on choosing another design or collage', () => {
    const applied = applyDesign(
      withPhoto,
      { layers: [], photo: COVER_PLACEMENT, background: night },
      [],
    );
    expect([applied.photoId, applied.cells]).toEqual([1, withPhoto.cells]);
    const collage = applyCollage(applied, 'two', 'none');
    expect([collage.photoId, collage.cells]).toEqual([1, withPhoto.cells]);
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

  it('are settings, not edits: alone there is nothing to start over, and starting over keeps them', () => {
    const own = setLanguage(setUnits(INITIAL_DESIGN, 'mi'), 'en');
    expect(canStartOver(own)).toBe(false);
    expect(startOver(own)).toBe(own);
    const edited = withFirstMoved(own);
    expect(canStartOver(edited)).toBe(true);
    expect(startOver(edited)).toEqual(own);
  });

  it('stay as chosen on undoing, as the format', () => {
    const history = commit(createHistory(INITIAL_DESIGN), withFirstMoved(INITIAL_DESIGN));
    const chosen = mapHistory(history, (design) =>
      setFormat(setLanguage(setUnits(design, 'mi'), 'en'), 'square'),
    );
    expect(chosen.past).toHaveLength(1);
    const undone = undo(chosen).present;
    expect(undone.layers).toBeNull();
    expect([undone.units, undone.language, undone.format]).toEqual(['mi', 'en', 'square']);
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
    expect(setCollageLayout(collage, null).collage).toBeNull();
  });

  it('records nothing for the same layout, frame or placement', () => {
    expect(setCollageLayout(INITIAL_DESIGN, null)).toBe(INITIAL_DESIGN);
    const collage = setCollageLayout(INITIAL_DESIGN, 'two');
    expect(setCollageLayout(collage, 'two')).toBe(collage);
    expect(setFrame(collage, 'none')).toBe(collage);
    expect(setCellPlacement(collage, 1, COVER_PLACEMENT)).toBe(collage);
  });

  it('has no cell to place in a single photo', () => {
    expect(setCellPlacement(INITIAL_DESIGN, 1, moved)).toBe(INITIAL_DESIGN);
  });

  it('frames a single photo too, and keeps it on going to a collage and back', () => {
    const framedPhoto = setFrame(INITIAL_DESIGN, 'light');
    expect(framedPhoto.frame).toBe('light');
    const collage = setCollageLayout(framedPhoto, 'four');
    expect(collage.frame).toBe('light');
    expect(setCollageLayout(collage, null).frame).toBe('light');
  });

  it('counts its frame for starting over, which takes it away', () => {
    const framedPhoto = setFrame(INITIAL_DESIGN, 'dark');
    expect(canStartOver(framedPhoto)).toBe(true);
    expect(startOver(framedPhoto).frame).toBe('none');
  });

  it('takes the frame into the template only when it has one, and back from a saved one', () => {
    const defaults = (format: Parameters<typeof defaultActivityTemplate>[1]) =>
      defaultActivityTemplate(makeActivity(), format);
    expect(layoutTemplate(defaults, INITIAL_DESIGN)).not.toHaveProperty('frame');
    const saved = layoutTemplate(defaults, setFrame(INITIAL_DESIGN, 'dark'));
    expect(saved.frame).toBe('dark');
    expect(applyDesign(INITIAL_DESIGN, saved, []).frame).toBe('dark');
    expect(
      applyDesign(setFrame(INITIAL_DESIGN, 'dark'), layoutTemplate(defaults, INITIAL_DESIGN), [])
        .frame,
    ).toBe('none');
  });

  it('keeps the frame, the widgets and where each photo was, on changing layouts', () => {
    const framed = setFrame(setCollageLayout(withFirstMoved(INITIAL_DESIGN), 'six'), 'dark');
    const placed = setCellPlacement(framed, 5, moved);
    const fewer = setCollageLayout(placed, 'two');
    expect(fewer.frame).toBe('dark');
    expect(fewer.layers).toEqual(placed.layers);
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
    const applied = applyDesign(INITIAL_DESIGN, saved, []);
    expect(applied.collage?.layout).toBe('four');
    const plain = layoutTemplate(defaults, INITIAL_DESIGN);
    expect(applyDesign(applied, plain, []).collage).toBeNull();
  });

  it('counts for starting over, which takes it away', () => {
    const collage = setCollageLayout(INITIAL_DESIGN, 'two');
    expect(canStartOver(collage)).toBe(true);
    expect(startOver(collage).collage).toBeNull();
  });
});
