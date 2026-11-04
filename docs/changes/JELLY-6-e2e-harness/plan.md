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

待最终检查后填写实际结果。环境：macOS / arm64，Node 20.19.6，pnpm 10.25.0。

## L2 探索

当前机器存在 `/Applications/Obsidian.app`，安装程序版本 1.13.7。npm 查询 `wdio-obsidian-service@3.5.0` 的 Node 要求为 >=18.20.0，当前环境满足；已阅读该版本 README 的独立 Vault、插件和 app/installer 配置。未安装 WDIO 到项目，未将静态前置核对当作宿主 E2E 通过。

已进行一次隔离宿主启动探测：为安装的 Obsidian 分配独立 user-data-dir、合成 Vault 注册配置和动态调试端口，通过 `/json/list` 发现 `app://obsidian.md/index.html` 页面，随后终止本次启动的进程组并等待退出。原始结果与启动日志保存在 `.e2e-artifacts/l2-probe-tv3ynvfw/`。这只证明该安装可在隔离配置下启动并暴露 CDP 页面；没有验证 Vault 打开、插件加载、侧栏、模型设置或 SecretStorage。未执行 WDIO 或 Playwright 测试。

Mac mini 接入后仍需固定宿主版本，验证设置页和 SecretStorage，再决定专用机器与按需 macOS CI 的分工。GitHub Actions 的实际耗时、费用和稳定性本期未测。

## 审查入口

阅读 `apps/obsidian-plugin/e2e/service.e2e.ts`、`support/harness.ts` 与 `support/model.ts`，按 `docs/development-workflow.md` 复现。审查者需区分服务恢复与 Obsidian 宿主恢复，并在后续 `verification.md` 记录独立验证。
