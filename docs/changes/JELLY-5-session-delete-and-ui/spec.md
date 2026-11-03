---
change: JELLY-5
stage: spec
status: in-review
owner: Jelly 架构师
baseline: 2a3392a9f65c0031a075b20d5af659bd12095e53
inputs:
  - docs/changes/JELLY-5-session-delete-and-ui/intent.md@16e3fbe
  - docs/changes/JELLY-5-session-delete-and-ui/images/
  - docs/architecture/current-runtime.md
  - docs/architecture/decisions/0001-monorepo-and-toolchain.md
  - docs/architecture/decisions/0002-contract-rpc.md
  - docs/architecture/decisions/0003-product-boundaries-and-docs.md
  - "代码：packages/contracts、packages/domain、apps/agent-service、packages/ui、apps/obsidian-plugin"
  - 分支 origin/codex/markdown-question-references（PR #4，引用草稿现状）
confirmed:
  - decision: "删除改为归档：只从列表隐藏，数据保留，可还原；彻底删除才二次确认"
    by: 方阿森
    at: 2026-11-03
    source: "PRD confirmed（JELLY-5 评论）"
  - decision: "未发送内容不落盘，含引用草稿；引用的原文找不到时直接删掉对应引用记录"
    by: 方阿森
    at: 2026-11-04
    source: "PRD confirmed（JELLY-5 评论）"
  - decision: "多窗口不同步属预期，不作为本轮问题"
    by: 方阿森
    at: 2026-11-04
    source: "PRD confirmed（JELLY-5 评论）"
  - decision: "PRD 已确认，进入架构方案"
    by: 方阿森
    at: 2026-11-04
    source: "JELLY-5 评论：我没有别的问题了，推进到下一步吧"
supersedes: null
---

# 方案：会话元数据旁挂，归档与彻底删除走独立契约

> 本文件由架构师在「架构方案」阶段维护。交互与原型由产品设计师提供（PRD + Paper 稿）；这里只回答数据模型、模块影响、兼容与代价。`status` 保持 `in-review`，用户确认关键选择后才进入规划。

## 现状

### 链路

- 插件 UI 通过 oRPC 调用 `sessions.list / read / create`，发起 `chat.stream`；UI 不上传历史，历史由 Service 的 Session Manager 从 JSONL 恢复（`docs/architecture/current-runtime.md:80`）。
- `SessionManager` 每次 `list()` 都会读取并解析全部会话文件，再按 `updatedAt` 倒序（`apps/agent-service/src/session/session.ts:222-227`）；`view()` 把每个 Run 拍平成 `userText / assistantText`（`session.ts:233-252`）。
- JSONL Store 只有 `ids / read / create / append`，按会话串行排队，路径固定为 `<vault>/.jelly/sessions/<uuid>.jsonl`（`apps/agent-service/src/session/jsonl-store.ts:25,64-130`）。
- 契约只有 3 个会话接口（`packages/contracts/src/index.ts:36-43`）：`create`、`list`、`read`；`sessionSummarySchema` 只有 `id / title / updatedAt`（`packages/contracts/src/index.ts:4-9`）。

### 今天没有的能力

- 没有改名、没有归档、没有还原、没有删除。会话一旦创建，标题固定为 `"新会话"`（`apps/obsidian-plugin/src/chat-view/use-chat.ts:83,117`）。
- 标题只存在会话头 `session-created` 里，`version: 1`，写一次不再变（`apps/agent-service/src/session/records.ts:26-33`）。
- 没有"会话元数据"这个概念：记录类型只有会话头、Run 开始、消息、Run 结束四种（`records.ts:26-47`）。

### 已知限制（会影响本轮设计）

1. `restore()` 假定"会话头之后的每条记录都属于某个 Run"，遇到不认识的记录或顺序不符一律抛错（`session.ts:40-50`）。往同一个 JSONL 里加非消息记录，必须同时改恢复逻辑；旧版本读新文件会整条会话读取失败。
2. `recordSchema` 是严格的判别联合（`records.ts:26`）。未知 `type` 直接抛 Zod 错误，没有"忽略未知记录"的降级路径。
3. `updatedAt` 取文件最后一条记录的时间（`session.ts:55`）。任何一次元数据写入如果进 JSONL，都会顺带改变排序。
4. 界面层：会话切换是 Radix `Select` 下拉（`packages/ui/src/SessionToolbar.tsx:71-114`），项内不能放可点击的行内操作；顶部有品牌块（`SessionToolbar.tsx:38-47`）和 `ChatPanel` 的"对话"标题（`packages/ui/src/ChatPanel.tsx:61-72`），两者都要按 PRD 去掉。
5. 插件把引用草稿按 `sessionId` 存进插件 data（PR #4 分支 `apps/obsidian-plugin/src/main.ts:28-43`、`src/references/drafts.ts`），与"未发送不落盘"冲突；该改动在 PR #4 处理，本方案只保证会话侧不依赖草稿。

## 目标与差异

### 目标

1. 会话元数据可写：改名、归档、还原。
2. 彻底删除：真的删除该会话的持久化数据，不可恢复。
3. 列表与视图能区分活跃/归档，并给出归档时间。
4. 归档掉最后一个活跃会话时，服务端保证仍有可用会话。
5. 标题在第一次提问后自动变成问题摘要；用户改名优先。
6. 界面按 PRD 重排：顶部只留会话名 + 新建 + 切换箭头；列表行悬停出现行内操作。

### 与现状的差异

| 维度 | 现状 | 本轮 |
| --- | --- | --- |
| 会话接口 | create / list / read | + rename / archive / unarchive / delete |
| 会话元数据 | 只有会话头里的初始标题 | 独立可写的元数据（标题覆盖、归档时间） |
| 列表 | 全部会话，按 updatedAt | 默认只列活跃；归档单独列 |
| 标题 | 常量"新会话" | 无改名时由首条提问派生 |
| 删除 | 无 | 文件级彻底删除 |
| 顶部/行内 UI | 品牌块 + 下拉选择 | 会话名 + 箭头；行内改名/归档 |

### 明确不改变

- JSONL 里的对话记录格式：`session-created / run-started / message-added / run-finished` 保持不变，`version: 1` 不变。
- 模型协议消息：仍只有 user / assistant / tool 三种 `AgentMessage`，元数据永远不进模型历史。
- 流式事件与 `chat.stream` 的入参、`done` 语义不变。
- 单进程模型：不引入多进程写入协调，也不做多窗口同步。
- 引用草稿的持久化问题留在 PR #4，本方案不处理其代码。

## 交互与设计稿

交互已由 PRD 定稿（`intent.md`「场景」与「界面」），这里只记录对实现有约束的部分。

- 状态清单：活跃列表（默认 / 悬停整行 / 悬停图标）、空列表、归档列表、归档空、撤销条（5 秒）、彻底删除确认、改名就地编辑（保存 / 取消 / 失败）、各类失败错误条、忙碌（恢复中 / 生成中）。
- 流程：`intent.md` 的 Mermaid「会话管理流程」；归档当前会话走"切到最近会话 / 自动新建"的判定。
- 设计稿：Paper `Jelly · Obsidian UI Kit` → `JELLY-5 · 会话删除`；仓库内图在 `images/`（`main-360.jpg`、`list-hover.png`、`archive.png`、`states.png`、`dark.png`）。
- 窄侧栏：PRD 要求 280 / 360px 可用；现有样式已有 `@container (max-width: 280px)` 分支（`apps/obsidian-plugin/public/styles.css:540-547`），列表与撤销条要按同一断点收起次要信息。
- 亮/暗：沿用 Obsidian 变量，`dark.png` 为参考。

### 实现层面的交互约束

- 行内操作不能塞进 `Select.Item`：项本身是选择控件，内嵌按钮会同时触发选择。列表改为"弹出面板 + 行内平级按钮"，`packages/ui` 增加列表组件，保留 Radix 作为焦点/弹层原语。
- 撤销条是纯客户端 5 秒定时器，服务端不排程。归档在点击时已生效；撤销是 `unarchive` 调用。超时只隐藏提示，归档状态不变。
- 失败不做乐观更新：归档失败时列表不动，错误条可重试；彻底删除失败时会话仍在归档列表。

## 数据模型

### 三层职责

| 概念 | 长期存储记录 | 模型协议消息 | UI 展示消息 | 转换点 |
| --- | --- | --- | --- | --- |
| 会话元数据（标题覆盖、归档时间） | 建议：`sessions/<uuid>.json` 元数据文件（本轮新增）；兜底方案为 JSONL 新记录 | 不进入 | `SessionSummary { id, title, updatedAt, archivedAt? }` | `SessionManager.list/view` 合并 JSONL 与元数据 |
| 对话消息 | `message-added`（`records.ts:35-40`） | `AgentMessage` user/assistant/tool | `ChatMessage { id, role, content }` | `toHistory()` 供模型（`session.ts:65-77`）；`view()` 供界面（`session.ts:233-252`） |
| 运行状态 | `run-started` / `run-finished`（`records.ts:34,41-46`） | 未完成运行折成一条"历史运行记录"说明（`session.ts:65-77`） | `runs[].status` → 中断/失败提示（`react-view.tsx:27-53`） | `restore()`（`session.ts:36-58`） |
| 未发送草稿（含引用） | 不落盘（本轮明确） | 不进入 | 输入框组件内部 state | 无；PR #4 需去掉现有持久化 |
| 归档列表 | 元数据 `archivedAt` 非空的会话 | 不进入 | 归档面板列表 | `list({ archived: true })` |

结论：**元数据不是消息**。它不参与 `toHistory`，不改变 Run 折叠规则，也不应该让旧读卡器整条会话读不出来。

### 元数据形态（推荐方案 B）

`<vault>/.jelly/sessions/<uuid>.json`，JSON 对象，独立 `version`：

```json
{ "version": 1, "title": "可选的用户改名", "archivedAt": "可选的归档时间" }
```

- 缺文件、空对象、字段缺失 = 默认值（未改名、未归档），不需要迁移。
- 读取失败（损坏、半写）按默认值处理，并在 `list()` 里跳过该会话的元数据，不影响对话数据。
- 写入用"临时文件 + `rename`"原子替换，复用 Store 现有的按会话队列（`jsonl-store.ts:35-56`），与同会话的 JSONL 追加串行。
- 沿用目录约定：文件名为 UUID；`ids()` 只扫 `*.jsonl`（`jsonl-store.ts:86-92`），元数据文件不会被当成会话。

### 字段与派生规则

- `title`：用户显式改名时写入；契约限制 `trim().min(1).max(60)`（PRD：最多 60 字，空名不保存）。
- `archivedAt`：归档时写 ISO 时间，还原时删除该字段；不写 `null`，保持"字段存在 = 已归档"。
- 列表标题：`meta.title ?? 首条 user 消息摘要 ?? 会话头标题`。摘要在 `SessionManager` 内计算（折叠空白、截断），`list()` 与 `view()` 用同一函数，契约里 `title` 仍是字符串，UI 不需要知道来源。
- `updatedAt`：仍取最后一条对话记录的时间；改名、归档不改变它，避免列表跳位。归档列表按 `archivedAt` 倒序。
- 归档/还原/改名不写 JSONL，因此不改变 `updatedAt`，也不进入模型上下文。

### 新消息/新字段如何扩展

- 元数据文件有自己的 `version` 和对象结构，加字段是加法；不认识的新字段被忽略，旧读卡器仍能读到 `title`、`archivedAt`。
- JSONL 侧本轮不加记录类型，所以 `recordSchema` 保持严格；未来加记录类型时才需要 `version` 协商与"未知记录跳过"的读取策略（见「未来扩展演练」）。
- 分类/分组：以后在元数据对象加 `category` 字段并在 `list` 加过滤参数即可，无需迁移旧会话，也不动 JSONL。

### 旧数据与未知内容如何降级

- 旧会话：没有元数据文件 → 活跃、标题走派生规则；JSONL 原样可读。**不需要重写任何既有文件。**
- 元数据损坏：按默认值读取，会话仍可用；损坏不阻塞 `list`，也不删除文件。
- 旧客户端（用户回退版本）：旧 Service 只认 `*.jsonl`，会忽略元数据文件，把归档会话也列出来——行为退化但不丢数据、不报错。这是本方案相对"写进 JSONL"的主要优势。

### 流式、中断、恢复所需信息

- 元数据与运行生命周期解耦：`run` 的状态仍只由 `run-started/run-finished` 决定，`initialize()` 的恢复逻辑不变（`session.ts:204-210`）。
- 归档会话禁止发起新运行：`beginRun` 增加"已归档则拒绝"检查（`session.ts:118-144`），避免消息写进一个界面上看不见的会话。
- 删除会话时如果该会话正在运行（`active` 里有记录），服务端拒绝删除，返回冲突错误；运行结束后才能删。
- 流式/中断信息本轮不新增字段：`run-finished` 的四种状态够用。

## 模块影响

| 包/模块 | 改动 | 原因 | 风险 |
| --- | --- | --- | --- |
| `packages/contracts` | `sessionSummarySchema` 增加可选 `archivedAt`；新增 `rename/archive/unarchive/delete` 四个接口；`list` 入参增加可选 `archived`；错误码区分 `NOT_FOUND` / `CONFLICT` | 界面需要归档时间与行内操作；`list` 要区分两个列表 | 契约一改，插件与 Service 必须同版本发布（现有约定，见 ADR 0002） |
| `packages/domain` | 不变（如需可加 `SessionMutationResult` 类型） | 元数据属于会话层，不是模型消息 | 无 |
| `apps/agent-service/src/session/records.ts` | 不变 | 对话记录保持纯粹 | 无 |
| `apps/agent-service/src/session/jsonl-store.ts` | 增加 `remove(id)`；新增元数据读写（`readMeta` / `writeMeta` / `removeMeta`），共用队列与 UUID 校验 | 彻底删除、改名、归档需要文件级操作 | 元数据写入与删除的一致性（见下） |
| `apps/agent-service/src/session/session.ts` | `restore` 并入元数据；新增 `rename / archive / unarchive / remove`；`list` 按归档过滤；`beginRun` 拒绝归档会话；archive 后活跃数为 0 时创建新会话 | 业务规则落在这里，才可单测 | 方法变多，注意 `active` 状态与文件操作顺序 |
| `apps/agent-service/src/rpc/rpc.ts` | 绑定四个新 handler；把"会话不存在""有运行中任务"映射为可区分错误 | 界面要按错误类型给不同反馈 | 现有 `failure()` 会把所有错误压成通用文案（`rpc.ts:25-28`） |
| `packages/ui` | 新增会话列表面板（行 = 选择按钮 + 改名/归档图标按钮，平级不嵌套）、归档面板、撤销条、确认框；`SessionToolbar` 改成"会话名 + 新建 + 箭头"；`ChatPanel` 去掉"对话"标题 | PRD 的界面结构；`Select` 装不下行内按钮 | 组件变多，需保持宿主无关、只用 CSS 变量 |
| `apps/obsidian-plugin/src/chat-view/use-chat.ts` | 增加 `rename/archive/unarchive/remove`、归档列表读取、撤销定时器、错误分支；初始化在无活跃会话时创建 | 界面状态与 RPC 编排都在这一层 | 定时器与请求竞态；需要可测的纯逻辑 |
| `apps/obsidian-plugin/public/styles.css` | 顶部精简、行内图标悬停态、归档面板、撤销条、窄宽度 | 视觉与留白 | 与 Obsidian 主题变量的兼容 |
| `docs/architecture` | 实现合入时更新 `current-runtime.md` 的会话接口与存储说明，`evolution.md` 加一条；本阶段新增 ADR 0004 `proposed` | 架构文档跟着实现走 | 本阶段不改 `current-runtime.md`（只写已实现事实） |

### 删除的一致性

- 删除顺序：先删 JSONL，再删元数据文件。JSONL 删除失败 → 整体失败，数据完好。
- 元数据残留（JSONL 已删、元数据没删）：`ids()` 只扫 JSONL，残留不会被列出，可在下次 `list()` 顺手清理；不当作错误。
- 反向残留（元数据已删、JSONL 还在）不做：顺序保证不会出现。

## 兼容与迁移

- **旧会话**：无元数据文件即默认活跃；标题派生只影响显示。无需迁移脚本、无需重写文件。
- **旧 JSONL**：格式与 `version: 1` 不变；`restore()` 的解析顺序不变。
- **旧读取器**：忽略 `*.json` 元数据，得到"全部会话都活跃"的降级行为；不报错、不丢数据。
- **回滚**：回退插件与 Service 时不需清理元数据文件；如需完全回到旧行为，删除 `sessions/*.json` 即可（归档会话重新出现在列表）。
- **契约版本**：接口新增属于同版本内的扩展；插件与 Service 一起发布，不保留旧版兼容分支（ADR 0002 已定）。
- **迁移步骤**：无。唯一一次性动作是 PR #4 去掉引用草稿持久化，属于 PR #4 自己的改动。

## 备选方案

### 方案 A：元数据写进现有 JSONL（最小改动）

- 做法：新增 `session-renamed`、`session-archived`、`session-unarchived` 三类记录，追加进 `<uuid>.jsonl`；标题与归档状态由 `restore()` 折叠得出。
- 改动面：`records.ts`（联合扩容）、`session.ts`（`restore` 增加元数据记录分支、`list` 过滤）、`jsonl-store` 不需要新方法（`append` 够用）、契约与 UI 同方案 B。改动文件最少。
- 代价/风险：
  - `restore()` 现在假定"除会话头外都属于 Run"（`session.ts:40-50`），加记录类型必须重排这段逻辑；顺序校验也会变复杂。
  - 旧版本读新文件会因为未知 `type` 直接失败（`records.ts:26`），回退等于"所有会话都读不出来"。要么接受"只升不降"，要么让读卡器容忍未知记录并加版本号——后者已经接近重写读取层。
  - 元数据写入会改变 `updatedAt`（`session.ts:55`），归档动作会让会话跳到列表首位，需要额外排除规则。
  - 对话日志里混入 UI 状态，后续任何"给会话加字段"都继续污染 Run 折叠逻辑。
- 未来扩展：分类、置顶、排序都只能继续加记录类型，日志越来越杂。

### 方案 B：会话元数据旁挂文件（推荐）

- 做法：每个会话一份 `<uuid>.json` 元数据，原子写，缺省即默认；JSONL 完全不动。
- 改动面：`jsonl-store.ts` 增加元数据读写与 `remove`；`session.ts` 合并元数据、派生标题、过滤列表；契约与 UI 同方案 A。
- 代价/风险：
  - 目录里多一类文件，`list()` 每个会话多读一个小 JSON（当前 `list()` 已经在读整份 JSONL，`session.ts:223`，成本可忽略）。
  - 跨两个文件的操作只有"彻底删除"，用固定顺序 + 残留可清理来兜底。
  - 需要一份元数据 schema（很小）和一条"损坏按默认值"的约定。
- 未来扩展：加字段是加法；要做索引或迁移到单文件，只改 Store 内部，不动契约。

### 方案 C：归档 = 把会话文件移到 `sessions/archive/`

- 做法：活跃列表扫 `sessions/`，归档列表扫 `sessions/archive/`；还原就是移回来。
- 改动面：`pathFor` 要按状态解析，`read/append/remove` 都要先找位置；`ids()` 变成两组。
- 代价/风险：
  - 同一会话的路径随状态变化，`read` 前要先探测，失败模式变多。
  - 归档时间没有存储位置，只能靠文件 mtime，不可靠也不可测。
  - 不留"归档 = 状态"的语义位，以后分类/排序仍要另加元数据，等于两套机制。
- 未来扩展：最差；只适合"归档即搬家"的极简需求。

## 推荐与理由

- **推荐方案 B**：元数据旁挂文件，JSONL 与模型协议不动。
- 理由：
  1. 三个边界干净：对话日志只存对话，元数据不参与 `toHistory`，也不让旧读卡器崩溃。
  2. 迁移成本为零：没有旧文件要改，回退只是"忽略元数据、归档会话重新出现"。
  3. 扩展位置正确：分类、置顶、归档排序以后都加在元数据对象上，不动 JSONL。
  4. 可测：元数据读写、合并、派生标题都是纯函数级别，能在 `session.test.ts` 与新增 store 测试里覆盖。
- 本轮不采用：
  - 不做通用 content-parts；
  - 不做事件溯源/命令日志；
  - 不做软删除墓碑记录（彻底删除就是删文件）；
  - 不引入 SQLite 或全局索引文件；
  - 不做多窗口同步、不做后端服务。
- 代价要说清：多一个文件类型、一条一致性约定、一份小 schema；目录里文件数翻倍（N 个会话 2N 个文件），在个人 Vault 规模下可接受。

## 未来扩展演练

假设下一轮新增一种消息形式：**用户发文件附件，assistant 返回一张生成结果卡片**。

要改的公共部分（与方案无关）：

- `packages/contracts`：`chatGenerateInput` 增加 `attachments`（id、文件名、大小、类型）；流式事件增加 `part` 或 `attachment` 事件。
- `packages/domain`：`ChatMessage` 从 `content: string` 扩展出分段或 `parts`；`AgentOutputEvent` 增加一种事件。
- `apps/agent-service`：附件二进制落地（如 `.jelly/attachments/<uuid>`）；`messageSchema` 增加消息形态；`view()` 把存储形态拍平成 UI 可渲染结构；删除会话时一并清理附件。
- `packages/ui`：卡片/附件渲染组件；`ChatPanel` 的消息渲染分支。

按方案看的差异：

| 环节 | 方案 A（元数据进 JSONL） | 方案 B（元数据旁挂，推荐） | 方案 C（目录搬家） |
| --- | --- | --- | --- |
| 加新消息形态 | 改 `messageSchema`，同时要处理"同一文件里既有旧消息又有新元数据"的版本判断 | 只改 `messageSchema` 与读取兼容，元数据路径不受影响 | 同左 |
| 旧 JSONL 兼容 | 需要"按行判断版本"或整体重写；旧客户端读到新记录直接失败 | 新消息形态用 `version` 协商读取，旧消息按纯文本读；不需要重写 | 同左，但归档目录里的旧文件也要能被同一条读取路径找到 |
| 旧客户端降级 | 硬失败（整条会话读不出来） | 元数据被忽略，会话仍可读；新消息形态才需要版本处理 | 归档会话在旧客户端里看不到（文件在子目录），属于静默丢列表 |
| 附件清理 | 删除会话要删 JSONL + 附件；元数据在同一文件内不算额外 | 删除会话要删 JSONL + 元数据 + 附件，三处固定顺序 | 删除要处理两个目录 + 附件，最容易漏 |
| 改动代价 | 中高（读取层重排，回退风险） | 中（集中在消息形态，路径清晰） | 高（路径与目录语义要重做） |

结论：新消息形式无论选哪个方案，都要动契约、领域类型、存储 schema、UI 渲染；差别在**读取兼容与回退**。方案 B 把"会话管理"和"消息形态扩展"解耦，下一轮只需面对后者。

## 测试策略

### Vitest（Service）

- 新增 `jsonl-store.test.ts`：元数据缺失 → 默认值；写后读；损坏 JSON → 默认值且不抛；`remove` 后 `ids()` 不再返回；元数据文件不被当成会话；同会话写入串行（并发 rename + append 不产生半文件）。
- `session.test.ts` 增补：
  - 改名落盘、重启后仍生效；空名/超长名被契约拒绝。
  - 归档后 `list()` 不返回、`list({ archived: true })` 返回且带 `archivedAt`；还原后回到活跃列表。
  - 归档最后一个活跃会话 → 自动创建新会话，且新会话可立即运行。
  - 彻底删除后文件不存在；删除运行中的会话被拒绝；删除不存在会话返回 `NOT_FOUND`。
  - 归档会话 `beginRun` 被拒绝。
  - 标题派生：首条提问摘要；改名优先；无提问时为会话头标题；新旧会话混合时 `list()` 与 `view()` 标题一致。
  - 旧文件（无元数据）读取正常，`updatedAt` 排序不变；元数据写入不改变 `updatedAt`。
- `apps/obsidian-plugin/src/rpc/client.test.ts` 增补：四个新接口的端到端调用、错误码映射、重启后状态保持（复用现有 `app.request` 与临时目录模式）。

### Vitest（UI / 客户端）

- `renderToStaticMarkup`（现有模式，见 `chat-panel.test.tsx`）：列表行的可访问名称、图标按钮的 `aria-label`、归档面板标题、确认框文案包含"不可恢复"、顶部没有品牌名与"对话"标题。
- 纯逻辑抽出来直接测：撤销定时器（注入时钟，5 秒后触发隐藏）、改名草稿的状态迁移、错误分支选择。定时器不要依赖渲染。
- 不使用快照测试比对像素；视觉在真实宿主里人工看。

### 真实 Obsidian E2E（人工清单）

1. 改名 → 刷新面板 → 重启 Obsidian → 名字还在；空名不保存。
2. 归档 → 行消失 → 5 秒内撤销回来 → 超时后出现在归档列表。
3. 归档当前/最后会话 → 切到最近的或自动新建，界面可立即输入。
4. 归档列表还原；彻底删除确认框写明不可恢复；删除后重启，会话不回来，其他会话与笔记/PDF 不变。
5. 归档失败（临时改目录权限）→ 会话不消失、错误条可重试；改名与删除失败同理。
6. 280 / 360px 侧栏、亮色/暗色下检查留白、悬停态与重复标题消失。
7. 引用草稿不落盘：重开面板/重启后不恢复（与 PR #4 合并后一起验）。

### Agent 行为评测

不需要模型参与。唯一要断言的是"元数据不进模型上下文"：用现有 `session.test.ts` 的 `seen: AgentMessage[][]` 模式断言 `beginRun` 拼出的历史里没有元数据字段，也没有归档相关的系统提示。

### 不做

- 多窗口同步、跨进程并发写入、崩溃注入（`rename` 原子性靠文件系统保证，不做故障注入）。

## ADR

- 提案：`docs/architecture/decisions/0004-session-metadata-storage.md`，状态 `proposed`。
- 需要用户确认的关键选择（最多 3 个）：
  1. 元数据存哪：旁挂 `<uuid>.json`（推荐）还是写进 JSONL？影响回退行为与旧客户端。
  2. `sessions.delete` 的语义：直接不可逆删除（服务端只校验存在且无运行中任务，界面只在归档列表暴露，推荐），还是要求"必须先归档"再删？
  3. 归档最后一个会话时，由服务端在同一次调用里创建新会话（推荐，避免客户端竞态），还是由客户端判断后再 `create`？

## 未决问题

| 问题 | 影响 | 需要谁回答 | 当前建议 |
| --- | --- | --- | --- |
| 自动标题的截断长度与是否去 Markdown（例如 24 字 + 省略号） | 列表观感；派生规则不影响存储 | 产品设计师 | 24 个字符、折叠换行与多余空白、不加省略号以外的符号 |
| 归档列表的排序 | 归档面板行序 | 产品设计师 | 按 `archivedAt` 倒序 |
| 顶部原有"刷新会话"图标是否保留 | 界面元素数量；PRD 只写了会话名 + 新建 + 箭头 | 产品设计师 | 去掉图标，打开列表时刷新 |
| 归档是否显示数量/角标 | 范围 | 产品设计师 | 本轮不做 |
| 会话被外部工具改名/删除文件时如何处理 | 错误提示 | 架构师后续 | 本轮按"读取失败 → 列表跳过该会话"处理，不额外设计 |

## 交接

- 下一阶段：规划中
- 进入条件：用户在「方案待确认」确认上述 3 个关键选择（或直接采纳推荐），ADR 0004 从 `proposed` 改为 `accepted`。
- 规划阶段需要读：本文件、`intent.md`、`docs/architecture/current-runtime.md`、`apps/agent-service/src/session/*`、`packages/ui/src/SessionToolbar.tsx`、`apps/obsidian-plugin/src/chat-view/use-chat.ts`。
