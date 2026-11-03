# 单次改动材料（docs/changes）

本目录保存**每个需求一份**的阶段材料，与 Multica issue 一一对应。它回答"这次改什么、为什么、怎么验证"，而不是"系统现在长什么样"——后者见 [`docs/architecture/`](../architecture/README.md)。

## 目录约定

```
docs/changes/<issue-identifier>-<slug>/
  intent.md        需求整理（产品经理）
  spec.md          方案与设计（设计师 + 架构师）
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
| 需求整理 | 需求整理 | 产品经理 | `intent.md` | 用户确认问题、目标与范围 |
| 交互设计 | 设计中 | 设计师 | `spec.md` 交互部分 + Paper 稿 | 状态覆盖完整，交互可确认 |
| 架构方案 | 架构方案 | 架构师 | `spec.md`、ADR 提案 | 备选方案、兼容与测试策略完整 |
| 方案确认 | 方案待确认 | 人 | — | 用户确认交互与重大架构选择 |
| 实现规划 | 规划中 | 规划师 | `plan.md` | 步骤可独立验证 |
| 计划确认 | 计划待确认 | 人 | — | 用户确认顺序、风险与验证安排 |
| 开发 | 开发中 | 开发者（Codex） | 代码、测试、架构文档、PR | 检查通过，偏离已处理 |
| 独立验证 | 验证与审查 | 审查者 | `verification.md` | 验收条件有证据，阻塞已解决 |
| 人工验收 | 待人工验收 | 人 | — | 真实 Obsidian 宿主体验通过 |
| 完成 | 完成 | — | — | PR 合入 `develop` |

## 版本与确认

每份材料顶部 frontmatter 至少记录：

```yaml
change: JELLY-12
stage: intent            # intent | spec | plan | verification
status: draft            # draft | in-review | approved | superseded
owner: Jelly 产品经理
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
