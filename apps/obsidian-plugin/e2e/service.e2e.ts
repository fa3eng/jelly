import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { startHarness, waitFor } from './support/harness';

await test(
  'L1: built service, local SSE model and isolated Vault',
  { timeout: 60_000 },
  async (t) => {
    const harness = await startHarness();
    t.after(() => harness.close());
    t.diagnostic(`Artifacts: ${harness.directory}`);
    const { id: sessionId } = await harness.client.sessions.create({ title: 'L1 regression' });

    async function run(prompt: string) {
      const events = [];
      for await (const event of await harness.client.chat.stream({
        sessionId,
        runId: randomUUID(),
        prompt,
      })) {
        harness.trace({ prompt, event });
        events.push(event);
      }
      assert.deepEqual(events.at(-1), { type: 'done' });
      return events;
    }

    await t.test('streams multiple deltas before completion', async () => {
      const events = await run('stream');
      assert.deepEqual(
        events.filter((event) => event.type === 'text-delta'),
        [
          { type: 'text-delta', delta: 'Hello ' },
          { type: 'text-delta', delta: 'Vault' },
        ],
      );
    });

    await t.test('reads a real document and creates a file through model tool calls', async () => {
      const events = await run('tools');
      assert.deepEqual(
        events.filter((event) => event.type === 'tool-finished'),
        [
          { type: 'tool-finished', callId: 'read-note', name: 'read_project_doc', ok: true },
          { type: 'tool-finished', callId: 'write-note', name: 'create_project_doc', ok: true },
        ],
      );
      assert.equal(await readFile(join(harness.vault, 'created.md'), 'utf8'), '# Saved by L1\n');
      assert.equal(
        await readFile(join(harness.vault, 'note.md'), 'utf8'),
        '# Fixture\nVault-only text\n',
      );
      const records = await readFile(join(harness.sessions, `${sessionId}.jsonl`), 'utf8');
      assert.match(records, /Vault-only text/);
      assert.match(records, /"role":"tool"/);
      assert.match(records, /"status":"completed"/);
    });

    await t.test('exposes tool failure and continues to a model answer', async () => {
      const events = await run('tool-failure');
      assert.ok(events.some((event) => event.type === 'tool-finished' && !event.ok));
      assert.ok(
        events.some((event) => event.type === 'text-delta' && event.delta === 'Tool failed safely'),
      );
    });

    await t.test('propagates a provider error and persists the failed run', async () => {
      await assert.rejects(() => run('provider-error'), /会话操作失败/);
      const view = await harness.client.sessions.read({ sessionId });
      assert.equal(view.runs.at(-1)?.status, 'error');
      await run('stream');
    });

    await t.test('cancels an active HTTP stream and allows another run', async () => {
      const controller = new AbortController();
      const stream = await harness.client.chat.stream(
        { sessionId, runId: randomUUID(), prompt: 'hold' },
        { signal: controller.signal },
      );
      try {
        assert.deepEqual(await stream.next(), {
          done: false,
          value: { type: 'text-delta', delta: 'Waiting' },
        });
        controller.abort();
        await assert.rejects(() => stream.next());
      } finally {
        controller.abort();
        await stream.return?.().catch(() => {});
      }
      await waitFor(async () => {
        const view = await harness.client.sessions.read({ sessionId });
        return view.runs.at(-1)?.status === 'cancelled';
      }, 'cancelled run persisted');
      await run('stream');
    });

    await t.test(
      'restores persisted history after a service restart without replaying tools',
      async () => {
        const before = await harness.client.sessions.read({ sessionId });
        const requestCount = harness.requests.length;
        await harness.restart();
        assert.deepEqual(await harness.client.sessions.read({ sessionId }), before);
        assert.equal(harness.requests.length, requestCount);
        assert.ok(
          (await harness.client.sessions.list({})).some((session) => session.id === sessionId),
        );
        await run('history');
        assert.equal(await readFile(join(harness.vault, 'created.md'), 'utf8'), '# Saved by L1\n');
      },
    );

    await t.test('marks an unfinished run interrupted after a process crash', async () => {
      const stream = await harness.client.chat.stream({
        sessionId,
        runId: randomUUID(),
        prompt: 'hold',
      });
      assert.deepEqual(await stream.next(), {
        done: false,
        value: { type: 'text-delta', delta: 'Waiting' },
      });
      await harness.restart('SIGKILL');
      await assert.rejects(() => stream.next());
      assert.equal(
        (await harness.client.sessions.read({ sessionId })).runs.at(-1)?.status,
        'interrupted',
      );
      await run('stream');
    });
  },
);
