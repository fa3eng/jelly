import { describe, expect, it } from 'vitest';
import { createOpenAIModelTurn } from './model-turn';

const frame = (delta: object, finishReason: string | null = null) =>
  `data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', created: 0, model: 'test', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

function modelWithBody(body: string) {
  return createOpenAIModelTurn({
    client: {
      apiKey: 'test-key',
      maxRetries: 0,
      fetch: async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    },
    model: 'test-model',
  });
}

describe('Model turn adapter', () => {
  it('assembles interleaved tool arguments by index while streaming text', async () => {
    const body =
      frame({
        content: '先查一下',
        tool_calls: [
          {
            index: 9,
            id: 'second',
            type: 'function',
            function: { name: 'read', arguments: '{"path":' },
          },
          { index: 0, id: 'first', type: 'function', function: { name: 'list', arguments: '{}' } },
        ],
      }) +
      frame({ tool_calls: [{ index: 9, function: { arguments: '"note.md"}' } }] }) +
      frame({}, 'tool_calls') +
      'data: [DONE]\n\n';
    const events = [];
    for await (const event of modelWithBody(body)([], [])) events.push(event);
    expect(events[0]).toEqual({ type: 'text-delta', delta: '先查一下' });
    const final = events.at(-1);
    expect(final?.type).toBe('model-completed');
    if (final?.type === 'model-completed') {
      expect(final.turn.finishReason).toBe('tool_calls');
      expect(
        final.turn.message.tool_calls?.map((call) => [
          call.id,
          JSON.parse(call.function.arguments),
        ]),
      ).toEqual([
        ['first', {}],
        ['second', { path: 'note.md' }],
      ]);
    }
  });

  it.each([frame({ content: 'partial' }), frame({}, 'length'), frame({}, 'tool_calls')])(
    'rejects an incomplete or inconsistent response',
    async (body) => {
      await expect(async () => {
        for await (const _event of modelWithBody(body + 'data: [DONE]\n\n')([], [])) {
          /* consume */
        }
      }).rejects.toThrow();
    },
  );

  it('aborts a pending SSE read through the caller signal', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let requestSignal: AbortSignal | undefined;
    const modelTurn = createOpenAIModelTurn({
      model: 'test-model',
      client: {
        apiKey: 'test-key',
        maxRetries: 0,
        fetch: async (_input, init) => {
          requestSignal = init?.signal ?? undefined;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(frame({ role: 'assistant' })));
              requestSignal?.addEventListener(
                'abort',
                () => controller.error(requestSignal?.reason),
                { once: true },
              );
            },
            pull() {
              started();
            },
          });
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
        },
      },
    });
    const controller = new AbortController();
    const pending = modelTurn([], [], { signal: controller.signal }).next();
    const rejected = expect(pending).rejects.toThrow();
    await ready;
    controller.abort(new Error('cancelled'));
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
  });

  it('cleans up the SDK request when consumption breaks at a yielded event', async () => {
    let signal: AbortSignal | undefined;
    const modelTurn = createOpenAIModelTurn({
      model: 'test-model',
      client: {
        apiKey: 'test-key',
        fetch: async (_input, init) => {
          signal = init?.signal ?? undefined;
          return new Response(
            frame({ content: 'hello' }) + frame({}, 'stop') + 'data: [DONE]\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        },
      },
    });
    for await (const event of modelTurn([], [])) {
      expect(event.type).toBe('text-delta');
      break;
    }
    expect(signal?.aborted).toBe(true);
  });
});
