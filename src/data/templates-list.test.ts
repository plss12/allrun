import { newTemplate } from '@/core/template';
import type { SavedTemplate } from '@/core/user-templates';

import type { TemplateStore } from './template-store';
import { templatesList } from './templates-list';

jest.mock('@/ui/log', () => ({ logError: jest.fn() }));

const saved = (id: string): SavedTemplate => ({
  template: newTemplate({ id, mode: 'activity', format: 'story', layers: [] }),
  savedAt: '2026-11-07T10:00:00.000Z',
});

/** A store in memory, whose reads can be held back to finish when a test says. */
function memoryStore(initial: readonly SavedTemplate[] = []) {
  let kept = [...initial];
  let failing = false;
  const store: TemplateStore = {
    list: () => (failing ? Promise.reject(new Error('unreadable')) : Promise.resolve([...kept])),
    save: (one) => {
      kept = [one, ...kept.filter(({ template }) => template.id !== one.template.id)];
      return Promise.resolve();
    },
    remove: (id) => {
      kept = kept.filter(({ template }) => template.id !== id);
      return Promise.resolve();
    },
  };
  return { store, fail: (value: boolean) => (failing = value) };
}

const idsOf = (list: ReturnType<typeof templatesList>) => {
  const state = list.get();
  return state.status === 'success' ? state.data.map(({ template }) => template.id) : state.status;
};

/** Lets the pending promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('templatesList', () => {
  it('loads once, however many screens ask, and tells each of them', async () => {
    const { store } = memoryStore([saved('a')]);
    const list = templatesList(store);
    const listing = jest.spyOn(store, 'list');
    const listener = jest.fn();
    list.subscribe(listener);
    expect(list.get().status).toBe('loading');
    list.load();
    list.load();
    await settle();
    expect(idsOf(list)).toEqual(['a']);
    expect(listing).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
  });

  it('shows what one screen saves or deletes to every other one', async () => {
    // The editor saved and deleted designs, and the selection screen under it went on showing
    // the old list (the user's report).
    const { store } = memoryStore([saved('a'), saved('b')]);
    const list = templatesList(store);
    list.load();
    await settle();
    const selection = jest.fn();
    list.subscribe(selection);
    await list.save(saved('c'));
    await list.remove('a');
    expect(idsOf(list)).toEqual(['c', 'b']);
    expect(selection).toHaveBeenCalledTimes(2);
  });

  it('keeps a design saved while it was still loading', async () => {
    const { store } = memoryStore([saved('a')]);
    const list = templatesList(store);
    list.load();
    await list.save(saved('b'));
    await settle();
    expect(idsOf(list)).toEqual(['b', 'a']);
  });

  it('says why it could not load, and loads again when asked', async () => {
    const { store, fail } = memoryStore([saved('a')]);
    fail(true);
    const list = templatesList(store);
    list.load();
    await settle();
    expect(list.get().status).toBe('error');
    fail(false);
    list.load();
    await settle();
    expect(idsOf(list)).toEqual(['a']);
  });

  it('stops telling a screen once it unsubscribes', async () => {
    const { store } = memoryStore();
    const list = templatesList(store);
    const listener = jest.fn();
    const unsubscribe = list.subscribe(listener);
    unsubscribe();
    list.load();
    await settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
