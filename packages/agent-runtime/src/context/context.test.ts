import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../tools/tool';
import { createToolRegistry } from '../tools/registry';
import { createContextBuilder } from './context';

describe('Context assembly', () => {
  it('preserves complete tool history and isolates nested request data', () => {
    const tools = createToolRegistry([
      defineTool({
        name: 'read_note',
        description: 'Read a note',
        inputSchema: z.strictObject({ path: z.string() }),
        run: async ({ path }) => path,
      }),
    ]);
    const context = createContextBuilder({
      getSystemPrompt: () => 'Read carefully',
      getTools: () => tools.getDeclarations(),
    });
    const history: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Read the note' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_note', arguments: '{"path":"note.md"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true,"data":"note"}' },
    ];

    const first = context.build(history);
    expect(first.messages[0]).toEqual({ role: 'system', content: 'Read carefully' });
    expect(first.messages.slice(1)).toEqual(history);
    expect(first.tools[0].function.name).toBe('read_note');

    const assistant = first.messages[2];
    if (assistant.role !== 'assistant') throw new Error('Expected assistant tool call');
    const call = assistant.tool_calls?.[0];
    if (call?.type !== 'function') throw new Error('Expected function tool call');
    call.function.arguments = '{}';
    first.messages[1].content = 'changed';
    first.tools[0].function.parameters = {};

    const next = context.build(history);
    expect(next.messages.slice(1)).toEqual(history);
    expect(next.messages[1]).toEqual({ role: 'user', content: 'Read the note' });
    expect(next.messages[2]).toMatchObject({
      tool_calls: [{ function: { arguments: '{"path":"note.md"}' } }],
    });
    expect(next.tools[0].function.parameters).toMatchObject({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    });
    expect(history).toHaveLength(3);
  });
});
