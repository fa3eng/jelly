import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

interface Message {
  role: string;
  content: string | null;
  tool_call_id?: string;
}

interface Request {
  model: string;
  stream: boolean;
  messages: Message[];
  tools: { function: { name: string } }[];
}

export async function startModel(trace: (data: unknown) => void) {
  const requests: Request[] = [];
  const errors: unknown[] = [];

  function chunk(response: ServerResponse, delta: object, finishReason: string | null = null) {
    const data = {
      id: 'local-completion',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'jelly-e2e',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    trace({ chunk: data });
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  function tool(response: ServerResponse, id: string, name: string, args: object) {
    // 刻意拆分参数，验证真实 SDK 的增量工具调用组装。
    const serialized = JSON.stringify(args);
    const split = Math.floor(serialized.length / 2);
    chunk(response, {
      tool_calls: [
        {
          index: 0,
          id,
          type: 'function',
          function: { name, arguments: serialized.slice(0, split) },
        },
      ],
    });
    chunk(response, {
      tool_calls: [{ index: 0, function: { arguments: serialized.slice(split) } }],
    });
    chunk(response, {}, 'tool_calls');
    response.end('data: [DONE]\n\n');
  }

  async function reply(body: Request, response: ServerResponse) {
    assert.equal(body.model, 'jelly-e2e');
    assert.equal(body.stream, true);
    assert.ok(body.tools.some((item) => item.function.name === 'read_project_doc'));
    const promptIndex = body.messages.findLastIndex((message) => message.role === 'user');
    const prompt = body.messages[promptIndex]?.content;
    const turn = body.messages.slice(promptIndex + 1);
    const results = turn.filter((message) => message.role === 'tool');

    if (prompt === 'provider-error') {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Intentional L1 provider failure' } }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (prompt === 'hold') {
      chunk(response, { role: 'assistant', content: 'Waiting' });
      // 保持请求打开，直到 RPC 客户端取消或真实服务进程退出。
      await new Promise<void>((resolve) => response.once('close', resolve));
      return;
    }
    if (prompt === 'tools') {
      if (!results.length)
        return tool(response, 'read-note', 'read_project_doc', { path: 'note.md' });
      assert.match(results[0].content ?? '', /Vault-only text/);
      if (results.length === 1) {
        return tool(response, 'write-note', 'create_project_doc', {
          path: 'created.md',
          content: '# Saved by L1\n',
        });
      }
      assert.equal(results.length, 2);
      assert.match(results[1].content ?? '', /created.md/);
    }
    if (prompt === 'tool-failure' && !results.length) {
      return tool(response, 'missing-note', 'read_project_doc', { path: 'missing.md' });
    }
    if (prompt === 'history') {
      assert.ok(
        body.messages
          .slice(0, promptIndex)
          .some(
            (message) => message.role === 'tool' && message.content?.includes('Vault-only text'),
          ),
      );
    }
    if (prompt === 'tool-failure') {
      assert.match(results[0]?.content ?? '', /false|error/i);
    }
    const text = prompt === 'tool-failure' ? ['Tool failed safely'] : ['Hello ', 'Vault'];
    for (const content of text) {
      chunk(response, { content });
      await delay(25);
    }
    chunk(response, {}, 'stop');
    response.end('data: [DONE]\n\n');
  }

  const server = createServer((request, response) => {
    void (async () => {
      assert.equal(request.url, '/v1/chat/completions');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.authorization, 'Bearer local-test-key');
      let input = '';
      for await (const part of request) input += part;
      const body: Request = JSON.parse(input);
      requests.push(body);
      trace({ request: body });
      await reply(body, response);
    })().catch((error: unknown) => {
      errors.push(error);
      trace({ mockError: String(error) });
      response.destroy(error instanceof Error ? error : undefined);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return {
    requests,
    errors,
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    async close() {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}
