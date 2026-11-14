import { File } from 'expo-file-system';

/** The write of each file under way, so the next one waits for it (see {@link writeWhole}). */
const writing = new Map<string, Promise<void>>();

/**
 * Writes `contents` to `file` whole or not at all, and resolves once it is in place: to a file
 * beside it first (`<name>.part`), then moved over it, so a write cut short (the app closed
 * meanwhile) never leaves it half written for the next read to fail on. Writes of the same file
 * go one after another, in the order asked, so the last one asked is the one kept.
 *
 * `File.write` and `File.move` are asynchronous since SDK 58: called without waiting, the file
 * isn't written yet when the next line reads it, and their failures go unseen.
 *
 * @throws Error when the file can't be written or moved into place.
 */
export function writeWhole(file: File, contents: string | Uint8Array): Promise<void> {
  const before = writing.get(file.uri) ?? Promise.resolve();
  // The write before failed for its own caller, who was told; this one is tried anyway.
  const write = before
    .catch(() => undefined)
    .then(async () => {
      const part = new File(file.parentDirectory, `${file.name}.part`);
      part.create({ overwrite: true });
      await part.write(contents);
      await part.move(file, { overwrite: true });
    });
  writing.set(file.uri, write);
  const forget = () => {
    if (writing.get(file.uri) === write) {
      writing.delete(file.uri);
    }
  };
  void write.then(forget, forget);
  return write;
}
