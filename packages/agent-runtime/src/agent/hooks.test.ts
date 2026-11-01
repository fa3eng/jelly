import { describe, expect, it } from 'vitest';
import { createAgent } from './loop';
import { createContextBuilder } from '../context/context';
import { createToolRegistry } from '../tools/registry';
import type { BeforeModelHook } from './hooks';

const context = createContextBuilder({ getSystemPrompt: () => 'fixed', getTools: () => [] });

describe('beforeModel hooks', () => {
  it('yields append effects before dispatch and later hooks see preceding effects', async () => {
    let requests = 0;
    const order: string[] = [];
    const first: BeforeModelHook = ({ messages }) => {
      order.push('first');
      // Runtime protects its live state even if an extension mutates its copy.
      (messages as unknown[]).push({ role: 'user', content: 'MUTATION' });
      return [
        {
          type: 'append-context',
          context: { kind: 'test', content: 'notice', data: { version: 1 } },
        },
      ];
    };
    const agent = createAgent({
      context,
      tools: createToolRegistry([]),
      hooks: {
        beforeModel: [
          first,
          ({ contexts, messages }) => {
            order.push('second');
            expect(contexts).toHaveLength(1);
            expect(JSON.stringify(messages)).not.toContain('MUTATION');
            expect(messages.at(-1)?.content).toContain('notice');
            return [];
          },
        ],
      },
      modelTurn: async function* (messages) {
        requests++;
        expect(messages.at(-1)?.content).toContain('notice');
        yield {
          type: 'model-completed',
          turn: { finishReason: 'stop', message: { role: 'assistant', content: 'done' } },
        };
      },
    });
    const stream = agent.run([{ role: 'user', content: 'hello' }]);
    expect((await stream.next()).value).toMatchObject({
      type: 'context-added',
      context: { kind: 'test', content: 'notice' },
    });
    expect(requests).toBe(0);
    await stream.next();
    expect(requests).toBe(1);
    expect(order).toEqual(['first', 'second']);
    await stream.return({ messages: [], text: '' });
  });

  it('does not dispatch a model request when a hook throws or cancels execution', async () => {
    for (const cancel of [false, true]) {
      const controller = new AbortController();
      let requests = 0;
      const agent = createAgent({
        context,
        tools: createToolRegistry([]),
        hooks: {
          beforeModel: [
            () => {
              if (cancel) controller.abort();
              else throw new Error('hook failed');
              return [];
            },
          ],
        },
        modelTurn: async function* () {
          requests++;
          yield {
            type: 'model-completed',
            turn: { finishReason: 'stop', message: { role: 'assistant', content: '' } },
          };
        },
      });
      await expect(agent.run([], { signal: controller.signal }).next()).rejects.toThrow();
      expect(requests).toBe(0);
    }
  });
});
