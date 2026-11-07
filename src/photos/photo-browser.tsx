import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { addListener, presentPermissionsPicker } from 'expo-media-library';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  askPhotoAccess,
  type LibraryPhoto,
  loadAlbums,
  loadPhotos,
  type PhotoAccess,
  type PhotoAlbum,
  type PhotoSource,
  readPhotoAccess,
} from '@/data/photo-library';
import { KeptMounted, PillButton } from '@/editor/round-button';
import { smallCardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { formatRelativeDay } from '@/ui/format';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { SheetScrollView } from '@/ui/sheet';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { Text } from '@/ui/text';
import { dayOfMoment, todayLocal } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

import { allowStep, settingsAfterAsking } from './photo-access';

/** Photos asked for at a time: a few screens' worth, read as the user scrolls. */
const PAGE_SIZE = 120;
const COLUMNS = 3;
/** Half the room between two photos, in points. */
const HALF_GAP = 1;

const SHELVES = ['recent', 'favorites', 'albums'] as const;
type Shelf = (typeof SHELVES)[number];

/**
 * What the app can read of the library: asked for as the screen opens, since showing the photos is
 * what it is for, and read again on coming back from the system's Settings.
 */
function usePhotoAccess(): {
  readonly access: PhotoAccess | null;
  readonly ask: () => void;
} {
  const [access, setAccess] = useState<PhotoAccess | null>(null);
  const failed = (error: unknown) => {
    logError('Could not read the access to the photos', error);
    setAccess({ level: 'none', canAskAgain: false });
  };
  useEffect(() => {
    void askPhotoAccess().then(setAccess).catch(failed);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void readPhotoAccess().then(setAccess).catch(failed);
      }
    });
    return () => subscription.remove();
  }, []);
  return {
    access,
    ask: () => {
      if (access === null) {
        return;
      }
      if (allowStep(access, Platform.OS) === 'settings') {
        void Linking.openSettings();
        return;
      }
      const asked = Date.now();
      void askPhotoAccess()
        .then((after) => {
          setAccess(after);
          if (settingsAfterAsking(after, Date.now() - asked)) {
            void Linking.openSettings();
          }
        })
        .catch(failed);
    },
  };
}

/** A list of photos read page by page, and read again when the library changes. */
function useLibraryPhotos(source: PhotoSource): {
  readonly photos: readonly LibraryPhoto[];
  readonly status: 'loading' | 'error' | 'ready';
  readonly loadMore: () => void;
  readonly retry: () => void;
} {
  const [photos, setPhotos] = useState<readonly LibraryPhoto[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  // Which load is current (a slower one of an earlier list is ignored), and where the next starts.
  const current = useRef(0);
  const busy = useRef(false);
  const next = useRef<number | null>(0);
  const key = source.kind === 'album' ? source.albumId : source.kind;

  const load = useCallback(
    (from: number) => {
      const load = ++current.current;
      busy.current = true;
      return loadPhotos(source, from, PAGE_SIZE)
        .then((page) => {
          if (load === current.current) {
            setPhotos((shown) => (from === 0 ? page.photos : [...shown, ...page.photos]));
            setStatus('ready');
            next.current = page.next;
            busy.current = false;
          }
        })
        .catch((error: unknown) => {
          if (load === current.current) {
            logError('Could not read the photos', error);
            setStatus('error');
            busy.current = false;
          }
        });
    },
    // The source is the same while its key is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    void load(0);
    const subscription = addListener(() => void load(0));
    return () => {
      subscription.remove();
      current.current += 1;
    };
  }, [load]);

  return {
    photos,
    status,
    loadMore: () => {
      if (!busy.current && next.current !== null) {
        void load(next.current);
      }
    },
    retry: () => {
      setStatus('loading');
      void load(0);
    },
  };
}

/** The mark of a photo while choosing several: its size, and its room from the corner. */
const MARK = { size: 24, inset: 6 } as const;

/**
 * A photo of the grid, square and cut to fit, drawn from the library at its size. While choosing
 * several (`order` not `undefined`), a ring in its corner, filled with its place among those
 * chosen (`order`, from 1) once chosen, as Instagram marks them.
 */
function PhotoCell({
  photo,
  label,
  order,
  onPress,
}: {
  readonly photo: LibraryPhoto;
  readonly label: string;
  readonly order?: number | null;
  readonly onPress: () => void;
}) {
  const chosen = order !== undefined && order !== null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={order === undefined ? undefined : { selected: chosen }}
      onPress={onPress}
      style={({ pressed }) => ({
        aspectRatio: 1,
        padding: HALF_GAP,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Image
        source={{ uri: photo.id }}
        recyclingKey={photo.id}
        contentFit="cover"
        cachePolicy="memory"
        style={{ flex: 1, backgroundColor: colors.secondarySystemBackground }}
      />
      {order === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            top: HALF_GAP + MARK.inset,
            right: HALF_GAP + MARK.inset,
            width: MARK.size,
            height: MARK.size,
            borderRadius: MARK.size / 2,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: chosen ? colors.tint : 'rgba(0, 0, 0, 0.25)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {chosen ? (
            <Text
              style={{
                color: colors.onTint,
                fontSize: 13,
                lineHeight: 16,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {String(order)}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** The first cell of the recent photos: a design without a photo, on a transparent canvas. */
function NoPhotoCell({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        aspectRatio: 1,
        padding: HALF_GAP,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          backgroundColor: colors.secondarySystemBackground,
        }}
      >
        <Text style={{ color: colors.label, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
          {t('photos.noPhoto')}
        </Text>
      </View>
    </Pressable>
  );
}

/** What goes on top of a list, scrolling with it, and how far down it starts. */
interface ListTop {
  readonly header: ReactNode;
  readonly inset: number;
}

/** A screen's state without a list (loading, empty…), under what goes on top of the list. */
function Framed({ top, children }: { readonly top: ListTop; readonly children: ReactNode }) {
  return (
    <View style={{ flex: 1, paddingTop: top.inset }}>
      {top.header}
      {children}
    </View>
  );
}

type GridItem =
  { readonly kind: 'none' } | { readonly kind: 'photo'; readonly photo: LibraryPhoto };

const NO_PHOTO_ITEM: GridItem = { kind: 'none' };

/**
 * The photos of `source` in a grid, keeping only what is on screen. While choosing several
 * (`chosen` given), each shows its mark, and `bottom` points stay free under the list for the
 * button that adds them.
 */
function PhotoGrid({
  source,
  top,
  emptyMessage,
  onPick,
  onNoPhoto,
  chosen,
  bottom = 0,
}: {
  readonly source: PhotoSource;
  readonly top: ListTop;
  readonly emptyMessage: string;
  readonly onPick: (id: string) => void;
  readonly onNoPhoto?: () => void;
  readonly chosen?: readonly string[];
  readonly bottom?: number;
}) {
  const { t } = useTranslation();
  const { locale } = useDisplaySettings();
  const insets = useSafeAreaInsets();
  const { photos, status, loadMore, retry } = useLibraryPhotos(source);
  if (status === 'loading') {
    return (
      <Framed top={top}>
        <LoadingView />
      </Framed>
    );
  }
  if (status === 'error') {
    return (
      <Framed top={top}>
        <ErrorView message={t('photos.error')} onRetry={retry} />
      </Framed>
    );
  }
  if (photos.length === 0 && onNoPhoto === undefined) {
    return (
      <Framed top={top}>
        <EmptyView message={emptyMessage} />
      </Framed>
    );
  }
  const today = todayLocal();
  const labelOf = ({ takenAt }: LibraryPhoto) => {
    const day = takenAt === null ? null : dayOfMoment(takenAt);
    return day === null
      ? t('photos.photo')
      : t('photos.photoOf', {
          day: formatRelativeDay(day, today, locale, {
            today: t('home.today'),
            yesterday: t('home.yesterday'),
          }),
        });
  };
  const items: readonly GridItem[] = [
    ...(onNoPhoto === undefined ? [] : [NO_PHOTO_ITEM]),
    ...photos.map((photo): GridItem => ({ kind: 'photo', photo })),
  ];
  return (
    <FlashList
      // In a sheet, scrolled to its top, pulling down drags the sheet.
      renderScrollComponent={SheetScrollView}
      data={items}
      numColumns={COLUMNS}
      keyExtractor={(item) => (item.kind === 'photo' ? item.photo.id : item.kind)}
      getItemType={(item) => item.kind}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      ListHeaderComponent={<>{top.header}</>}
      contentContainerStyle={{ paddingTop: top.inset, paddingBottom: insets.bottom + bottom }}
      extraData={chosen}
      renderItem={({ item }) =>
        item.kind === 'photo' ? (
          <PhotoCell
            photo={item.photo}
            label={labelOf(item.photo)}
            order={chosen === undefined ? undefined : chosen.indexOf(item.photo.id) + 1 || null}
            onPress={() => onPick(item.photo.id)}
          />
        ) : (
          <NoPhotoCell onPress={() => onNoPhoto?.()} />
        )
      }
    />
  );
}

/** The albums with photos, two per row, each with its newest photo as cover. */
function AlbumList({
  top,
  onOpen,
}: {
  readonly top: ListTop;
  readonly onOpen: (album: PhotoAlbum) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const albums = useAsync(loadAlbums, 'albums');
  if (albums.status === 'loading') {
    return (
      <Framed top={top}>
        <LoadingView />
      </Framed>
    );
  }
  if (albums.status === 'error') {
    return (
      <Framed top={top}>
        <ErrorView message={t('photos.error')} onRetry={albums.retry} />
      </Framed>
    );
  }
  if (albums.data.length === 0) {
    return (
      <Framed top={top}>
        <EmptyView message={t('photos.noAlbums')} />
      </Framed>
    );
  }
  return (
    <FlashList
      renderScrollComponent={SheetScrollView}
      data={albums.data}
      numColumns={2}
      keyExtractor={(album) => album.id}
      ListHeaderComponent={<>{top.header}</>}
      contentContainerStyle={{
        paddingHorizontal: 8,
        paddingTop: top.inset,
        paddingBottom: insets.bottom + 8,
      }}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => onOpen(item)}
          style={({ pressed }) => ({ padding: 8, gap: 6, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ ...smallCardSurface(12), aspectRatio: 1, overflow: 'hidden' }}>
            <Image
              source={{ uri: item.coverId }}
              recyclingKey={item.coverId}
              contentFit="cover"
              cachePolicy="memory"
              style={{ flex: 1 }}
            />
          </View>
          <Text numberOfLines={1} style={{ color: colors.label, fontSize: 15, fontWeight: '600' }}>
            {item.title}
          </Text>
        </Pressable>
      )}
    />
  );
}

/** Recent, Favorites and Albums. */
function ShelfTabs({
  shown,
  onChoose,
}: {
  readonly shown: Shelf;
  readonly onChoose: (shelf: Shelf) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 8 }}
    >
      {SHELVES.map((shelf) => (
        <Pressable
          key={shelf}
          accessibilityRole="tab"
          accessibilityState={{ selected: shelf === shown }}
          onPress={() => onChoose(shelf)}
          style={{ paddingHorizontal: 8, paddingVertical: 12 }}
        >
          <Text
            style={{
              color: shelf === shown ? colors.label : colors.secondaryLabel,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {t(`photos.shelves.${shelf}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Without access to the library: why it matters, how to give it, and the way on without a photo. */
function NoAccess({
  canAskAgain,
  onAsk,
  onNoPhoto,
}: {
  readonly canAskAgain: boolean;
  readonly onAsk: () => void;
  readonly onNoPhoto?: () => void;
}) {
  const { t } = useTranslation();
  const button = (label: string, onPress: () => void, main: boolean) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <Text
        style={{
          color: main ? colors.tint : colors.secondaryLabel,
          fontSize: 17,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ color: colors.label, fontSize: 17, textAlign: 'center' }}>
        {t('photos.noAccess')}
      </Text>
      {button(t(canAskAgain ? 'photos.allow' : 'photos.openSettings'), onAsk, true)}
      {onNoPhoto === undefined ? null : button(t('photos.noPhoto'), onNoPhoto, false)}
    </View>
  );
}

/**
 * The user's photos inside the app (ADR 009): Recent, Favorites and Albums, in a grid that keeps
 * only what is on screen. With limited access, only the photos allowed show, and a line offers to
 * choose others. A tap on a photo gives its library id to `onPick`; with `onNoPhoto`, the recent
 * photos start with a cell to go on without one. `top` goes over all of it, scrolling with the
 * list, which starts `topInset` points down so that it can pass under a header. With `max` over
 * one and `onPickMany`, taps mark up to `max` photos in order instead, on any shelf, and a button
 * under the grid gives them to `onPickMany`.
 */
export function PhotoBrowser({
  onPick,
  onNoPhoto,
  max = 1,
  onPickMany,
  top = null,
  topInset = 0,
}: {
  readonly onPick: (id: string) => void;
  readonly onNoPhoto?: () => void;
  readonly max?: number;
  readonly onPickMany?: (ids: readonly string[]) => void;
  readonly top?: ReactNode;
  readonly topInset?: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const several = max > 1 && onPickMany !== undefined;
  /** A tap on a photo: chosen at once, or marked and unmarked, up to `max`. */
  const tapPhoto = (id: string) => {
    if (!several) {
      onPick(id);
      return;
    }
    setChosen((current) =>
      current.includes(id)
        ? current.filter((one) => one !== id)
        : current.length < max
          ? [...current, id]
          : current,
    );
  };
  const marks = several ? chosen : undefined;
  const room = several ? ADD_BUTTON.height + 2 * ADD_BUTTON.gap : 0;
  const { access, ask } = usePhotoAccess();
  const [shelf, setShelf] = useState<Shelf>('recent');
  // Each shelf stays mounted once opened, so its list stays where it was.
  const [opened, setOpened] = useState<ReadonlySet<Shelf>>(new Set(['recent']));
  const [album, setAlbum] = useState<PhotoAlbum | null>(null);
  if (access === null) {
    return (
      <Framed top={{ header: top, inset: topInset }}>
        <LoadingView />
      </Framed>
    );
  }
  if (access.level === 'none') {
    return (
      <Framed top={{ header: top, inset: topInset }}>
        <NoAccess
          canAskAgain={allowStep(access, Platform.OS) === 'ask'}
          onAsk={ask}
          onNoPhoto={onNoPhoto}
        />
      </Framed>
    );
  }
  const listTop = (extra: ReactNode = null): ListTop => ({
    inset: topInset,
    header: (
      <>
        {top}
        {shelves}
        {extra}
      </>
    ),
  });
  const shelves = (
    <>
      {access.level !== 'limited' ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void presentPermissionsPicker(['photo']).catch((error: unknown) =>
              logError('Could not open the choice of photos', error),
            )
          }
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
        >
          <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>
            {t('photos.limited')} <Text style={{ color: colors.tint }}>{t('photos.manage')}</Text>
          </Text>
        </Pressable>
      )}
      <ShelfTabs
        shown={shelf}
        onChoose={(next) => {
          setShelf(next);
          setOpened((current) => new Set(current).add(next));
          setAlbum(null);
        }}
      />
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      <KeptMounted hidden={shelf !== 'recent'} style={StyleSheet.absoluteFill}>
        <PhotoGrid
          top={listTop()}
          source={{ kind: 'recent' }}
          emptyMessage={t('photos.empty')}
          onPick={tapPhoto}
          chosen={marks}
          bottom={room}
          onNoPhoto={onNoPhoto}
        />
      </KeptMounted>
      {opened.has('favorites') ? (
        <KeptMounted hidden={shelf !== 'favorites'} style={StyleSheet.absoluteFill}>
          <PhotoGrid
            top={listTop()}
            source={{ kind: 'favorites' }}
            emptyMessage={t('photos.noFavorites')}
            onPick={tapPhoto}
            chosen={marks}
            bottom={room}
          />
        </KeptMounted>
      ) : null}
      {opened.has('albums') ? (
        <KeptMounted hidden={shelf !== 'albums' || album !== null} style={StyleSheet.absoluteFill}>
          <AlbumList top={listTop()} onOpen={setAlbum} />
        </KeptMounted>
      ) : null}
      {shelf === 'albums' && album !== null ? (
        <View style={StyleSheet.absoluteFill}>
          <PhotoGrid
            key={album.id}
            top={listTop(
              <Pressable
                accessibilityRole="button"
                onPress={() => setAlbum(null)}
                style={{ paddingHorizontal: 16, paddingBottom: 12 }}
              >
                <Text numberOfLines={1} style={{ color: colors.label, fontSize: 15 }}>
                  ‹ {album.title}
                </Text>
              </Pressable>,
            )}
            source={{ kind: 'album', albumId: album.id }}
            emptyMessage={t('photos.empty')}
            onPick={tapPhoto}
            chosen={marks}
            bottom={room}
          />
        </View>
      ) : null}
      {several ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + ADD_BUTTON.gap,
            alignItems: 'center',
          }}
        >
          <PillButton
            icon="check"
            iconSize={24}
            label={t('photos.addCount', { count: String(chosen.length) })}
            showLabel
            accent
            disabled={chosen.length === 0}
            onPress={() => onPickMany?.(chosen)}
            height={ADD_BUTTON.height}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The button that adds the photos marked: its height and its room over the screen's foot. */
const ADD_BUTTON = { height: 52, gap: 12 } as const;
