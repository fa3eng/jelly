# 0003：产品边界、技术克制与文档分层

状态：已采用

## 背景

项目早期把产品设计、阶段计划、教程和历史决策都放在本地 `docs/`，其中大部分没有入库。结果是：

- 后来的 Agent 在 `origin/develop` 看不到上一阶段的需求和设计。
- PR 里只有代码，没有 PRD、Spec 和验证材料。
- 教程、历史计划与当前架构混在一起，读者分不清哪些是已实现、哪些只是设想。

这次把长期有效的边界抽出来，其余历史材料移到仓库外备份。

## 决策

### 产品边界

- Obsidian 是首期宿主，不是 Agent Runtime 的必然依赖。
- 插件适配层只负责生命周期、视图挂载、进程管理和 RPC 客户端。
- UI 消费领域事件，不直接调用模型或 Obsidian API。
- Runtime、UI、领域类型和契约保持宿主无关。
- 首版只支持 Obsidian 桌面端；移动端、远程后端、多用户协作不提前设计。

### 技术克制

- 原生 TypeScript 优先；Effect、RxJS 等依赖必须对应具体问题。
- 通信契约用 oRPC + Zod，类型和运行时校验同时存在。
- 模型、工具、Session、检索各自可独立理解和替换。
- 产品能力按可观察的小步交付；不把 Demo 当最终质量。

### 文档分层

- 当前架构：`docs/architecture/current-runtime.md`，只写已实现的事实。
- 决策：`docs/architecture/decisions/`，记录背景、备选、选择和代价。
- 产品边界：`docs/architecture/product-charter.md`，长期原则。
- 单次改动：`docs/changes/<issue-id>-<slug>/`，PRD、Spec、Plan、Verification。
- 教程、历史计划、旧决策草稿不进产品仓库；放仓库外备份，必要时在 `evolution.md` 留演进记录。

### 单次改动入库

- 每个阶段把自己的 Markdown 提交到任务分支 `codex/<task>`，PR 里带上。
- 仓库是公开的，PRD、设计细节、验收标准会随 PR 公开；敏感需求另用私有存储。
- 不再用 `docs/changes/` 的 `.gitignore` 白名单把单次材料挡在仓库外。

## 影响

- 文档和代码一起 review；PR 描述里的需求上下文可追溯。
- 下一个阶段直接 checkout 同一任务分支读文件，不依赖聊天或 issue 附件。
- 教程和历史材料移出仓库，减少当前文档的噪声；需要时从仓库外备份取回。
- 公开仓库意味着产品决策会公开；如果以后需要保密，必须换成私有 docs 仓库，而不是重新 ignore。

## 参考

- [产品与工程边界](../product-charter.md)
- [当前架构](../current-runtime.md)
- [单次改动材料](../changes/README.md)
