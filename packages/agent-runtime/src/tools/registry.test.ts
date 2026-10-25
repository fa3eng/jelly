import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './tool';
import { createToolRegistry } from './registry';

describe('Tool registry', () => {
  it('rejects duplicate names before a model request can advertise ambiguous tools', () => {
    const tool = defineTool({
      name: 'same',
      description: 'same',
      inputSchema: z.strictObject({}),
      run: async () => null,
    });
    expect(() => createToolRegistry([tool, tool])).toThrow('工具注册名称冲突：same');
  });

  it('propagates cancellation to the running tool instead of returning an ordinary failed result', async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let toolAborted = false;
    const tools = createToolRegistry([
      defineTool({
        name: 'wait',
        description: 'Wait for cancellation',
        inputSchema: z.strictObject({}),
        run: async (_input, signal) => {
          const stopped = new Promise<void>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                toolAborted = true;
                resolve();
              },
              { once: true },
            );
          });
          markStarted();
          await stopped;
          return 'unused';
        },
      }),
    ]);
    const controller = new AbortController();
    const pending = tools.execute('wait', '{}', controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    await started;
    controller.abort();
    await rejected;
    expect(toolAborted).toBe(true);
  });
});
