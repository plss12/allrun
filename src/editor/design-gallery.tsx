import { FlashList } from '@shopify/flash-list';
import type { SkImage } from '@shopify/react-native-skia';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spinner } from '@/ui/spinner';
import { newCollage } from '@/core/collage';
import { READY_DESIGN_IDS, type ReadyDesignId } from '@/core/designs';
import { isPhotoSlot, layerPictures, withWindowPicture } from '@/core/image-layer';
import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type CollageLayout,
  type ImageFrame,
  newTemplate,
  type Template,
} from '@/core/template';
import { isSaved, saveDesign, type SavedTemplate, templatesFor } from '@/core/user-templates';
import { newTemplateId } from '@/data/template-store';
import type { UserTemplates } from '@/data/user-templates';
import { colors } from '@/theme/colors';
import { AppIcon } from '@/ui/app-icon';
import { logError } from '@/ui/log';
import { SheetScrollView } from '@/ui/sheet';
import { Text } from '@/ui/text';

import type { DesignChoice } from './design-choice';
import { disposeLater, inParagraphArena } from './paragraph-arena';
import { readyTemplate } from './ready-design';
import { type StockPhoto, stockImages, type StockPhotos } from './stock-photos';
import { type LayerContext, prepareLayers } from './template-scene';
import { TemplateThumbnail } from './template-thumbnail';
import { packRows } from './tile-rows';
import { GALLERY_FORMAT } from './widget-gallery';

/** Room around and between the thumbnails, in points. */
const PADDING = 16;
const GAP = 12;
/** Thumbnails per row: AllRun's fifteen designs fill their rows. */
const COLUMNS = 3;

/**
 * The collages, in the order of the Collages panel, with the stock photos that suit their cells:
 * tall ones where the cells are tall, wide ones where they are wide. One photo isn't a collage.
 */
const COLLAGES: readonly {
  readonly layout: CollageLayout;
  readonly photos: readonly StockPhoto[];
}[] = [
  // A theme each, none repeated (the user's choice): a ride, the sea, the city, the trail, the track.
  { layout: 'two', photos: ['seasideRide', 'mountainRoad'] },
  { layout: 'three', photos: ['beachSunset', 'shoreSplash', 'harbourSwim'] },
  { layout: 'four', photos: ['riversideRun', 'brickWall', 'concreteWall', 'streetCrossing'] },
  {
    layout: 'six',
    photos: ['foggyHill', 'trailRidge', 'muddyLegs', 'forestBridge', 'woodlandPath', 'forestTrail'],
  },
  { layout: 'oneTwo', photos: ['stadiumField', 'trackShadow', 'trackShoes'] },
];

const COLLAGE_FRAMES: readonly ImageFrame[] = ['none', 'light', 'dark'];

/**
 * The stock photos of AllRun's designs, in their slots; one shown over a photo of the canvas (see
 * `stockOf`) has that one first.
 */
const READY_PHOTOS: Readonly<Record<ReadyDesignId, readonly StockPhoto[]>> = {
  // Each its piece's photos in the widget gallery, and a landscape behind those over one, none
  // twice in a row of three.
  polaroid: ['beachSunset', 'foggyHill'],
  polaroidDark: ['riversideRun', 'shoreSplash'],
  camera: ['trailRidge'],
  crop: ['duskSilhouette'],
  filmFrame: ['monoStride'],
  lightNegative: ['forestTrail'],
  filmStrip: ['sunriseCyclist'],
  margins: ['muddyLegs', 'forestBridge', 'woodlandPath'],
  marginsPair: ['seasideRide', 'mountainRoad'],
  slides: ['harbourSwim', 'seaSwimmer', 'beachSunset'],
  photobooth: ['stadiumField', 'trackShadow', 'trackShoes', 'runway'],
  messageOne: ['streetCrossing'],
  messageTwo: ['brickWall', 'concreteWall'],
  calendar: ['mountainRoad', 'mountainRunner'],
  calendarInk: ['stadiumField', 'monoSprinter'],
};

/**
 * The stock photos `names` of a design: the one over its canvas, if its thumbnail shows one, and
 * those of its slots. A design over the canvas's photo (without a color of its own: the Polaroid)
 * shows a landscape behind its slots, as it is made to be used; one over its color, its color; any
 * design without slots, a photo over its canvas.
 */
function stockOf(
  template: Template,
  names: readonly StockPhoto[],
): { readonly canvas: readonly StockPhoto[]; readonly slots: readonly StockPhoto[] } {
  if (!template.layers.some(isPhotoSlot)) {
    return { canvas: names, slots: [] };
  }
  return template.background.kind !== 'color'
    ? { canvas: names.slice(0, 1), slots: names.slice(1) }
    : { canvas: [], slots: names };
}

/**
 * `template` with its stock photos `names` in the windows of its slots (see `stockOf`), by their
 * keys, in order and again from the first if they run out.
 */
function withStock(template: Template, all: readonly StockPhoto[]): Template {
  const names = stockOf(template, all).slots;
  let next = 0;
  return {
    ...template,
    layers: template.layers.map((layer) => {
      if (!isPhotoSlot(layer)) {
        return layer;
      }
      return layerPictures(layer).reduce((filled, _, window) => {
        next += 1;
        return withWindowPicture(filled, window, names[(next - 1) % names.length]);
      }, layer);
    }),
  };
}

/** A thumbnail of the gallery: what it draws, and what choosing it does. */
interface Tile {
  readonly key: string;
  readonly label: string;
  readonly template: Template;
  readonly photos: readonly SkImage[];
  readonly choice: DesignChoice;
  /** One of the user's designs, which can be deleted. */
  readonly saved?: SavedTemplate;
}

/** A row of the list. */
type Row =
  | { readonly kind: 'title'; readonly key: string; readonly title: string }
  | { readonly kind: 'subtitle'; readonly key: string; readonly title: string }
  | { readonly kind: 'collages'; readonly key: string }
  | { readonly kind: 'tiles'; readonly key: string; readonly tiles: readonly Tile[] }
  | { readonly kind: 'yours'; readonly key: string; readonly tiles: readonly Tile[] };

/**
 * Columns a design of `format` takes: a wide one, the whole row, to show big (the user's choice:
 * in one column it was a thin strip); the rest, one.
 */
function spanOf(format: CanvasFormat): number {
  const canvas = CANVAS_FORMATS[format];
  return canvas.width > canvas.height ? COLUMNS : 1;
}

/** The formats in the order the user's designs go in: tall to wide, as `CANVAS_FORMATS`. */
const FORMAT_ORDER = Object.keys(CANVAS_FORMATS) as CanvasFormat[];

interface DesignGalleryProps {
  readonly context: LayerContext;
  /** The stock photos, once decoded. */
  readonly stock: StockPhotos | null;
  readonly userTemplates: UserTemplates;
  /**
   * The design on the canvas: the first tile of Yours saves it, and Yours shows only the user's
   * designs of its format. Absent (the selection screen's tab, before any format is chosen), all
   * of them, each in its own.
   */
  readonly current?: Template;
  readonly onChoose: (choice: DesignChoice) => void;
  /** Goes over the gallery, scrolling with it. */
  readonly top?: ReactNode;
  /** How far down the list starts, so that it can pass under the screen's header. */
  readonly topInset?: number;
}

/**
 * The Designs gallery (ADR 009), the same in the selection screen's tab and in the editor's sheet:
 * Yours (first, with the tile that saves the current design, the user's choice; a wide one two
 * columns wide), Collages (every layout without a frame, then with a white one, then with a black
 * one, in one row that scrolls sideways, for AllRun's to show without scrolling down) and Designs
 * (AllRun's, with the user's data), each drawn with our stock photos (see `stock-photos.ts`).
 * Collages and AllRun's are drawn in `GALLERY_FORMAT` whatever the canvas, and fit it once chosen;
 * the user's, each in its own. Only the tiles on screen are mounted; AllRun's and the user's
 * widgets are laid out once, for what they show, and freed when the gallery goes.
 */
export function DesignGallery({
  context,
  stock,
  userTemplates,
  current,
  onChoose,
  top = null,
  topInset = 0,
}: DesignGalleryProps) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = Math.floor((window.width - 2 * PADDING - (COLUMNS - 1) * GAP) / COLUMNS);
  const height =
    (width * CANVAS_FORMATS[GALLERY_FORMAT].height) / CANVAS_FORMATS[GALLERY_FORMAT].width;
  /** The width of a thumbnail `span` columns wide. */
  const spanWidth = (span: number) => span * width + (span - 1) * GAP;

  const saved =
    userTemplates.status !== 'success'
      ? []
      : current === undefined
        ? userTemplates.data
            .filter(({ template }) => template.mode === context.data.mode)
            // Newest first, as in the editor (`templatesFor`).
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        : templatesFor(userTemplates.data, current.format, context.data.mode);
  const savedKey = saved.map(({ template }) => template.id).join(',');
  const dataKey = [
    JSON.stringify(
      context.data.mode === 'activity'
        ? context.data.activity.id
        : [context.data.summary.range, context.data.families],
    ),
    context.textContext.unit,
    context.textContext.locale,
    stock === null ? 'loading' : 'ready',
    savedKey,
  ].join('|');

  const laidOut = useMemo(() => {
    const shown: LayerContext = {
      ...context,
      images: stock === null ? new Map() : stockImages(stock),
      // Thumbnails fill their slots, whatever the canvas behind the sheet does with its own.
      emptySlots: undefined,
    };
    // The user's designs show their photos' places with the "+" of the canvas, never our photos:
    // the same ones in all of them looked repetitive (the user's choice).
    const unfilled: LayerContext = { ...context, images: new Map(), emptySlots: 'hint' };
    return inParagraphArena(() => ({
      ready: READY_DESIGN_IDS.map((id) => {
        const template = withStock(readyTemplate(id, context, GALLERY_FORMAT), READY_PHOTOS[id]);
        return { id, template, layers: prepareLayers(template, shown) };
      }),
      saved: saved.map((one) => ({
        one,
        template: one.template,
        layers: prepareLayers(one.template, unfilled),
      })),
    }));
    // The context is recreated on every render; the key says what it lays out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
  useEffect(() => () => disposeLater(laidOut.dispose), [laidOut]);

  const [saving, setSaving] = useState(false);
  const saveCurrent = async () => {
    if (current === undefined) {
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      await userTemplates.save(saveDesign(current, newTemplateId(now), now.toISOString()));
    } catch (error) {
      logError('Could not save the template', error);
      Alert.alert(t('templates.saveError'));
    } finally {
      setSaving(false);
    }
  };
  const confirmRemove = (one: SavedTemplate) =>
    Alert.alert(t('templates.deleteTitle'), t('templates.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('templates.delete'),
        style: 'destructive',
        onPress: () => {
          userTemplates.remove(one.template.id).catch((error: unknown) => {
            logError('Could not delete the template', error);
            Alert.alert(t('templates.deleteError'));
          });
        },
      },
    ]);

  /** The photos `names`, once decoded; until then none, and the tile shows its place for them. */
  const photosOf = (names: readonly StockPhoto[]) =>
    stock === null ? [] : names.map((name) => stock[name]);

  const collageTiles = COLLAGE_FRAMES.flatMap((frame) =>
    COLLAGES.map(({ layout, photos }): Tile => {
      const base = newTemplate({
        id: `collage-${layout}-${frame}`,
        mode: context.data.mode,
        format: GALLERY_FORMAT,
        layers: [],
      });
      return {
        key: base.id,
        label: `${t(`editor.collageLayouts.${layout}`)}, ${t(`editor.collageFrames.${frame}`)}`,
        template: {
          ...base,
          collage: newCollage(layout),
          ...(frame === 'none' ? {} : { frame }),
        },
        photos: photosOf(photos),
        choice: { kind: 'collage', layout, frame },
      };
    }),
  );
  const readyTiles = laidOut.value.ready.map(({ id, template }): Tile => ({
    key: template.id,
    label: t(`templates.ready.${id}`),
    template,
    // With slots, those show the photos; without any, or with only some that leave it, one goes
    // over the canvas.
    photos: photosOf(stockOf(template, READY_PHOTOS[id]).canvas),
    choice: { kind: 'ready', id },
  }));
  const savedTiles = laidOut.value.saved.map(({ one, template }, i): Tile => ({
    key: template.id,
    label: t('templates.saved', { number: i + 1 }),
    template,
    // No photo: the canvas's place shows as transparency, unless the design has a color there.
    photos: [],
    choice: { kind: 'saved', template: one.template },
    saved: one,
  }));
  const layersOf = (tile: Tile) =>
    laidOut.value.ready.find(({ template }) => template.id === tile.key)?.layers ??
    laidOut.value.saved.find(({ template }) => template.id === tile.key)?.layers ??
    [];

  const alreadySaved =
    current !== undefined && userTemplates.status === 'success'
      ? isSaved(userTemplates.data, current)
      : false;
  const showSave = current !== undefined && userTemplates.status === 'success';

  // Yours starts with the tile that saves the current design, as big as one of its format, as the
  // first of them; or says why there is none yet.
  const yoursStart = showSave || savedTiles.length === 0;
  const startFormat = current?.format ?? GALLERY_FORMAT;
  const tileSpan = (one: Tile) => spanOf(one.template.format);
  // The user's designs by format, each format's together, not to mix heights in a row (the user's
  // choice: mixed, they looked a mess); in the editor there is only the canvas's.
  const formatGroups = FORMAT_ORDER.map((format) =>
    savedTiles.filter((one) => one.template.format === format),
  ).filter((group) => group.length > 0);
  // Each format's under its proportions where they may be several (the tab), to tell them apart.
  const yoursRows: readonly Row[] =
    formatGroups.length === 0
      ? yoursStart
        ? [{ kind: 'yours', key: 'yours-start', tiles: [] }]
        : []
      : formatGroups.flatMap((group, i) => {
          const { format } = group[0].template;
          return [
            ...(current === undefined
              ? [
                  {
                    kind: 'subtitle',
                    key: `yours-${format}`,
                    title: t(`formatRatios.${format}`),
                  } as const,
                ]
              : []),
            ...packRows(
              group,
              tileSpan,
              COLUMNS,
              i === 0 && yoursStart ? spanOf(startFormat) : 0,
            ).map((tiles, j): Row => ({
              kind: i === 0 && j === 0 && yoursStart ? 'yours' : 'tiles',
              key: `yours-${format}-${j}`,
              tiles,
            })),
          ];
        });
  const rows: readonly Row[] = [
    { kind: 'title', key: 'title-yours', title: t('templates.yours') },
    ...yoursRows,
    { kind: 'title', key: 'title-collages', title: t('templates.collages') },
    { kind: 'collages', key: 'collages' },
    { kind: 'title', key: 'title-ready', title: t('templates.allrun') },
    ...packRows(readyTiles, tileSpan, COLUMNS).map((tiles, i): Row => ({
      kind: 'tiles',
      key: `ready-${i}`,
      tiles,
    })),
  ];

  const tile = (one: Tile) => {
    const tileWidth = spanWidth(tileSpan(one));
    return (
      <View key={one.key} style={{ width: tileWidth }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={one.label}
          onPress={() => onChoose(one.choice)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {/* Square corners: rounded ones would cut the corners of a design's frame. */}
          <TemplateThumbnail
            template={one.template}
            layers={layersOf(one)}
            photos={one.photos}
            // A user's design waits for no photo: what it leaves empty is transparency or its "+".
            loading={one.saved === undefined && stock === null}
            emptyHints={one.saved !== undefined}
            width={tileWidth}
          />
        </Pressable>
        {one.saved === undefined ? null : (
          <DeleteButton
            label={t('templates.delete')}
            onPress={() => {
              if (one.saved !== undefined) {
                confirmRemove(one.saved);
              }
            }}
          />
        )}
      </View>
    );
  };

  return (
    <FlashList
      // In a sheet, scrolled to its top, pulling down drags the sheet.
      renderScrollComponent={SheetScrollView}
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.kind}
      ListHeaderComponent={<>{top}</>}
      contentContainerStyle={{
        paddingHorizontal: PADDING,
        paddingTop: topInset,
        paddingBottom: insets.bottom + PADDING,
      }}
      renderItem={({ item: row }) => {
        if (row.kind === 'title') {
          return (
            <Text
              accessibilityRole="header"
              style={{
                color: colors.secondaryLabel,
                fontSize: 13,
                fontWeight: '600',
                paddingTop: 12,
                paddingBottom: 8,
              }}
            >
              {row.title.toLocaleUpperCase()}
            </Text>
          );
        }
        if (row.kind === 'subtitle') {
          return (
            <Text
              accessibilityRole="header"
              style={{
                color: colors.secondaryLabel,
                fontSize: 13,
                paddingBottom: 8,
              }}
            >
              {row.title}
            </Text>
          );
        }
        if (row.kind === 'collages') {
          return (
            <View style={{ height, marginHorizontal: -PADDING, marginBottom: GAP }}>
              <FlashList
                horizontal
                // Only the collages on screen: each is a scene of photos to draw, and the tab opens
                // with all the row's drawn at once.
                drawDistance={0}
                data={collageTiles}
                keyExtractor={(one) => one.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: PADDING }}
                ItemSeparatorComponent={CollageGap}
                renderItem={({ item }) => tile(item)}
              />
            </View>
          );
        }
        return (
          <View style={{ flexDirection: 'row', gap: GAP, paddingBottom: GAP }}>
            {row.kind === 'yours' ? (
              <YoursStart
                width={spanWidth(spanOf(startFormat))}
                height={
                  (spanWidth(spanOf(startFormat)) * CANVAS_FORMATS[startFormat].height) /
                  CANVAS_FORMATS[startFormat].width
                }
                showSave={showSave}
                saved={alreadySaved}
                saving={saving}
                onSave={() => void saveCurrent()}
                status={userTemplates.status}
                onRetry={userTemplates.status === 'error' ? userTemplates.retry : undefined}
                none={savedTiles.length === 0}
              />
            ) : null}
            {row.tiles.map(tile)}
          </View>
        );
      }}
    />
  );
}

/** The room between two collages of their row. */
function CollageGap() {
  return <View style={{ width: GAP }} />;
}

/** The corner button that deletes one of the user's designs. */
function DeleteButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({
        position: 'absolute',
        top: 6,
        right: 6,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <AppIcon name="close" size={16} color="#FFFFFF" />
    </Pressable>
  );
}

/** How Yours starts: saving the current design, or why there is nothing yet. */
function YoursStart({
  width,
  height,
  showSave,
  saved,
  saving,
  onSave,
  status,
  onRetry,
  none,
}: {
  readonly width: number;
  readonly height: number;
  readonly showSave: boolean;
  readonly saved: boolean;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly status: UserTemplates['status'];
  readonly onRetry?: () => void;
  readonly none: boolean;
}) {
  const { t } = useTranslation();
  if (status === 'loading') {
    return <Spinner accessibilityLabel={t('common.loading')} style={{ height }} />;
  }
  if (status === 'error') {
    return (
      <View style={{ gap: 8, alignItems: 'flex-start' }}>
        <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>
          {t('templates.loadError')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: colors.tint, fontSize: 17 }}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }
  if (showSave) {
    return <SaveTile width={width} height={height} saved={saved} busy={saving} onPress={onSave} />;
  }
  return none ? (
    <Text style={{ color: colors.secondaryLabel, fontSize: 15 }}>{t('templates.noneYet')}</Text>
  ) : null;
}

/** "Save current design", in a tile the size of a thumbnail; done once the design is saved. */
function SaveTile({
  width,
  height,
  saved,
  busy,
  onPress,
}: {
  readonly width: number;
  readonly height: number;
  readonly saved: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const disabled = saved || busy;
  const label = saved ? t('templates.savedCurrent') : t('templates.saveCurrent');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height,
        padding: 8,
        gap: 8,
        borderRadius: 8,
        borderCurve: 'continuous',
        borderWidth: 1.5,
        borderStyle: saved ? 'solid' : 'dashed',
        borderColor: saved ? colors.separator : colors.tint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {busy ? (
        <Spinner />
      ) : (
        <AppIcon
          name={saved ? 'check' : 'add'}
          size={24}
          color={saved ? colors.secondaryLabel : colors.tint}
        />
      )}
      <Text
        // It breaks into lines rather than shrinking, which on Android shrank it even when it fit.
        numberOfLines={3}
        maxFontSizeMultiplier={1.3}
        importantForAccessibility="no"
        style={{
          color: saved ? colors.secondaryLabel : colors.tint,
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
