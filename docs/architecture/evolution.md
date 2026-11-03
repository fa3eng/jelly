# 架构演进记录

本文件记录**重要结构变化**，不替代 [`current-runtime.md`](./current-runtime.md) 的当前状态描述。规则见 [`README.md`](./README.md)。

## 记录格式

```markdown
## YYYY-MM-DD · <变化标题>

- 之前：<旧结构/行为>
- 之后：<新结构/行为>
- 原因：<问题或目标>
- 关联需求：`docs/changes/JELLY-xx/`
- ADR：`docs/architecture/decisions/NNNN-*.md`
- PR / 合入提交：<链接> / `<sha>`
- 状态：已落地 | 已接受未实现 | 仍在提议
- 影响与迁移：<旧数据、旧客户端、回滚>
```

## 记录

## 2026-11-04 · 文档分层与单次改动入库

- 之前：`docs/` 采用白名单，只有少数文档入库；每个需求的 PRD/Spec 只留在本地或 issue 附件，下一阶段在 `develop` 看不到。
- 之后：当前架构、ADR、产品边界和 `docs/changes/<id>/` 分层；PRD/Spec/Plan/Verification 随任务分支入库、随 PR review；教程、历史计划和旧决策草稿移到仓库外备份。
- 原因：跨阶段交接依赖聊天和附件，PR 缺少需求上下文；历史教程和当前架构混在一起。
- 关联需求：`docs/changes/JELLY-5-session-delete-and-ui/`
- ADR：`docs/architecture/decisions/0003-product-boundaries-and-docs.md`
- PR / 合入提交：PR #5
- 状态：已落地（文档规则）；代码未变
- 影响与迁移：仓库公开范围扩大到产品文档；敏感需求需要私有存储。旧教程已备份到仓库外，不参与构建。
