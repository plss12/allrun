/**
 * `writeWhole` over a file system in memory whose writes take a while, as the phone's do.
 */
const mockDisk = new Map<string, string>();
/** Writes waiting to land, released one by one by the test. */
const mockPending: (() => void)[] = [];

jest.mock('expo-file-system', () => {
  class FakeDirectory {
    readonly uri: string;
    constructor(path: string) {
      this.uri = path;
    }
  }
  class FakeFile {
    readonly uri: string;
    readonly parentDirectory: FakeDirectory;
    readonly name: string;
    constructor(parent: FakeDirectory, fileName: string) {
      this.parentDirectory = parent;
      this.name = fileName;
      this.uri = `${parent.uri}/${fileName}`;
    }
    create(): void {
      mockDisk.set(this.uri, '');
    }
    write(contents: string): Promise<void> {
      return new Promise((resolve, reject) => {
        mockPending.push(() => {
          if (contents === 'fail') {
            reject(new Error('Disk full'));
            return;
          }
          mockDisk.set(this.uri, contents);
          resolve();
        });
      });
    }
    async move(target: FakeFile): Promise<void> {
      mockDisk.set(target.uri, mockDisk.get(this.uri) ?? '');
      mockDisk.delete(this.uri);
    }
  }
  return { File: FakeFile, Directory: FakeDirectory };
});

// eslint-disable-next-line import/first -- after the mock, which Jest hoists anyway
import { Directory, File } from 'expo-file-system';

// eslint-disable-next-line import/first
import { writeWhole } from './write-whole';

const folder = new Directory('/docs');
const journal = () => new File(folder, 'journal.json');

/** Lets the writes started so far reach their `write`. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  mockDisk.clear();
  mockPending.length = 0;
  mockDisk.set('/docs/journal.json', '"old"');
});

describe('writeWhole', () => {
  it('leaves the file as it was until the new one is whole, then puts it in place', async () => {
    const written = writeWhole(journal(), '"new"');
    await settle();
    // Cut short here, the file still holds the old contents, whole.
    expect(mockDisk.get('/docs/journal.json')).toBe('"old"');
    mockPending.shift()?.();
    await written;
    expect(mockDisk.get('/docs/journal.json')).toBe('"new"');
    expect(mockDisk.has('/docs/journal.json.part')).toBe(false);
  });

  it('writes the same file one after another, the last asked kept', async () => {
    const first = writeWhole(journal(), '"first"');
    const second = writeWhole(journal(), '"second"');
    await settle();
    // The second waits for the first.
    expect(mockPending).toHaveLength(1);
    mockPending.shift()?.();
    await first;
    await settle();
    mockPending.shift()?.();
    await second;
    expect(mockDisk.get('/docs/journal.json')).toBe('"second"');
  });

  it('fails when the write does, keeping the file, and lets the next one write', async () => {
    const failed = writeWhole(journal(), 'fail');
    const next = writeWhole(journal(), '"next"');
    await settle();
    mockPending.shift()?.();
    await expect(failed).rejects.toThrow('Disk full');
    expect(mockDisk.get('/docs/journal.json')).toBe('"old"');
    await settle();
    mockPending.shift()?.();
    await next;
    expect(mockDisk.get('/docs/journal.json')).toBe('"next"');
  });
});
