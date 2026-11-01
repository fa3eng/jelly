import { watch, type FSWatcher } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { discoverSkills, type SkillCatalog } from './catalog';
import { readSkillFile } from './skill-files';

/** Watchers trigger refreshes; model boundaries reconcile to recover missed events. */
export async function createSkillManager(directory: string) {
  const root = resolve(directory);
  let catalog: SkillCatalog = { skills: [], diagnostics: [] };
  let closed = false;
  let generation = 0;
  let scannedGeneration = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tail = Promise.resolve();
  const watchers = new Map<string, { watcher: FSWatcher; identity: string }>();

  function changed() {
    generation++;
    // Coalesce from the first event; continuous saves must not starve refresh.
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh().catch(() => {});
    }, 60);
    timer.unref();
  }

  async function reconcileWatchers() {
    const targets = new Set<string>();
    let ancestor = dirname(root);
    while (true) {
      const info = await lstat(ancestor).catch(() => undefined);
      if (info?.isDirectory()) {
        targets.add(ancestor);
        break;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    if ((await lstat(root).catch(() => undefined))?.isDirectory()) {
      targets.add(root);
      for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
        if (entry.isDirectory()) targets.add(join(root, entry.name));
      }
    }
    const identities = new Map<string, string>();
    for (const path of targets) {
      const info = await lstat(path).catch(() => undefined);
      if (info?.isDirectory()) identities.set(path, `${info.dev}:${info.ino}`);
    }
    if (closed) return;
    for (const [path, entry] of watchers) {
      if (identities.get(path) !== entry.identity) {
        entry.watcher.close();
        watchers.delete(path);
      }
    }
    for (const [path, identity] of identities) {
      if (watchers.has(path)) continue;
      try {
        const watcher = watch(path, { persistent: false }, changed);
        const entry = { watcher, identity };
        watcher.on('error', () => {
          watcher.close();
          if (watchers.get(path) === entry) watchers.delete(path);
          changed();
        });
        watchers.set(path, entry);
      } catch {
        /* Boundary reconciliation still works without a watcher. */
      }
    }
  }

  function refresh(): Promise<SkillCatalog> {
    const operation = tail.then(async () => {
      if (closed) throw new Error('Skill Manager 已关闭');
      const started = generation;
      const next = await discoverSkills(root, scannedGeneration === started ? catalog : undefined);
      if (closed) throw new Error('Skill Manager 已关闭');
      catalog = next;
      scannedGeneration = started;
      await reconcileWatchers();
      return structuredClone(catalog);
    });
    tail = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }

  function close() {
    closed = true;
    if (timer) clearTimeout(timer);
    for (const { watcher } of watchers.values()) watcher.close();
    watchers.clear();
  }

  const manager = {
    refresh,
    getCatalog: () => structuredClone(catalog),
    async load(name: string, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const current = await refresh();
      if (!current.skills.some((skill) => skill.name === name))
        throw new Error(`Skill 不存在或不可用：${name}`);
      const result = await readSkillFile(root, name, signal);
      return { ...result.skill, revision: result.revision };
    },
    close,
  };
  try {
    await refresh();
    return manager;
  } catch (error) {
    close();
    throw error;
  }
}

export type SkillManager = Awaited<ReturnType<typeof createSkillManager>>;
