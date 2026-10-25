# Aula 当前架构

## 模块边界

```mermaid
flowchart TB
    subgraph Host[Obsidian 桌面进程]
        Plugin[插件生命周期与子进程管理]
        UI[React 对话与会话界面]
        Client[oRPC Client]
        Plugin --> UI
        UI --> Client
    end
    subgraph Service[本地 Node 子进程]
        HTTP[Hono / Origin 与 Bearer 校验]
        RPC[oRPC 路由与 Zod 契约]
        Session[Session Manager]
        Store[本地 JSONL Store]
        Runtime[Agent Loop]
        Context[Context Builder]
        Tools[Markdown 文件工具]
        ModelTurn[模型流适配]
        HTTP --> RPC
        RPC --> Session
        Session --> Store
        Session --> Runtime
        Runtime --> Context
        Runtime --> Tools
        Runtime --> ModelTurn
    end
    Plugin -->|启动与停止| Service
    Client -->|本机 HTTP| HTTP
    ModelTurn --> Provider[配置的模型服务]
```

| 模块                     | 职责                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `apps/obsidian-plugin`   | Obsidian 生命周期、侧栏、服务进程管理、RPC 客户端和界面状态 |
| `apps/agent-service`     | HTTP、RPC、模型传输、资料工具与会话存储的业务组装           |
| `packages/agent-runtime` | Agent Loop、单次模型调用、Context 组装和工具注册执行        |
| `packages/contracts`     | oRPC 接口、Zod 运行时校验及客户端类型                       |
| `packages/domain`        | 消息与运行事件类型                                          |
| `packages/ui`            | 宿主无关的 React 展示组件                                   |

Runtime 和 UI 不直接依赖 Obsidian API。Service 组装具体文件工具、模型传输与 Session；Runtime 不直接读写会话文件。

## 请求与持久化

```mermaid
sequenceDiagram
    participant UI as 对话界面
    participant RPC as 本地 RPC
    participant Session as Session Manager
    participant Store as JSONL Store
    participant Agent as Agent Loop
    participant Model as 模型服务
    participant Tools as Markdown 工具
    UI->>RPC: chat.stream(sessionId, runId, prompt)
    RPC->>Session: run(input, signal)
    Session->>Store: 保存运行与用户输入
    Session->>Agent: 历史与本轮输入
    loop 模型与工具循环
        Agent->>Model: 系统提示、历史与工具声明
        Model-->>Agent: 文本增量与完整模型消息
        Agent-->>Session: 展示事件与完整消息
        Session->>Store: 保存完整消息
        Session-->>UI: 经 RPC 返回展示事件
        opt 模型请求工具
            Agent->>Tools: 校验参数并执行
            Tools-->>Agent: 工具结果
            Agent-->>Session: 工具消息与展示事件
            Session->>Store: 保存工具消息
        end
    end
    Session->>Store: 保存本轮结束状态
    RPC-->>UI: done
    UI->>RPC: 重新读取会话视图与列表
```

UI 只发送本轮问题和标识，不上传自行拼接的完整历史。Session 负责恢复历史、运行生命周期和持久化；Runtime 负责推进模型与工具循环。完整历史留在服务端，展示事件不包含全部内部消息。

会话接口提供创建、列表与读取。JSONL Store 按会话排队执行文件操作，使用 UUID 生成文件名。当前设计面向单个 Service 进程，不提供多进程共享写入协调。

## 启动与配置

插件分配回环端口、生成随机令牌并启动 Node 子进程。Service 加载环境配置，初始化会话、工具与模型传输，再开始监听。插件等待带令牌和 Origin 的 readiness 检查成功后注册视图；卸载时停止子进程。

开发模式通过 tsx 加载源码并从仓库根目录读取可选 `.env`；生产模式运行插件目录中的 `agent-service.mjs`，从该目录读取可选 `.env`。模型 Key 与本地通信令牌用途不同。

当前设置仍通过环境变量提供，资料与会话目录必须显式配置为绝对路径。生产版本依赖外部 `node` 命令，尚未提供普通用户设置页及标准社区安装包适配。

## 数据边界

- 文件读取限制在配置的资料目录，解析实际路径后检查越界，只接受 Markdown 文件。
- 本地 RPC 校验 Origin 与启动令牌，服务只绑定回环地址。
- 系统提示词要求把工具内容视为资料；实际文件访问范围由工具代码检查。
- 模型请求会携带对话及使用到的资料内容，发送到用户配置的服务。
- 会话保存用户、模型和工具消息；错误、取消与中断状态用于恢复及界面呈现。

当前不包含笔记写回、语义检索、Skills、MCP 或自动上下文压缩。这些能力不属于现有接口的隐含保证。
