import {
  createAgent,
  createOpenAIModelTurn,
  createContextBuilder,
  createToolRegistry,
} from '@jelly/agent-runtime';
import type { GenerateStream } from '../rpc/rpc';
import type { loadAgentConfig } from '../config/agent-config';
import { createSystemPrompt } from '../prompt/system-prompt';
import { createProjectDocTools } from '../tools/project-docs/project-docs';
import { createModelTransport } from './model-transport';
import { createJsonlStore } from '../session/jsonl-store';
import { createSessionManager, type SessionManager } from '../session/session';

/**
 * 创建 Session、Runtime 与模型传输，并为 HTTP 应用提供展示事件流。
 * @param config - 已校验的模型、文档和本地会话目录配置。
 * @returns 生成函数及会话管理器、传输清理函数；返回前已完成会话初始化。
 */
export async function createAgentStream(
  config: ReturnType<typeof loadAgentConfig>,
): Promise<GenerateStream & { sessions: SessionManager; close(): Promise<void> }> {
  const sessions = createSessionManager(await createJsonlStore(config.sessionDirectory));
  await sessions.initialize();
  const tools = createToolRegistry(await createProjectDocTools(config.docsDirectory));
  const prompt = createSystemPrompt(config);
  const context = createContextBuilder({
    getSystemPrompt: prompt.getSystemPrompt,
    getTools: () => tools.getDeclarations(),
  });

  const transport = await createModelTransport(config);
  const agent = createAgent({
    modelTurn: createOpenAIModelTurn({
      client: {
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        maxRetries: 0,
        ...transport.client,
      },
      model: config.model,
      reasoningEffort: config.reasoningEffort,
    }),
    tools,
    context,
  });

  /**
   * 将 Session 产生的展示事件交给 RPC；完整消息在 Session 内保存。
   * @param input - 会话 ID、Run ID 和本轮用户问题。
   * @param options - 用于取消执行的请求信号。
   * @yields 已经过滤内部 message 项的界面展示事件。
   */
  const generateStream: GenerateStream = async function* (input, options) {
    yield* sessions.run(input, agent.run, options);
  };

  return Object.assign(generateStream, { sessions, close: () => transport.close() });
}
