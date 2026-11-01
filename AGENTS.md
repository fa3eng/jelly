# 项目协作约定

- 开始任务前阅读 [分支管理与发版约定](docs/development-workflow.md)。
- 常规任务从最新的 `origin/develop` 创建 `codex/<任务名>` 分支；并行任务使用各自的分支和 Worktree。
- 常规任务 PR 默认以 `develop` 为目标；使用 CLI 时显式指定 `gh pr create --base develop`。
- 单个任务完成 Review 和基本检查后合入 `develop`，再在 `develop` 上集中进行安装包与真实宿主验证。
- 只有经过维护者整体验证的代码才能从 `develop` 合入 `main`；该 PR 使用普通 Merge，禁止 Squash 或 Rebase 合并两个长期分支。
- 正式版本只从经过验证的 `main` 提交打 Tag，版本号不带 `v`。未经用户要求，不执行稳定分支晋级、打 Tag 或发布 Release。
- 从 `main` 发出的紧急修复需要同步回 `develop`。
