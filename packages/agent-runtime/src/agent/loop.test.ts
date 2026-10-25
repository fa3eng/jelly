import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './loop';
import type { ModelTurnFunction } from './model-turn';
import { defineTool, type Tool } from '../tools/tool';
import { createToolRegistry } from '../tools/registry';
import { createContextBuilder } from '../context/context';

function assembleAgent(modelTurn: ModelTurnFunction, definitions: Tool[], systemPrompt: string) {
  const tools = createToolRegistry(definitions);
  const context = createContextBuilder({
    getSystemPrompt: () => systemPrompt,
    getTools: () => tools.getDeclarations(),
  });
  return createAgent({ modelTurn, tools, context });
}

async function collect<T, R>(iterator: AsyncGenerator<T, R>) {
  const events: T[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

function parseToolResult(content: unknown) {
  if (typeof content !== 'string') throw new Error('Expected a serialized tool result');
  return JSON.parse(content);
}

function tool(name: string) {
  return defineTool({
    name,
    description: name,
    inputSchema: z.strictObject({ value: z.number() }),
    run: async ({ value }) => ({ name, nested: { value } }),
  });
}

describe('Agent Loop', () => {
  it('selects injected tools repeatedly and returns the full context without changing history', async () => {
    const modelTurn: ModelTurnFunction = async function* (messages, declarations) {
      expect(declarations.map((item) => item.function.name)).toEqual(['first', 'second']);
      expect(messages[0]).toEqual({ role: 'system', content: 'injected prompt' });
      const results = messages.filter((message) => message.role === 'tool');
      if (results.length === 6) {
        expect(parseToolResult(results[5].content)).toEqual({
          ok: true,
          data: { name: 'second', nested: { value: 5 } },
        });
        yield { type: 'text-delta', delta: '完成' };
        yield {
          type: 'model-completed',
          turn: { finishReason: 'stop', message: { role: 'assistant', content: '完成' } },
        };
        return;
      }
      const content = results.length === 0 ? '先查一下' : '';
      if (content) yield { type: 'text-delta', delta: content };
      yield {
        type: 'model-completed',
        turn: {
          finishReason: 'tool_calls',
          message: {
            role: 'assistant',
            content,
            tool_calls: [
              {
                id: `call_${results.length}`,
                type: 'function',
                function: {
                  name: results.length % 2 === 0 ? 'first' : 'second',
                  arguments: JSON.stringify({ value: results.length }),
                },
              },
            ],
          },
        },
      };
    };
    const history = [{ role: 'user' as const, content: '开始' }];
    const agent = assembleAgent(modelTurn, [tool('first'), tool('second')], 'injected prompt');
    const { events, result } = await collect(agent.run(history));
    expect(history).toEqual([{ role: 'user', content: '开始' }]);
    expect(result.text).toBe('先查一下完成');
    expect(result.messages).toHaveLength(14);
    expect(result.messages.at(-1)).toEqual({ role: 'assistant', content: '完成' });
    expect(events.filter((event) => event.type === 'tool-finished')).toHaveLength(6);
    for (let i = 1; i < 13; i += 2) {
      const call = result.messages[i];
      const response = result.messages[i + 1];
      expect(call.role).toBe('assistant');
      expect(response.role).toBe('tool');
      if (call.role === 'assistant' && response.role === 'tool') {
        expect(response.tool_call_id).toBe(call.tool_calls?.[0].id);
      }
    }
  });

  it('pairs every result in a batch, including unknown tools and invalid parameters', async () => {
    const modelTurn: ModelTurnFunction = async function* (messages) {
      const results = messages.filter((message) => message.role === 'tool');
      if (results.length) {
        expect(results.map((message) => parseToolResult(message.content).ok)).toEqual([
          false,
          false,
          true,
        ]);
        yield {
          type: 'model-completed',
          turn: { finishReason: 'stop', message: { role: 'assistant', content: '' } },
        };
        return;
      }
      yield {
        type: 'model-completed',
        turn: {
          finishReason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { name: 'missing', arguments: '{}' },
              { name: 'echo', arguments: '{broken' },
              { name: 'echo', arguments: '{"value":7}' },
            ].map((fn, index) => ({ id: `id_${index}`, type: 'function', function: fn })),
          },
        },
      };
    };
    const { events } = await collect(assembleAgent(modelTurn, [tool('echo')], 'x').run([]));
    expect(events.filter((event) => event.type === 'tool-finished')).toHaveLength(3);
  });

  it('allows an empty tool collection', async () => {
    const modelTurn: ModelTurnFunction = async function* () {
      yield {
        type: 'model-completed',
        turn: { finishReason: 'stop', message: { role: 'assistant', content: '' } },
      };
    };
    expect((await collect(assembleAgent(modelTurn, [], 'x').run([]))).result.messages).toHaveLength(
      1,
    );
  });
});
