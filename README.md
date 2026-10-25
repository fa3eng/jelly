# Aula

Aula 是一个桌面端 Obsidian AI 助手，支持围绕本地 Markdown 资料进行对话。

## 功能

- 在 Obsidian 侧栏中进行多轮对话，流式显示 Markdown 回答。
- 由 Agent 按需列出、读取指定目录中的 Markdown 文件。
- 新建、切换和恢复会话；对话与工具记录保存在本地 JSONL 文件中。
- 停止生成，并记录运行完成、取消、中断或失败状态。
- 通过 OpenAI-compatible Chat Completions 接口调用支持流式输出和工具调用的模型。

当前仅支持桌面端，需要单独安装 Node.js。当前版本通过环境变量配置模型与数据目录，尚未提供插件设置页，也未完成社区插件安装方式的适配。

## 开发与运行

环境要求：Node.js 20.19 或更高版本、pnpm 10，以及桌面版 Obsidian。

```sh
pnpm install
```

在仓库根目录创建 `.env`，填写以下必需配置。将占位符替换为实际值；两个目录必须使用绝对路径，资料目录需要已经存在。

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-provider.example/v1
OPENAI_MODEL=your-model-id
AULA_DOCS_DIRECTORY=/absolute/path/to/markdown-directory
AULA_SESSION_DIRECTORY=/absolute/path/to/session-directory
```

`OPENAI_BASE_URL` 可省略，此时使用 SDK 的默认服务地址。模型必须支持当前工具调用及流式协议；兼容性取决于具体服务与模型。`.env`、本地会话和 Obsidian 配置不纳入 Git。

```sh
pnpm run dev
```

开发构建会持续写入 `example/demo-vault/.obsidian/plugins/aula/`。在 Obsidian 中将 `example/demo-vault/` 作为 Vault 打开，到 **Settings → Community plugins** 启用 Aula，然后运行命令 **Open Aula**。

源码重新构建后，在 Obsidian 命令面板运行 **Reload app without saving** 加载更新；修改 manifest 后重启 Obsidian。

## 构建与本地安装

```sh
pnpm build
```

产物位于 `apps/obsidian-plugin/dist/`。手动安装时，将整个目录中的文件复制到目标 Vault 的 `.obsidian/plugins/aula/`，包括 `main.js`、`manifest.json`、`styles.css` 和 `agent-service.mjs`。

在目标插件目录创建 `.env` 并配置模型、资料目录与会话目录，再启用插件。开发构建使用仓库根目录的 `.env`；生产构建使用插件目录的 `.env`。已有进程环境变量优先。生产启动通过 `node` 命令运行服务，Obsidian 进程需要能够找到它。

当前资料范围由 `AULA_DOCS_DIRECTORY` 指定，不会自动切换为当前 Vault。若只希望读取当前 Vault，请将该配置指向对应 Vault 或其中的资料子目录。会话目录由 `AULA_SESSION_DIRECTORY` 指定；不同 Vault 应使用不同目录。

## 数据与网络

- 模型请求发送到配置的模型服务。发送内容包括系统提示词、对话历史，以及 Agent 读取并用于回答的 Markdown 内容；使用前请确认相应服务的数据处理政策及费用。
- Agent Service 在本机独立 Node 子进程中运行，只监听 `127.0.0.1`；插件与服务通过启动时生成的令牌通信。
- Markdown 工具只读取配置目录内的 `.md` 文件；读取时检查解析后的实际路径，拒绝越界路径。
- 配置的资料与会话目录可以位于 Vault 外：前者用于读取资料，后者用于保存和恢复对话。范围由配置决定。
- 会话以本地 JSONL 文件保存，包含消息和工具结果，可能包含资料正文。请将它们视为个人数据，不要提交到公开仓库。
- 当前版本不提供笔记写回、PDF 解析、语义检索或自动上下文压缩。

## 架构与贡献

Obsidian 插件负责宿主生命周期和侧栏；UI、Agent Runtime 与通信契约分别位于独立 workspace 包中。本地 Agent Service 负责模型传输、文件工具和会话持久化。

- [当前架构](docs/architecture/current-runtime.md)
- [Monorepo 与工具链决策](docs/architecture/decisions/0001-monorepo-and-toolchain.md)
- [通信契约决策](docs/architecture/decisions/0002-contract-rpc.md)

```sh
pnpm check
pnpm test
pnpm build
```

自动化检查不需要真实模型凭据。插件加载、实际模型兼容性和跨平台运行仍需在 Obsidian 中验证。
