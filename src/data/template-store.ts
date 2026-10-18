import { Directory, File, Paths } from 'expo-file-system';

import { parseSavedTemplate, type SavedTemplate } from '@/core/user-templates';
import { logError } from '@/ui/log';

/**
 * Where the user's templates are kept. Local files for now; when real login arrives, an
 * implementation backed by Supabase syncs them across devices (ADR 003) without touching the
 * editor.
 */
export interface TemplateStore {
  /** Every saved template that is still valid, in no particular order. */
  list(): Promise<SavedTemplate[]>;
  save(saved: SavedTemplate): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Template ids we create, safe as file names (see {@link newTemplateId}). */
const ID_PATTERN = /^[a-z0-9-]+$/;

/** A new, unique id for a saved template: the time it was saved plus a random part. */
export function newTemplateId(now: Date): string {
  const random = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `t-${now.getTime().toString(36)}-${random}`;
}

/**
 * One JSON file per template in the app's documents, named by its id: saving or removing one
 * never rewrites the others, and a damaged file loses only its own template.
 */
export class FileTemplateStore implements TemplateStore {
  private readonly directory = new Directory(Paths.document, 'templates');

  async list(): Promise<SavedTemplate[]> {
    if (!this.directory.exists) {
      return [];
    }
    const templates: SavedTemplate[] = [];
    for (const entry of this.directory.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith('.json')) {
        continue;
      }
      try {
        templates.push(parseSavedTemplate(JSON.parse(await entry.text())));
      } catch (error) {
        // Left on disk, in case a later version can read it; the other templates still load.
        logError(`Skipping the unreadable saved template ${entry.name}`, error);
      }
    }
    return templates;
  }

  async save(saved: SavedTemplate): Promise<void> {
    this.directory.create({ idempotent: true, intermediates: true });
    const file = this.fileOf(saved.template.id);
    file.create({ overwrite: true });
    file.write(JSON.stringify(saved));
  }

  async remove(id: string): Promise<void> {
    const file = this.fileOf(id);
    if (file.exists) {
      file.delete();
    }
  }

  private fileOf(id: string): File {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`Invalid template id for a file name: ${id}`);
    }
    return new File(this.directory, `${id}.json`);
  }
}
