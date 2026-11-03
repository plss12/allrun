import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { addListener, presentPermissionsPicker } from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
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
import { cardSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { formatRelativeDay } from '@/ui/format';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { EmptyView, ErrorView, LoadingView } from '@/ui/state-views';
import { dayOfMoment, todayLocal } from '@/ui/today';
import { useAsync } from '@/ui/use-async';

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
      if (access?.canAskAgain === true) {
        void askPhotoAccess().then(setAccess).catch(failed);
      } else {
        void Linking.openSettings();
      }
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

/** A photo of the grid, square and cut to fit, drawn from the library at its size. */
function PhotoCell({
  photo,
  label,
  onPress,
}: {
  readonly photo: LibraryPhoto;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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

type GridItem =
  { readonly kind: 'none' } | { readonly kind: 'photo'; readonly photo: LibraryPhoto };

const NO_PHOTO_ITEM: GridItem = { kind: 'none' };

/** The photos of `source` in a grid, keeping only what is on screen. */
function PhotoGrid({
  source,
  emptyMessage,
  onPick,
  onNoPhoto,
}: {
  readonly source: PhotoSource;
  readonly emptyMessage: string;
  readonly onPick: (id: string) => void;
  readonly onNoPhoto?: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useDisplaySettings();
  const insets = useSafeAreaInsets();
  const { photos, status, loadMore, retry } = useLibraryPhotos(source);
  if (status === 'loading') {
    return <LoadingView />;
  }
  if (status === 'error') {
    return <ErrorView message={t('photos.error')} onRetry={retry} />;
  }
  if (photos.length === 0 && onNoPhoto === undefined) {
    return <EmptyView message={emptyMessage} />;
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
      data={items}
      numColumns={COLUMNS}
      keyExtractor={(item) => (item.kind === 'photo' ? item.photo.id : item.kind)}
      getItemType={(item) => item.kind}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      renderItem={({ item }) =>
        item.kind === 'photo' ? (
          <PhotoCell
            photo={item.photo}
            label={labelOf(item.photo)}
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
function AlbumList({ onOpen }: { readonly onOpen: (album: PhotoAlbum) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const albums = useAsync(loadAlbums, 'albums');
  if (albums.status === 'loading') {
    return <LoadingView />;
  }
  if (albums.status === 'error') {
    return <ErrorView message={t('photos.error')} onRetry={albums.retry} />;
  }
  if (albums.data.length === 0) {
    return <EmptyView message={t('photos.noAlbums')} />;
  }
  return (
    <FlashList
      data={albums.data}
      numColumns={2}
      keyExtractor={(album) => album.id}
      contentContainerStyle={{ padding: 8, paddingBottom: insets.bottom + 8 }}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => onOpen(item)}
          style={({ pressed }) => ({ padding: 8, gap: 6, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ ...cardSurface(12), aspectRatio: 1, overflow: 'hidden' }}>
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
 * photos start with a cell to go on without one.
 */
export function PhotoBrowser({
  onPick,
  onNoPhoto,
}: {
  readonly onPick: (id: string) => void;
  readonly onNoPhoto?: () => void;
}) {
  const { t } = useTranslation();
  const { access, ask } = usePhotoAccess();
  const [shelf, setShelf] = useState<Shelf>('recent');
  const [album, setAlbum] = useState<PhotoAlbum | null>(null);
  if (access === null) {
    return <LoadingView />;
  }
  if (access.level === 'none') {
    return <NoAccess canAskAgain={access.canAskAgain} onAsk={ask} onNoPhoto={onNoPhoto} />;
  }
  return (
    <View style={{ flex: 1 }}>
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
          setAlbum(null);
        }}
      />
      {shelf !== 'albums' ? (
        <PhotoGrid
          key={shelf}
          source={{ kind: shelf }}
          emptyMessage={t(shelf === 'recent' ? 'photos.empty' : 'photos.noFavorites')}
          onPick={onPick}
          onNoPhoto={shelf === 'recent' ? onNoPhoto : undefined}
        />
      ) : album === null ? (
        <AlbumList onOpen={setAlbum} />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAlbum(null)}
            style={{ paddingHorizontal: 16, paddingBottom: 12 }}
          >
            <Text numberOfLines={1} style={{ color: colors.label, fontSize: 15 }}>
              ‹ {album.title}
            </Text>
          </Pressable>
          <PhotoGrid
            key={album.id}
            source={{ kind: 'album', albumId: album.id }}
            emptyMessage={t('photos.empty')}
            onPick={onPick}
          />
        </>
      )}
    </View>
  );
}
