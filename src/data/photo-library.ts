import {
  Album,
  Asset,
  AssetField,
  getPermissionsAsync,
  type GranularPermission,
  MediaType,
  type PermissionResponse,
  Query,
  requestPermissionsAsync,
} from 'expo-media-library';

import { mimeTypeOf, type PickedPhoto } from '@/editor/photo-plan';

/**
 * The user's photos, read with `expo-media-library` for the app's own grid (ADR 009). A photo goes
 * by its library id, which also draws its thumbnail: `expo-image` reads it without touching the
 * file, so listing thousands costs little. Its file is only asked for when it is chosen.
 */

/** Only photos: the app does nothing with videos or audio. */
const PHOTOS_ONLY: GranularPermission[] = ['photo'];

/** How much of the library the app can read. */
export interface PhotoAccess {
  readonly level: 'all' | 'limited' | 'none';
  /** Whether the system would still ask; if not, only its Settings can change it. */
  readonly canAskAgain: boolean;
}

function accessOf(response: PermissionResponse): PhotoAccess {
  return {
    level: !response.granted ? 'none' : response.accessPrivileges === 'limited' ? 'limited' : 'all',
    canAskAgain: response.canAskAgain,
  };
}

/** What the app can read now, without asking. */
export const readPhotoAccess = async (): Promise<PhotoAccess> =>
  accessOf(await getPermissionsAsync(false, PHOTOS_ONLY));

/** Asks the system for access, if it still would, and says what the app got. */
export const askPhotoAccess = async (): Promise<PhotoAccess> =>
  accessOf(await requestPermissionsAsync(false, PHOTOS_ONLY));

/** Where photos are listed from. */
export type PhotoSource =
  | { readonly kind: 'recent' }
  | { readonly kind: 'favorites' }
  | { readonly kind: 'album'; readonly albumId: string };

/** A photo of the library, as the grid needs it. */
export interface LibraryPhoto {
  readonly id: string;
  /**
   * When it was taken, in milliseconds since the epoch, if the library knows (on both platforms,
   * though the docs of `Asset.getCreationTime` say seconds).
   */
  readonly takenAt: number | null;
}

/** A page of photos, and where the next one starts (`null` at the end). */
export interface PhotoPage {
  readonly photos: readonly LibraryPhoto[];
  readonly next: number | null;
}

/** The newest photos of `source`, skipping the first `offset`. */
function photosQuery(source: PhotoSource, offset: number, limit: number): Query {
  const query = new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .offset(offset)
    .limit(limit);
  switch (source.kind) {
    case 'recent':
      return query;
    case 'favorites':
      return query.eq(AssetField.IS_FAVORITE, true);
    case 'album':
      return query.album(new Album(source.albumId));
  }
}

/**
 * A page of photos of `source`, by the date they were taken, newest first. The library can't sort
 * by the date they were added, as the iPhone's Recents can, and reading its Recents album unsorted
 * doesn't give that order either (tried on the iPhone: it came out further from it).
 *
 * @throws Error when the library can't be read.
 */
export async function loadPhotos(
  source: PhotoSource,
  offset: number,
  limit: number,
): Promise<PhotoPage> {
  const assets = await photosQuery(source, offset, limit).exeForMetadata();
  return {
    photos: assets.map(({ id, creationTime }) => ({ id, takenAt: creationTime })),
    next: assets.length < limit ? null : offset + assets.length,
  };
}

/** An album with photos in it. */
export interface PhotoAlbum {
  readonly id: string;
  readonly title: string;
  /** Its newest photo, for its cover. */
  readonly coverId: string;
}

/**
 * The albums with photos in them (one with only videos has nothing to offer). Time O(a) queries
 * for a albums, each asking for a single photo.
 *
 * @throws Error when the library can't be read.
 */
export async function loadAlbums(): Promise<readonly PhotoAlbum[]> {
  const albums = await Album.getAll();
  const read = await Promise.all(
    albums.map(async (album): Promise<PhotoAlbum | null> => {
      const [title, page] = await Promise.all([
        album.getTitle(),
        loadPhotos({ kind: 'album', albumId: album.id }, 0, 1),
      ]);
      const cover = page.photos[0];
      return cover === undefined ? null : { id: album.id, title, coverId: cover.id };
    }),
  );
  return read.filter((album) => album !== null);
}

/**
 * The file of a chosen photo, ready to prepare (see `prepare-photo.ts`). A photo only in iCloud is
 * downloaded first, which can take a while.
 *
 * @throws Error when it can't be read.
 */
export async function pickedPhoto(id: string): Promise<PickedPhoto> {
  const asset = new Asset(id);
  const [uri, width, height] = await Promise.all([
    asset.getUri(),
    asset.getWidth(),
    asset.getHeight(),
  ]);
  return { uri, width, height, mimeType: mimeTypeOf(uri) };
}
