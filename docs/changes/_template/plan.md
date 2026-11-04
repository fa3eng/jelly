---
change: JELLY-0
stage: plan
status: draft
owner: Jelly 规划师
baseline: <origin/develop 提交 SHA>
inputs:
  - docs/changes/JELLY-0-example/intent.md
  - docs/changes/JELLY-0-example/spec.md
confirmed: []
supersedes: null
---

# 实现计划：<一句话标题>

> 本文件由「规划中」阶段维护。每个步骤必须能独立验证；测试计划在编码前定好。

## 基线

- 代码基线：`origin/develop` @ `<sha>`
- 相关分支/Worktree：
- 已知并行任务：

## 步骤

| # | 目标行为 | 涉及模块/文件 | 依赖 | 验证方式 | 完成信号 |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  | — |  |  |
| 2 |  |  | 1 |  |  |

## 风险与应对

| 风险 | 影响 | 应对 | 负责人 |
| --- | --- | --- | --- |
| 数据迁移/旧会话兼容 |  |  |  |
| Obsidian 宿主版本/选区/侧栏 |  |  |  |
| 流式/中断/恢复 |  |  |  |
| 并行任务文件冲突 |  |  |  |

## 测试计划

### Vitest

- [ ] 用例：
- 命令：`pnpm test` / `vitest run <path>`

### 真实 Obsidian E2E

- [ ] 关键路径：
- 隔离测试 Vault：
- 候选工具：`wdio-obsidian-service`（先评估可运行性与成本）

### Agent 行为评测

- [ ] 工具选择 / 引用依据 / 约束遵循：
- 与固定模型响应的链路测试分开标注：

### 手工验收

- [ ] 步骤：

## 执行顺序与拆分

- 顺序：
- 可并行子任务（如有）：
- 子 issue 建议（不自行创建）：

## 本轮不做

- 

## 执行记录

> 开发阶段逐条补充：完成 / 偏离 / 新增工作 / 实际验证结果。

## 交接

- 下一阶段：开发中（Codex）
- 进入条件：用户确认顺序、风险与验证安排
- 开发入口：`docs/changes/<id>/`、相关代码路径
