import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentMessage } from '@jelly/agent-runtime';
import { loadAgentConfig } from '../config/agent-config';
import { createAgentStream } from './agent';
import { createJsonlStore } from '../session/jsonl-store';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Service Skill wiring', () => {
  it('appends live changes between model calls, deduplicates batches, and restores without UI leakage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jelly-agent-live-'));
    directories.push(root);
    const skillsRoot = join(root, '.jelly', 'skills');
    async function write(name: string, body: string) {
      const directory = join(skillsRoot, name);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}\n---\n${body}`,
      );
    }
    await write('organize-notes', 'BODY_V1');
    const requests: { messages: AgentMessage[]; tools: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = (await new Request(input, init).json()) as (typeof requests)[number];
      const index = requests.length;
      requests.push(body);
      if (index === 0) await write('new-skill', 'DO_NOT_EAGERLY_INJECT');
      if (index === 1) {
        await write('organize-notes', 'BODY_V2');
        await rm(join(skillsRoot, 'new-skill'), { recursive: true });
      }
      const names =
        index === 0
          ? ['organize-notes', 'organize-notes']
          : [1, 3, 5, 7].includes(index)
            ? ['organize-notes']
            : [];
      const delta = names.length
        ? {
            tool_calls: names.map((name, i) => ({
              index: i,
              id: `call_${index}_${i}`,
              type: 'function',
              function: { name: 'load_skill', arguments: JSON.stringify({ name }) },
            })),
          }
        : { content: '完成' };
      const chunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'test',
        choices: [{ index: 0, delta, finish_reason: names.length ? 'tool_calls' : 'stop' }],
      };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    const config = loadAgentConfig({
      OPENAI_API_KEY: 'test-only',
      OPENAI_BASE_URL: 'https://model.invalid/v1',
      OPENAI_MODEL: 'test',
      JELLY_DOCS_DIRECTORY: root,
      JELLY_SESSION_DIRECTORY: join(root, 'sessions'),
    });
    let service = await createAgentStream(config);
    async function run(id: string, prompt: string) {
      const events = [];
      for await (const event of service({ sessionId: id, runId: randomUUID(), prompt }))
        events.push(event);
      expect(
        events.every((event) =>
          ['text-delta', 'tool-started', 'tool-finished'].includes(event.type),
        ),
      ).toBe(true);
    }
    try {
      const first = await service.sessions.create('第一会话');
      await run(first.id, '整理笔记');
      const results = (index: number) =>
        requests[index]!.messages.filter((message) => message.role === 'tool').map(
          (message) => JSON.parse(message.content as string).data,
        );
      expect(results(1).map((data) => data.status)).toEqual(['loaded', 'already_in_context']);
      expect(results(2).at(-1)).toMatchObject({
        status: 'loaded',
        instructions: 'BODY_V2',
        supersedes: expect.any(String),
      });
      expect(JSON.stringify(requests[1]!.messages)).toContain('new-skill');
      expect(JSON.stringify(requests[1]!.messages)).not.toContain('DO_NOT_EAGERLY_INJECT');
      const store = await createJsonlStore(config.sessionDirectory);
      const changes = (await store.read(first.id)).filter(
        (record) => record.type === 'context-added',
      );
      expect(changes).toHaveLength(3);
      expect(changes.at(-1)).toMatchObject({ context: { data: { removed: ['new-skill'] } } });
      expect((await service.sessions.view(first.id)).runs[0]?.userText).toBe('整理笔记');
      await run(first.id, '继续');
      expect(results(4).at(-1).status).toBe('already_in_context');
      const other = await service.sessions.create('另一会话');
      await run(other.id, '独立整理');
      expect(results(6).at(-1)).toMatchObject({ status: 'loaded', instructions: 'BODY_V2' });
      const sessionPath = join(config.sessionDirectory, `${first.id}.jsonl`);
      const beforeRestart = await readFile(sessionPath, 'utf8');
      await service.close();
      await write('later-skill', 'LATER_BODY');
      service = await createAgentStream(config);
      await run(first.id, '重启后继续');
      expect((await readFile(sessionPath, 'utf8')).startsWith(beforeRestart)).toBe(true);
      expect(results(8).at(-1).status).toBe('already_in_context');
      expect(requests[7]!.messages.slice(0, requests[4]!.messages.length)).toEqual(
        requests[4]!.messages,
      );
      const restoredChanges = (await store.read(first.id)).filter(
        (record) => record.type === 'context-added',
      );
      expect(restoredChanges).toHaveLength(4);
      expect(restoredChanges.at(-1)).toMatchObject({
        context: { data: { mode: 'delta', version: 4, skills: [{ name: 'later-skill' }] } },
      });
      expect(
        requests.every(
          (request) => JSON.stringify(request.tools) === JSON.stringify(requests[0]!.tools),
        ),
      ).toBe(true);
      expect(
        requests.every(
          (request) => request.messages[0]?.content === requests[0]!.messages[0]?.content,
        ),
      ).toBe(true);
    } finally {
      await service.close();
    }
  });
  it.each([false, true])(
    'discovers and advertises only installed skills (installed=%s)',
    async (installed) => {
      const root = await mkdtemp(join(tmpdir(), 'jelly-agent-skills-'));
      directories.push(root);
      if (installed) {
        const directory = join(root, '.jelly', 'skills', 'organize-notes');
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, 'SKILL.md'),
          '---\nname: organize-notes\ndescription: 整理笔记\n---\nKEEP_USER_DOUBTS',
        );
      }
      const requests: { messages: AgentMessage[]; tools: { function: { name: string } }[] }[] = [];
      // Only replace the model HTTP boundary; discovery, assembly, SDK parsing and storage are real.
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const body = (await request.json()) as (typeof requests)[number];
        requests.push(body);
        const loading = installed && !body.messages.some((message) => message.role === 'tool');
        const delta = loading
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: 'skill_call',
                  type: 'function',
                  function: { name: 'load_skill', arguments: '{"name":"organize-notes"}' },
                },
              ],
            }
          : { content: '完成' };
        const chunk = {
          id: 'test',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'test',
          choices: [{ index: 0, delta, finish_reason: loading ? 'tool_calls' : 'stop' }],
        };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });
      const service = await createAgentStream(
        loadAgentConfig({
          OPENAI_API_KEY: 'test-only',
          OPENAI_BASE_URL: 'https://model.invalid/v1',
          OPENAI_MODEL: 'test',
          JELLY_DOCS_DIRECTORY: root,
          JELLY_SESSION_DIRECTORY: join(root, 'sessions'),
          JELLY_SYSTEM_PROMPT: 'Custom prompt',
        }),
      );
      try {
        const { id } = await service.sessions.create('测试');
        for await (const _event of service({
          sessionId: id,
          runId: randomUUID(),
          prompt: '整理笔记',
        })) {
          /* drain */
        }
        const initial = requests[0]!;
        expect(initial.messages[0]?.content).toContain('Custom prompt');
        expect(JSON.stringify(initial.messages)).not.toContain('KEEP_USER_DOUBTS');
        expect(initial.tools.some((tool) => tool.function.name === 'load_skill')).toBe(true);
        expect(initial.messages[0]?.content).not.toContain('organize-notes');
        expect(JSON.stringify(initial.messages).includes('organize-notes')).toBe(installed);
        if (installed) {
          expect(
            JSON.parse(
              requests[1]?.messages.find((message) => message.role === 'tool')?.content as string,
            ),
          ).toMatchObject({
            ok: true,
            data: {
              name: 'organize-notes',
              instructions: 'KEEP_USER_DOUBTS',
              revision: expect.any(String),
            },
          });
        }
        expect((await service.sessions.view(id)).runs[0]?.status).toBe('completed');
      } finally {
        await service.close();
      }
    },
  );
});
