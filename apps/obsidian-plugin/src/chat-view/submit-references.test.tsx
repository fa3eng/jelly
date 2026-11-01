// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionView } from '@jelly/contracts';
import { ReferenceDraftStore } from '../references/drafts';
import { useChat } from './use-chat';

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  stream: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../rpc/client', () => ({
  createRpcClient: () => ({
    close: mock.close,
    client: {
      sessions: { list: mock.list, read: mock.read, create: mock.create },
      chat: { stream: mock.stream },
    },
  }),
}));

const connection = { baseUrl: 'http://localhost:1234', authorizationToken: 'test' };
const reference = () => ({
  id: crypto.randomUUID(),
  path: 'Agent.md',
  text: 'Session 管理历史',
  question: '如何管理？',
  from: { line: 0, ch: 0 },
  to: { line: 0, ch: 12 },
});

describe('提问引用提交生命周期', () => {
  let root: Root;
  let drafts: ReferenceDraftStore;
  let chat: ReturnType<typeof useChat>;
  let view: SessionView;
  beforeEach(async () => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
    });
    vi.clearAllMocks();
    view = {
      id: crypto.randomUUID(),
      title: '测试会话',
      updatedAt: new Date().toISOString(),
      runs: [],
    };
    mock.list.mockImplementation(async () => [
      { id: view.id, title: view.title, updatedAt: view.updatedAt },
    ]);
    mock.read.mockImplementation(async () => structuredClone(view));
    drafts = new ReferenceDraftStore(undefined, async () => {});
    root = createRoot(document.createElement('div'));
    function Harness() {
      const value = useChat(connection, drafts);
      useEffect(() => {
        chat = value;
      }, [value]);
      return null;
    }
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('sends the captured batch, restores its cards from the server and retains next-round references', async () => {
    const first = reference();
    drafts.begin(first);
    drafts.finishPending();
    const snapshot = structuredClone(drafts.getSnapshot().draft.references);
    let release!: () => void;
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    mock.stream.mockImplementation(async function* (input) {
      expect(input.references).toEqual(snapshot);
      expect(input.prompt).toBe('');
      view.runs = [
        {
          id: input.runId,
          status: 'running',
          userText: '',
          assistantText: '',
          references: snapshot,
        },
      ];
      started();
      yield { type: 'text-delta', delta: '回答' };
      await pause;
      view.runs[0]!.status = 'completed';
      view.runs[0]!.assistantText = '回答';
      yield { type: 'done' };
    });
    let submission!: Promise<boolean>;
    await act(async () => {
      submission = chat.submit('', snapshot);
      await ready;
    });
    expect(drafts.getSnapshot().draft.references).toEqual([]);
    expect(drafts.getSnapshot().draft.prompt).toBe('');
    const next = reference();
    drafts.begin(next);
    drafts.finishPending();
    await act(async () => {
      release();
      expect(await submission).toBe(true);
    });
    expect(drafts.getSnapshot().draft.references).toEqual([next]);
    expect(chat.messages.find((message) => message.role === 'user')?.references).toEqual(snapshot);
    expect(chat.messages.at(-1)?.content).toBe('回答');
  });

  it('retains the prompt and references on stream failure for an explicit retry', async () => {
    const quote = reference();
    drafts.begin(quote);
    drafts.finishPending();
    drafts.setPrompt('一起解释');
    mock.stream.mockImplementation(async function* () {
      yield { type: 'text-delta', delta: '未完成' };
      throw new Error('连接中断');
    });
    await act(async () => {
      expect(await chat.submit('一起解释', [quote])).toBe(false);
    });
    expect(drafts.getSnapshot().draft.prompt).toBe('一起解释');
    expect(drafts.getSnapshot().draft.references).toEqual([quote]);
    expect(chat.error).toBe('连接中断');
  });
});
