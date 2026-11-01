# 分支管理与发版约定

本项目采用 `develop` 集成验证、`main` 保持稳定、Tag 标记正式版本的流程。暂不维护长期 `release` 分支。

```mermaid
flowchart TD
    D[develop 开发基线] --> A[Worktree A / 任务分支]
    D --> B[Worktree B / 任务分支]
    A -->|独立 PR 与 Review| I[合回 develop]
    B -->|独立 PR 与 Review| I
    I --> V[构建安装包并整体验证]
    V -->|修复后重新验证| I
    V -->|维护者验证通过| M[普通 Merge 到 main]
    M --> T[从 main 打版本 Tag]
    T --> R[自动构建 Draft Release]
```

## 分支职责

| 分支或标记 | 用途 | 进入条件 |
| --- | --- | --- |
| `codex/<任务名>` | 单个任务的开发与 Review | 允许未完成，未完成时使用 Draft PR |
| `develop` | 多任务集成、构建验证包、集中手动验证 | 单任务已 Review，相关检查通过；允许尚未充分验证，不合入已知基本功能不可用的代码 |
| `main` | 已经过维护者整体验证的稳定代码 | 从 `develop` 晋级，或经过验证的紧急修复 |
| `0.1.5` 等版本 Tag | 标记正式版本的确定提交 | 提交位于 `main`，版本与 manifest 一致，不带 `v` |

GitHub 仓库默认分支为 `develop`，新建 PR 默认指向它。`main` 是稳定分支，不要求每次晋级立即发版。

## 日常开发与 PR

1. 从最新的 `origin/develop` 创建任务分支。并行任务各自使用一个分支和 Worktree；同一 Worktree 可在任务结束后复用。
2. 每个任务独立提交 PR、Review，不把多个无关任务混在一个 PR 中。
3. 合入前完成 Review，运行 `pnpm check`、相关测试和 `pnpm build`；需要完整回归时运行 `pnpm test`。未完成或已知不可用的任务继续留在任务分支。
4. 常规任务 PR 合入 `develop`。任务 PR 可按需要 Squash，保留一个清晰的任务提交。
5. 已有分支可以继续使用；提交 PR 前检查 base，必要时先合入最新 `origin/develop`，解决冲突并重新检查。

```sh
git fetch origin
git switch -c codex/my-task origin/develop
# 开发、检查并提交后
git push -u origin codex/my-task
gh pr create --base develop
```

以上为当前 checkout 开分支的示例；并行开发时在各自 Worktree 内操作。显式指定 `--base develop`，避免工具缓存或个人配置导致 PR 指向错误分支。

## 集中验证与晋级 main

- 开始一轮整体验证时暂停向 `develop` 合入新功能；其他 Worktree 可继续开发。验证期间只合入必要修复。
- 如准备发版，先在 `develop` 更新 `manifest.json`、根 `package.json`、`versions.json` 和 `docs/release-notes.md`；依赖变更时更新许可证声明。
- 在 GitHub Actions 的 **Prepare release → Run workflow** 中选择 `develop`，下载该次运行的 `jelly-release` artifact。也可在本地运行以下命令：

```sh
pnpm check
pnpm test
pnpm build:verify
pnpm release:prepare
```

- 在测试 Vault 中安装 `dist/release/` 的 ZIP，验证真实 Obsidian 中的启动、设置、模型对话、会话恢复及本轮变更涉及的功能。涉及文件写入时使用测试资料。
- 记录已验证的提交 SHA、环境和结果；验证后如有新提交，需要重新验证受影响的功能。自动化检查通过不能代替维护者的真实宿主验证。
- 验证通过后创建 `develop → main` 的晋级 PR，并在 PR 中记录验证结果。使用普通 **Create a merge commit** 合并，不使用 Squash 或 Rebase，保持两个长期分支的共同历史。
- 合并后 `main` 的文件内容应与已验证的 `develop` 一致；如晋级时发生冲突或需要改动，先将 `main` 同步到 `develop` 并重新验证，不在晋级时临时修代码。
- 晋级完成后恢复新功能集成。若以后需要验证当前版本的同时持续集成下一版，再考虑临时 `release/*` 分支。

## Tag 发版

只从已验证的 `main` 提交创建正式 Tag。Tag 只标记版本，不用来承载继续开发的改动；已发布 Tag 不移动、不覆盖，修复通过新版本发布。

以版本 `0.1.5` 为例，先确认晋级 PR 已合并、版本文件与发布说明正确，再执行：

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
git status --short
git log -1 --oneline
# 确认工作区干净，且 HEAD 是本次经过验证的提交
git tag -a 0.1.5 -m 'Jelly 0.1.5'
git push origin 0.1.5
```

推送 Tag 后，现有 `release.yml` 会检查、构建、校验版本与 Tag 一致，并创建 **Draft Release**。检查该次产物与草稿说明后，由维护者手动发布。GitHub Actions 手动选择 `develop` 运行只上传验证产物，不创建正式 Release。

现有工作流会响应匹配的版本 Tag，但不会自动限制该 Tag 必须来自 `main`；发版时必须检查目标提交。本约定不自动执行发版，也不自动向 Obsidian 社区目录提交。

## 紧急修复

当 `develop` 尚未稳定、已发布版本需要紧急修复时，从最新 `origin/main` 创建修复分支，单独 Review、验证后 PR 到 `main`，再按上述流程发布新 Tag。随后通过 PR 将 `main` 的修复同步回 `develop`，使用普通 Merge，避免后续版本遗漏修复。
