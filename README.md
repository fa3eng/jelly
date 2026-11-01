# Jelly

Jelly is a desktop Obsidian AI assistant named after the author's cat. Chat with your notes, read Markdown and text-based PDFs, and ask the assistant to create or edit Markdown files in your vault.

## Features

- Streaming conversations with Markdown replies and local conversation history.
- File tools limited to the current vault, with path and file-type checks.
- Local text extraction from PDFs; scanned PDFs need OCR elsewhere.
- Markdown creation, version-checked editing, and deletion when requested.
- An independent Agent Service process using Obsidian's bundled runtime; users do not need to install Node.js separately.
- On-demand task instructions from standard `SKILL.md` files installed in the vault's `.jelly/skills/` directory.

## Install and configure

Download the ZIP from the [latest release](https://github.com/fa3eng/jelly/releases/latest). Extract its `jelly` folder into `<vault>/.obsidian/plugins/`, enable Jelly under **Settings → Community plugins**, then open **Settings → Jelly**.

Enter your own API key, API base URL and model ID, then choose **Save and start** (currently labeled **保存并启动**). The default endpoint is `https://api.deepseek.com` and the default model is `deepseek-flash`. Open Jelly using the command palette and send a message. The interface is currently in Chinese.

Jelly requires Obsidian 1.11.4 or later and a desktop installer with Node 20.19 or later. The packaged service has been tested on macOS with Electron 43.3.0. Windows and Linux have not yet been validated. If the app reports an old runtime, update the desktop installer, not just the in-app JavaScript version.

## Privacy, costs and file access

Your API key is stored through Obsidian SecretStorage. The endpoint and model are stored in the plugin configuration. Conversations, including tool results, are stored locally in `<vault>/.jelly/sessions/`.

Model requests send conversation context and any file content used by the assistant to the provider you configure. The provider may require an account and charge usage fees; review its data policies before using private notes. Jelly's local service listens only on `127.0.0.1` and uses a random launch token for plugin requests.

The desktop service uses Node filesystem APIs to read and write files within the configured vault, rather than the Obsidian Vault API. File deletion is permanent: this version has no per-operation confirmation dialog, trash integration or undo. Back up your vault before using write tools. The development environment can explicitly configure external directories; the installed plugin fixes its file-tool scope to the current vault.

## Development

Use Node.js 20.19+ and pnpm 10. Run `pnpm install`, then `pnpm run dev` for the demo vault or `pnpm build` for the three production plugin files. `pnpm check` and `pnpm test` run local validation without model credentials. See the Chinese guide below for environment setup and release commands.

Task PRs target `develop` by default. Integrated changes are validated there before merging into stable `main`; release tags are created from `main`. See [branching and release conventions](docs/development-workflow.md).

The project uses the [MIT license](LICENSE). Bundled dependency licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and retained in the plugin bundle.

---

## 中文使用与开发指南

Jelly 是一个桌面端 Obsidian AI 助手，支持围绕本地 Markdown 资料进行对话。

## 功能

- 在 Obsidian 侧栏中进行多轮对话，流式显示 Markdown 回答。
- 由 Agent 按需列出资料，读取当前 Vault 中的 Markdown 与文本型 PDF。
- 按用户要求新建、编辑或删除 Markdown 文件。
- 新建、切换和恢复会话；对话与工具记录保存在本地 JSONL 文件中。
- 停止生成，并记录运行完成、取消、中断或失败状态。
- 通过 OpenAI-compatible Chat Completions 接口调用支持流式输出和工具调用的模型。

当前仅支持桌面端。发行版使用 Obsidian 自带的 Node 运行环境启动独立 Agent Service，无需用户另装 Node.js。安装后在 **设置 → Jelly** 填写 API Key、API 地址和模型名称，保存后自动启动。以后启用插件会自动读取配置并启动服务。

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
JELLY_DOCS_DIRECTORY=/absolute/path/to/markdown-directory
JELLY_SESSION_DIRECTORY=/absolute/path/to/session-directory
```

`OPENAI_BASE_URL` 可省略，此时使用 SDK 的默认服务地址。模型必须支持当前工具调用及流式协议；兼容性取决于具体服务与模型。`.env`、本地会话和 Obsidian 配置不纳入 Git。

```sh
pnpm run dev
```

开发构建会持续写入 `example/demo-vault/.obsidian/plugins/jelly/`。在 Obsidian 中将 `example/demo-vault/` 作为 Vault 打开，到 **Settings → Community plugins** 启用 Jelly，然后运行命令 **Jelly: Open**。

源码重新构建后，在 Obsidian 命令面板运行 **Reload app without saving** 加载更新；修改 manifest 后重启 Obsidian。

## 构建与本地安装

```sh
pnpm build
```

构建会在仓库根目录提供标准安装文件 `main.js`、`manifest.json` 和 `styles.css`，同时保留 `apps/obsidian-plugin/dist/` 中的相同产物。手动安装时，将这三个文件复制到目标 Vault 的 `.obsidian/plugins/jelly/`。服务代码已内嵌在 `main.js` 中，首次启动会在插件目录的 `.runtime/<内容哈希>/` 内准备服务入口，更新后使用对应版本的入口。

启用插件后，打开 **设置 → Jelly**：

1. 填入自己的 API Key。密钥保存在 Obsidian 的 SecretStorage 中，不写入插件 `data.json`。
2. 填写 API 地址和模型名称，默认使用 `https://api.deepseek.com` 与 `deepseek-flash`。这些普通配置保存在插件 `data.json`。
3. 点击 **保存并启动**，看到服务就绪后点击 **打开 Jelly** 开始对话。首次安装尚未填写 Key 时，插件会显示配置引导；以后重新启用时自动启动。

模型名称以服务商提供的模型 ID 为准。保存配置只启动本地服务，真实模型连通性需发送一条消息验证。

生产版本将当前打开的 Vault 作为文件工具范围，会话固定保存在该 Vault 的 `.jelly/sessions/`，无需配置目录。生产版本不读取旧插件 `.env`；开发模式在尚未配置 Key 时仍支持仓库根目录 `.env`，配置 Key 后采用设置页及 Vault 默认目录。

生产启动通过宿主 Electron 的 `utilityProcess` 创建独立进程，界面与服务仍使用 HTTP/oRPC 通信；不会下载或安装额外依赖。需要 Obsidian 1.11.4 或更新版本，以及提供 Node 20.19 或更高版本的桌面安装程序。开发模式仍使用本机 Node 和 tsx。

## 数据与网络

- 模型请求发送到配置的模型服务。发送内容包括系统提示词、对话历史，以及 Agent 读取并用于回答的 Markdown 内容；使用前请确认相应服务的数据处理政策及费用。
- Agent Service 在本机独立 Node 子进程中运行，只监听 `127.0.0.1`；插件与服务通过启动时生成的令牌通信。
- 文件工具将增删改查限制在当前 Vault；检查实际路径和文件类型，拒绝越界和文件软链接。PDF 在本地解析，仅提取的内容随工具结果进入模型请求。
- 删除文件是永久删除，当前没有逐次确认面板、回收站或撤销；使用写入和删除能力前请备份资料。
- 生产版本的文件工具范围限定为当前 Vault；开发模式使用 `.env` 时可显式指定 Vault 外目录，分别用于文件工具与会话存储。
- 会话以本地 JSONL 文件保存，包含消息和工具结果，可能包含资料正文。请将它们视为个人数据，不要提交到公开仓库。
- 当前版本不提供扫描件 OCR、语义检索或自动上下文压缩。

## Skills：按需加载任务规范

将你编写或信任的 Skill 放入当前 Vault 的 `.jelly/skills/<name>/SKILL.md`。
例如，把仓库中的 [整理笔记示例](examples/skills/organize-notes/SKILL.md) 复制到：

```text
<Vault>/.jelly/skills/organize-notes/SKILL.md
```

文件采用 [Agent Skills 标准格式](https://agentskills.io/specification)：

```markdown
---
name: organize-notes
description: 将口述或零散笔记整理成清楚的 Markdown；用户要求整理已有笔记时使用。
---

# 整理笔记

- 保留原意和不确定性，删除口头重复。
- 按内容组织标题，不强行套模板。
- 用户只要求整理时，先在对话中交付；明确要求保存后才写文件。
```

`name` 必须与父目录同名，最多 64 个字符，使用小写字母、数字和单个连字符；`description` 必需，最多 1024 个字符，说明做什么及何时使用。支持正常 YAML 语法，包括多行描述。标准可选字段可解析，但 `allowed-tools` 不执行，不能用它授予或限制工具权限。

在已经运行新版代码的服务中，新增、修改、删除 Skill **无需重启服务**。直接发送“使用 organize-notes 整理下面的笔记：……”即可试用。目录不存在时普通聊天照常运行，后续创建目录也能发现。第一版没有 Skill 选择器或斜杠命令，模型依据用户要求和目录描述选择工具。

服务维护元数据、文件位置与内容版本，不长期保存正文。发现新文件或变化文件时会有界读取以解析、计算版本，然后丢弃正文；`load_skill` 每次重新校验并读取当前文件。模型最初只收到名称、描述与版本，需要时才取得正文。文件内容与已加载规范会发送给配置的模型服务。

Skill Manager 监听目录，合并保存事件；每次模型请求前再核对文件，补偿监听遗漏。初始目录及增删改通知追加为 Session 内部事件，发送模型时转换成带来源说明的 user 消息，不显示为用户聊天气泡。变化不会唤醒空闲会话或打断正在进行的模型请求，而是在该会话下一次模型请求前提供。删除或格式损坏的 Skill 不再可加载；旧正文仍作为历史保留，模型会收到不可用通知。

工具 Schema 和系统规则不随目录改变。相同版本正文仍在当前上下文时，重复调用返回 `already_in_context` 简短结果；正文变化后返回新版及 revision。状态按 Run 从真实可见的完整成功工具结果重建，不跨会话共享。异常运行中的工具记录按历史说明恢复，不误判为仍已加载的规范。旧 JSONL 会话继续可读，缺少目录事件时下次运行追加初始目录，不改写旧历史。

Runtime 提供通用 `beforeModel` Hooks，依次运行并返回 `append-context` 效果；Session 保存成功后才继续请求模型。Hook 报错或取消会结束本轮，不静默忽略。Skill 同步由 Service 注册，Runtime 不负责 Skill 文件业务。

当前只支持 `SKILL.md` 本身，不读取其附带资源、不执行脚本。文件最多 64 KiB，目录或文件软链接、格式错误等会被跳过；服务启动诊断写入 stderr，动态诊断可从 Manager 目录状态读取，目前没有诊断面板。正文规范不保证模型每次都遵循，也不扩大文件工具权限。监听行为已在本机测试，其他系统依靠请求边界核对保证可发现变化，原生监听行为仍需实机验证。

开发模式默认使用 `<JELLY_DOCS_DIRECTORY>/.jelly/skills`，可设置绝对路径 `JELLY_SKILLS_DIRECTORY` 覆盖；生产环境固定使用当前 Vault 的目录。

## 架构与贡献

任务 PR 默认合入 `develop`，集中验证通过后再合入稳定分支 `main`，正式版本从 `main` 打 Tag。完整流程见 [分支管理与发版约定](docs/development-workflow.md)。

Obsidian 插件负责宿主生命周期和侧栏；UI、Agent Runtime 与通信契约分别位于独立 workspace 包中。本地 Agent Service 负责模型传输、文件工具和会话持久化。

- [当前架构](docs/architecture/current-runtime.md)
- [Monorepo 与工具链决策](docs/architecture/decisions/0001-monorepo-and-toolchain.md)
- [通信契约决策](docs/architecture/decisions/0002-contract-rpc.md)

```sh
pnpm check
pnpm test
pnpm build
```

自动化检查不需要真实模型凭据。宿主启动方式已在 macOS、Electron 43.3.0 上验证；Windows、Linux、其他安装程序版本及社区审核仍需验证。实际模型兼容性取决于服务商与模型。

## 发布

先在 `develop` 完成整体验证并通过普通 Merge 晋级到 `main`，再从已验证的 `main` 提交创建版本 Tag。验证包、紧急修复和具体步骤见 [分支管理与发版约定](docs/development-workflow.md)。

依赖变更后运行 `pnpm licenses:generate` 更新已提交的许可证声明；正式构建直接使用这些声明，避免依赖包管理器的本机存储路径。

项目采用 MIT 许可证，第三方依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。插件命名来自作者家猫 Jelly。

`manifest.json` 是插件元数据的唯一来源；构建会将它写入插件产物。更新版本时同步修改根 `package.json` 的版本和 `versions.json` 映射。

```sh
pnpm check
pnpm test
pnpm build
pnpm release:prepare
```

`dist/release/` 中提供标准安装文件、手动安装 ZIP、校验和及发布说明。ZIP 内的 `jelly` 文件夹可直接放入 Vault 的 `.obsidian/plugins/`。

推送与 manifest 完全一致的版本 tag（例如 `0.1.0`，不带 `v`）后，GitHub Actions 会验证、构建并创建 **草稿 Release**。审核草稿内容后手动发布，再通过 Obsidian Community 提交插件。此流程不会自动向社区目录提交。
