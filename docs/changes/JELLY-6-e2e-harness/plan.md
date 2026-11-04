---
change: JELLY-6
stage: plan
status: in-review
owner: Jelly 开发者
baseline: 2a3392a9f65c0031a075b20d5af659bd12095e53
inputs:
  - JELLY-6 issue description
  - JELLY-7 parent issue description
confirmed:
  - decision: 先推进 L1；L2 在当前机器探索，后续考虑 Mac mini
    by: 方阿森
    at: 2026-11-04
    source: issue comment 01a1a50a-0e20-71f9-bc02-fef4f9a474d8
supersedes: null
---

本文件记录轻量任务的实施与证据，不补造已经批准的 intent/spec/plan。实施依据为 issue 正文与上面的人工确认。

## 实施记录

1. 使用已有 Node test runner、tsx 与 oRPC 客户端库，不引入新测试框架或生产注入开关。
2. 启动构建后的真实服务；每次建立独立 Vault、模型服务、令牌和端口，隔离开发者环境与 `.env`。
3. 覆盖流式、读写工具、工具失败、模型失败、取消、重启续聊与崩溃恢复。日志、协议 trace 和 JSONL 保留用于排查。
4. 更新开发命令、架构测试边界与 CI 结论。本期不修改 CI、技能或模板。

与原 issue 的差异：依人工确认，L1 先交付；L2 非本轮完成前提。没有产品行为或持久化格式变化。

## 验证记录

2026-11-04，macOS 26.6.2 / arm64，Node 20.19.6，pnpm 10.25.0。在提交 `dd7a0b3` 的独立干净 Worktree 中执行，未使用真实模型 Key：

| 命令                             | 结果                              | 墙钟耗时（含 pnpm 启动） |
| -------------------------------- | --------------------------------- | ------------------------ |
| `pnpm install --frozen-lockfile` | 通过，使用本机依赖缓存            | 1.203 s                  |
| `pnpm build`                     | 通过，构建服务及插件              | 2.525 s                  |
| `pnpm check`                     | 通过，无格式、lint、类型错误      | 2.715 s                  |
| `pnpm test`                      | 19 个文件、110 项测试通过         | 3.561 s                  |
| `pnpm test:e2e` 第 1 次          | 7 个场景通过，TAP 含父节点共 8 项 | 1.257 s                  |
| `pnpm test:e2e` 第 2 次          | 同上                              | 1.253 s                  |
| `pnpm test:e2e` 第 3 次          | 同上                              | 1.229 s                  |

三次顺序执行，无重试、无失败；这只是本次样本，不代表长期 flaky 率为零。报告和计时见交接评论附件中的 `acceptance.json`、各命令日志及每次隔离 Vault 的协议 trace。

另在开发 Worktree 中临时将首个流式断言的预期文字改坏：`pnpm test:e2e` 返回 1，1.227 s 内结束；之后恢复断言并重新运行通过。原始失败报告为 `intentional-failure.tap`。检查初次发现新增文件格式及两处类型/lint 问题，修正后检查通过；本轮未改产品代码。

## L2 探索

当前机器存在 `/Applications/Obsidian.app`，安装程序版本 1.13.7。npm 查询 `wdio-obsidian-service@3.5.0` 的 Node 要求为 >=18.20.0，当前环境满足；已阅读该版本 README 的独立 Vault、插件和 app/installer 配置。未安装 WDIO 到项目，未将静态前置核对当作宿主 E2E 通过。

已进行一次隔离宿主启动探测：为安装的 Obsidian 分配独立 user-data-dir、合成 Vault 注册配置和动态调试端口，通过 `/json/list` 发现 `app://obsidian.md/index.html` 页面，随后终止本次启动的进程组并等待退出。原始结果与启动日志保存在 `.e2e-artifacts/l2-probe-tv3ynvfw/`。启动日志提示缺少该临时 profile 的 `jellyprobe.json`，自动更新请求也失败；简单写入 Vault 注册配置尚不足以验证 Vault 打开。

这只证明该安装可在隔离配置下启动并暴露 CDP 页面；没有验证 Vault 打开、插件加载、侧栏、模型设置或 SecretStorage。未执行 WDIO 或 Playwright 测试。后续用 launcher 管理完整 profile，而不是继续依赖这次临时注册方式。

Mac mini 接入后仍需固定宿主版本，验证设置页和 SecretStorage，再决定专用机器与按需 macOS CI 的分工。GitHub Actions 的实际耗时、费用和稳定性本期未测。

## 审查入口

阅读 `apps/obsidian-plugin/e2e/service.e2e.ts`、`support/harness.ts` 与 `support/model.ts`，按 `docs/development-workflow.md` 复现。审查者需区分服务恢复与 Obsidian 宿主恢复，并在后续 `verification.md` 记录独立验证。
