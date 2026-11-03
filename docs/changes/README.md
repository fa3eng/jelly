# 单次改动材料（docs/changes）

本目录保存**每个需求一份**的阶段材料，与 Multica issue 一一对应；材料随任务分支提交进仓库，不只在 issue 附件里。它回答"这次改什么、为什么、怎么验证"，而不是"系统现在长什么样"——后者见 [`docs/architecture/`](../architecture/README.md)。

## 目录约定

```
docs/changes/<issue-identifier>-<slug>/
  intent.md        PRD（产品设计师：需求 + 原型）
  spec.md          方案（架构师）
  plan.md          实现计划（规划师）
  verification.md  验证与审查（审查者）
```

- 使用 Multica issue 编号，例如 `JELLY-12-pr4-selection-quote`。
- 同一需求的所有阶段**复用同一目录**，不按阶段另建目录。
- 新目录从 [`_template/`](./_template/) 复制，不临时改字段。
- 目录名在需求存续期间保持不变；需求取消时保留材料并注明状态。

## 阶段与责任人

| 阶段 | 状态（Multica 工作流列） | 责任人 | 产物 | 退出条件 |
| --- | --- | --- | --- | --- |
| 需求与设计 | 需求整理 | 产品设计师 | `intent.md` PRD + Paper 原型 | 用户确认问题、范围、交互与原型 |
| 架构方案 | 架构方案 | 架构师 | `spec.md`、ADR 提案 | 备选方案、兼容与测试策略完整 |
| 方案确认 | 方案待确认 | 人 | — | 用户确认交互与重大架构选择 |
| 实现规划 | 规划中 | 规划师 | `plan.md` | 步骤可独立验证 |
| 计划确认 | 计划待确认 | 人 | — | 用户确认顺序、风险与验证安排 |
| 开发 | 开发中 | 开发者（Codex） | 代码、测试、架构文档、PR | 检查通过，偏离已处理 |
| 独立验证 | 验证与审查 | 审查者 | `verification.md` | 验收条件有证据，阻塞已解决 |
| 人工验收 | 待人工验收 | 人 | — | 真实 Obsidian 宿主体验通过 |
| 完成 | 完成 | — | — | PR 合入 `develop` |

## PRD 写法

`intent.md` 就是 PRD。用 `ruanyifeng-writing` 的单线结构写：一篇只讲一件事，短句短段，小点展开。每个关键流程/状态配 Mermaid 图或 Paper 原型，图前说看什么，图后说所以怎么定。不要写代码核对记录、基线缺口、工具细节；这些不进 PRD。

产品经理与设计师已合并为「Jelly 产品设计师」：PRD 和原型在同一次「需求整理」里交付，人工确认后再进架构方案。

## 入库

- 每个阶段把产物提交到任务分支 `codex/<task>`，PR 里带上 `docs/changes/<id>/`。
- 下一个阶段 checkout 同一分支读文件，不依赖聊天或 issue 附件。
- 仓库是公开的，PRD、设计细节、验收标准会随 PR 公开；敏感需求另用私有存储。
- 教程、历史计划、旧决策草稿不进本目录，也不进产品仓库。

## 版本与确认

每份材料顶部 frontmatter 至少记录：

```yaml
change: JELLY-12
stage: intent            # intent | spec | plan | verification
status: draft            # draft | in-review | approved | superseded
owner: Jelly 产品设计师
baseline: <origin/develop 或 PR HEAD 的提交 SHA>
inputs: []
confirmed: []            # 只记录用户真实确认的决定、日期与来源
supersedes: null
```

规则：

- **只有用户能批准。** Agent 不得把 `status` 写成 `approved`；`in-review` 表示等待用户确认。
- 用户确认来源可以是 issue 评论、聊天记录摘要或直接移动状态；写进 `confirmed` 并注明日期。
- 基线变化若影响结论，先更新材料再继续。
- 上游 `spec.md` 实质变化时，下游 `plan.md` / `verification.md` 标 `in-review` 或 `superseded`，写明需要重新评估的部分。
- 实现中改变产品行为、数据格式或关键边界：回到「方案待确认」，不先写后补。

## 与 PR 的关联

- 开发 PR 描述必须包含：关联 issue（`JELLY-xx`）、`docs/changes/<id>/` 路径、验证命令与结果、风险/回滚。
- PR 默认指向 `develop`；分支与发版规则见 [分支管理与发版约定](../development-workflow.md)。
- PR 同时更新受影响的架构文档；没有结构变化时在描述里写一句理由。
- 合并前由审查者独立验证；合并后由维护者集中做真实宿主验证。

## 检查清单

进入下一阶段前自检：

- [ ] frontmatter 完整，`baseline` 是当前提交。
- [ ] 本阶段结论、未决问题、风险都写了。
- [ ] 已确认决定有来源与日期，没有把 Agent 推断写成用户批准。
- [ ] 验证项写明"已执行/未执行"，没有把计划写成结果。
- [ ] 下一阶段需要的文件与代码入口已列出。
