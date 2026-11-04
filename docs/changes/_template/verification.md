---
change: JELLY-0
stage: verification
status: draft
owner: Jelly 审查者
baseline: <PR HEAD SHA>
inputs:
  - docs/changes/JELLY-0-example/intent.md
  - docs/changes/JELLY-0-example/spec.md
  - docs/changes/JELLY-0-example/plan.md
  - <PR 链接>
confirmed: []
supersedes: null
---

# 验证与审查：<一句话标题>

> 本文件由「验证与审查」阶段维护。只写实际执行过的验证；未运行的明确标注。

## 范围

- PR：
- 代码 SHA：
- 目标分支：`develop`
- 基线 `origin/develop`：

## 验收条件 → 证据

| # | 验收条件（来自 Intent/Spec） | 证据（测试/命令/手工） | 结果（通过/失败/未验证） |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |

## 审查发现

| 级别 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 阻塞 |  |  |  |  |
| 重要 |  |  |  |  |
| 建议 |  |  |  |  |

## 实际执行

| 命令 | 环境 | 结果 | 备注 |
| --- | --- | --- | --- |
| `pnpm check` |  |  |  |
| `pnpm test` |  |  |  |
| `pnpm build` |  |  |  |

- 真实 Obsidian 手工验证：
- 未运行项及原因：

## 兼容与回归

- 旧会话/旧 JSONL：
- 未知字段/旧读取器：
- 并行任务冲突：

## 未覆盖与剩余风险

- 

## 结论

- [ ] 可进入人工验收
- [ ] 需要返工（列出阻塞项）

## 交接

- 通过：移到「待人工验收」，等待用户在真实宿主验收
- 返工：移回「开发中」，附可复现失败与期望
