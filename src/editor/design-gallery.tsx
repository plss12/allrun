import { FlashList } from '@shopify/flash-list';
import type { SkImage } from '@shopify/react-native-skia';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spinner } from '@/ui/spinner';
import { newCollage } from '@/core/collage';
import { READY_DESIGN_IDS, type ReadyDesignId } from '@/core/designs';
import { isPhotoSlot } from '@/core/image-layer';
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

/** Room around and between the thumbnails, in points. */
const PADDING = 16;
const GAP = 12;

/**
 * The collages, in the order of the Collages panel, with the stock photos that suit their cells:
 * tall ones where the cells are tall, wide ones where they are wide. One photo isn't a collage.
 */
const COLLAGES: readonly {
  readonly layout: CollageLayout;
  readonly photos: readonly StockPhoto[];
}[] = [
  { layout: 'two', photos: ['stadiumField', 'brickWall'] },
  { layout: 'three', photos: ['runway', 'concreteWall', 'monoStride'] },
  { layout: 'four', photos: ['forestBridge', 'trackShadow', 'monoSprinter', 'trackShoes'] },
  {
    layout: 'six',
    photos: [
      'forestTrail',
      'streetCrossing',
      'trackShadow',
      'forestBridge',
      'monoSprinter',
      'trackShoes',
    ],
  },
  { layout: 'oneTwo', photos: ['woodlandPath', 'trackShoes', 'streetCrossing'] },
];

const COLLAGE_FRAMES: readonly ImageFrame[] = ['none', 'light', 'dark'];

/** The stock photos in the slots of AllRun's designs. */
const READY_PHOTOS: Readonly<Record<ReadyDesignId, readonly StockPhoto[]>> = {
  messageOne: ['streetCrossing'],
  messageTwo: ['forestBridge', 'trackShadow'],
  filmFrame: ['monoSprinter'],
  lightNegative: ['forestTrail'],
  filmStrip: ['trackShoes'],
  camera: ['forestBridge'],
  crop: ['trackShadow'],
};

/** What fills a saved design's thumbnail: its slots, its photo or its cells, one after another. */
const SAVED_PHOTOS: readonly StockPhoto[] = [
  'monoSprinter',
  'forestBridge',
  'trackShoes',
  'streetCrossing',
  'trackShadow',
  'forestTrail',
];

/** `template` with the photos `names` in its slots, by the keys of `images`. */
function withStock(template: Template, names: readonly StockPhoto[]): Template {
  let next = 0;
  return {
    ...template,
    layers: template.layers.map((layer) => {
      if (!isPhotoSlot(layer)) {
        return layer;
      }
      next += 1;
      return { ...layer, image: names[(next - 1) % names.length] };
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
  | { readonly kind: 'collages'; readonly key: string }
  | { readonly kind: 'tiles'; readonly key: string; readonly tiles: readonly Tile[] }
  | { readonly kind: 'yours'; readonly key: string; readonly tiles: readonly Tile[] };

/** `items` in rows of `columns`. Time and space O(n). */
function inRows<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / columns) }, (_, row) =>
    items.slice(row * columns, (row + 1) * columns),
  );
}

interface DesignGalleryProps {
  readonly context: LayerContext;
  /** The format to show designs in; a user's own always go in theirs. */
  readonly format: CanvasFormat;
  /** Whether a user's design of any format shows, each in its own (where no format is chosen yet). */
  readonly anyFormat?: boolean;
  /** The stock photos, once decoded. */
  readonly stock: StockPhotos | null;
  readonly userTemplates: UserTemplates;
  /** The design on the canvas, which the first tile of Yours saves; absent, no such tile. */
  readonly current?: Template;
  readonly onChoose: (choice: DesignChoice) => void;
  /** Goes over the gallery, scrolling with it. */
  readonly top?: ReactNode;
  /** How far down the list starts, so that it can pass under the screen's header. */
  readonly topInset?: number;
}

/**
 * The Designs gallery (ADR 009), the same in the selection screen's tab and in the editor's sheet:
 * Collages (every layout without a frame, then with a white one, then with a black one, in one row
 * that scrolls sideways, for AllRun's to show without scrolling down), Designs (AllRun's, with the
 * user's data) and Yours, each drawn with our stock photos (see `stock-photos.ts`). Only the tiles
 * on screen are mounted; AllRun's and the user's widgets are laid
 * out once, for what they show, and freed when the gallery goes.
 */
export function DesignGallery({
  context,
  format,
  anyFormat = false,
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
  const columns = format === 'landscape' ? 2 : 3;
  const width = Math.floor((window.width - 2 * PADDING - (columns - 1) * GAP) / columns);
  const height = (width * CANVAS_FORMATS[format].height) / CANVAS_FORMATS[format].width;

  const saved =
    userTemplates.status !== 'success'
      ? []
      : anyFormat
        ? userTemplates.data.filter(({ template }) => template.mode === context.data.mode)
        : templatesFor(userTemplates.data, format, context.data.mode);
  const savedKey = saved.map(({ template }) => template.id).join(',');
  const dataKey = [
    JSON.stringify(
      context.data.mode === 'activity'
        ? context.data.activity.id
        : [context.data.summary.range, context.data.families],
    ),
    context.textContext.unit,
    context.textContext.locale,
    format,
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
    return inParagraphArena(() => ({
      ready: READY_DESIGN_IDS.map((id) => {
        const template = withStock(readyTemplate(id, context, format), READY_PHOTOS[id]);
        return { id, template, layers: prepareLayers(template, shown) };
      }),
      saved: saved.map((one) => {
        const template = withStock(one.template, SAVED_PHOTOS);
        return { one, template, layers: prepareLayers(template, shown) };
      }),
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
        format,
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
    // With slots, those show the photos; without any, it goes over the canvas.
    photos: template.layers.some(isPhotoSlot) ? [] : photosOf(READY_PHOTOS[id]),
    choice: { kind: 'ready', id },
  }));
  const savedTiles = laidOut.value.saved.map(({ one, template }, i): Tile => ({
    key: template.id,
    label: t('templates.saved', { number: i + 1 }),
    template,
    // With slots, those show the photos: over the canvas, one would hide the design.
    photos: template.layers.some(isPhotoSlot) ? [] : photosOf(SAVED_PHOTOS),
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

  const rows: readonly Row[] = [
    { kind: 'title', key: 'title-collages', title: t('templates.collages') },
    { kind: 'collages', key: 'collages' },
    { kind: 'title', key: 'title-ready', title: t('templates.allrun') },
    ...inRows(readyTiles, columns).map((tiles, i): Row => ({
      kind: 'tiles',
      key: `ready-${i}`,
      tiles,
    })),
    { kind: 'title', key: 'title-yours', title: t('templates.yours') },
    ...(showSave || savedTiles.length === 0
      ? [{ kind: 'yours', key: 'yours-0', tiles: savedTiles.slice(0, columns - 1) } as const]
      : []),
    ...inRows(savedTiles.slice(showSave || savedTiles.length === 0 ? columns - 1 : 0), columns).map(
      (tiles, i): Row => ({ kind: 'tiles', key: `yours-${i + 1}`, tiles }),
    ),
  ];

  const tile = (one: Tile) => (
    <View key={one.key} style={{ width }}>
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
          loading={stock === null}
          width={width}
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
                width={width}
                height={height}
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
