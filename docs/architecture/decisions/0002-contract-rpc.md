# 0002：使用 oRPC 与 Zod 定义通信契约

状态：已采用

## 背景

Obsidian 插件与本地 Agent Service 位于不同进程，需要一致的接口类型、运行时输入输出校验，以及流式事件与取消支持。

## 决策

- 在 `packages/contracts` 中使用 oRPC 与 Zod 定义接口和校验规则，推导客户端类型。
- Service 使用 `implement(contract)` 与 `RPCHandler` 绑定业务实现。
- 插件使用 `RPCLink` 创建类型化客户端。
- Hono 负责 HTTP、CORS、Origin 校验与 Bearer 鉴权。
- 会话接口提供创建、列表和读取；聊天接口接收 `sessionId`、`runId` 和本轮 `prompt`。
- 流式接口只返回展示事件，完整模型和工具历史由服务端 Session 保存。

## 影响

插件与服务需要一起更新。TypeScript 类型不能代替运行时校验，二者由共享契约提供。

通信层不负责组装模型历史、执行工具或推进 Agent Loop。取消信号需从 RPC 继续传递到 Session、Runtime 和模型请求；客户端停止等待本身不足以保证后台执行已停止。

Runtime 不依赖 oRPC 或 Obsidian。模型传输、文件系统和会话存储的具体实现由 Service 组装。

接口与请求链路见 [当前架构](../current-runtime.md)。
