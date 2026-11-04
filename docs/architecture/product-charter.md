# Jelly 产品与工程边界

状态：长期原则；具体实现以 [`current-runtime.md`](./current-runtime.md) 为准。

本文回答“Jelly 是什么、哪些边界不能破、用什么方式推进”。具体模块、接口和启动流程不在本文重复。

## 产品

Jelly 是 Obsidian 插件 + 本地 Agent Service，面向单个用户的本地学习助手。

- 入口是 Obsidian 插件；资料来自当前 Vault。
- 首版只支持 Obsidian 桌面端。移动端、远程后端、多用户协作、完整离线检索不在当前范围。
- UI 和 Agent Runtime 一起设计：UI 是运行事件的消费者和用户控制面，不是模型调用的发起者。
- 产品能力按可观察的小步交付。Demo 是起点，不是最终质量目标。

## 模块边界

```text
Obsidian Plugin Adapter ──挂载──> React UI
          │                         │
          └────── 使用 Domain 契约 ─┘
                         ▲
                  Agent Runtime
                         ▲
                  Agent Service
```

- Obsidian API 只进入宿主适配层。Runtime、UI、领域类型和契约不直接依赖 Obsidian。
- 插件负责生命周期、视图挂载、子进程管理和 RPC 客户端；不实现模型协议。
- Agent Service 负责 HTTP、RPC、模型传输、工具和 Session 组装。
- Agent Runtime 负责 Agent Loop、Context 和工具调用；不直接读写会话文件。
- 可移植核心不等于已经支持其他宿主；要脱离 Obsidian，还需要独立应用入口和依赖实现。

## 技术选择

- TypeScript、React、Vite+、pnpm workspace、Vitest。
- 原生 TypeScript 优先。Effect、RxJS 或其他依赖必须对应具体问题，不提前引入。
- 通信契约用 oRPC + Zod；运行时校验不能省。
- 模型、工具、Session 和检索各自保持可独立理解和替换。

## 文档

文档分四层，各自回答不同问题：

| 层 | 位置 | 回答什么 |
| --- | --- | --- |
| 当前架构 | `docs/architecture/current-runtime.md` | 现在实际怎么运行 |
| 决策 | `docs/architecture/decisions/` | 为什么这样选，代价是什么 |
| 产品边界 | 本文 | 产品是什么、哪些边界不能破 |
| 单次改动 | `docs/changes/<issue-id>-<slug>/` | 这次改什么、怎么验证 |

规则：

- 文档跟随真实实现更新，包含失败尝试和取舍，不只写最终结论。
- 单次改动的 PRD、Spec、Plan、Verification 跟代码一起进仓库、一起 review。
- 教程、历史计划和旧决策草稿不放进产品仓库；需要时放仓库外备份，或在 `evolution.md` 里留一条演进记录。
- 不把计划中的能力写成已实现；不把未合入的 PR 写进“当前架构”。

## 参考

- 历史设计草案与教程已移到仓库外备份，不参与当前实现。
- 当前架构：[`current-runtime.md`](./current-runtime.md)
- ADR：[`decisions/`](./decisions/)
- 演进记录：[`evolution.md`](./evolution.md)
