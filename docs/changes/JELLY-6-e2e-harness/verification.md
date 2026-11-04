---
change: JELLY-6
stage: verification
status: in-review
owner: Jelly 审查者
baseline: 2a3392a9f65c0031a075b20d5af659bd12095e53
inputs:
  - JELLY-6 issue 正文（本期范围与验收）
  - issue 评论 01a1a50a-0e20-71f9-bc02-fef4f9a474d8（人工确认先做 L1）
  - docs/changes/JELLY-6-e2e-harness/plan.md
  - PR #7（https://github.com/fa3eng/jelly/pull/7）
confirmed:
  - decision: 先推进 L1；L2 在当前机器探索、后续迁到 Mac mini，不作为本轮 L1 的交付前提
    by: 方阿森
    at: 2026-11-04
    source: issue 评论 01a1a50a-0e20-71f9-bc02-fef4f9a474d8
supersedes: null
---

# 验证与审查：L1 命令可用，但取消场景约 3.8% 概率挂起 60 秒

> 本文件由「验证与审查」阶段维护。只写实际执行过的验证；未运行的明确标注。任务按用户确认走轻量流程，验收依据是 JELLY-6 正文，没有 intent/spec 可对照。

## 范围

- PR：[#7](https://github.com/fa3eng/jelly/pull/7)，`codex/e2e-harness` → `develop`，状态 OPEN、MERGEABLE。
- 代码 SHA：`7707fb2c40be857c160e6dbb98cd29f6e3f28937`（两个提交：`dd7a0b3` 测试与文档，`7707fb2` 仅 plan.md 证据）。
- 基线 `origin/develop`：`2a3392a9f65c0031a075b20d5af659bd12095e53`，审查时 GitHub 上 develop 仍停在该提交。
- diff：8 个文件、+552/−6，全部在 `apps/obsidian-plugin/e2e/`、`docs/`、`.gitignore`、根 `package.json`。没有产品源码、依赖或锁文件、CI、技能、模板改动。

## 验收条件 → 证据

| # | 验收条件（来自 JELLY-6 正文） | 证据 | 结果 |
| --- | --- | --- | --- |
| 1 | 干净 checkout 按文档执行 `pnpm install && pnpm build && pnpm test:e2e`，无真实模型 Key 跑通 | 用 `git archive` 导出 SHA 7707fb2 到无 `.git` 的空目录，按文档执行三遍，全部跑通；不需要 Obsidian、不需要真实 Key | 通过 |
| 2 | 连续 3 次通过，记录耗时、flaky 情况、环境 | 能连续通过，单次墙钟 1.24–1.31 s；但独立重复 106 次有 4 次失败（3.8%），全部卡在同一取消用例 | 失败：稳定性证据不成立 |
| 3 | 失败时能定位（日志 / 截图 / trace），退出码正确 | 退出码为 1；人为改坏断言时 TAP 直接给出实际/期望；但本次 flake 只得到 `test timed out after 60000ms`，需额外埋点才能定位到取消用例内 | 部分失败：该失败模式不可定位 |
| 4 | PR 带实际运行记录 | 附件 `acceptance.json` 与 `plan.md` 的耗时表一致；三次 e2e 日志、trace、合成 Vault 都在；我本地复跑的数字接近 | 通过 |
| 5 | 文档写清前置、命令、隔离 Vault、mock、已知限制、CI 结论 | `docs/development-workflow.md` 新增 L1 一节与 L2/CI 边界，`docs/architecture/current-runtime.md` 补测试边界；内容基本准确，但「RPC 和测试均有超时」这句与实测不符 | 部分通过（见重要 1） |
| 6 | 真实宿主：wdio-obsidian-service 或 Playwright/CDP 跑通，打开侧栏 | 未完成。只做了 CDP 探测：进程能启动、`/json/list` 有 `app://obsidian.md/index.html`；Vault 打开、插件加载、侧栏、模型设置均未验证。依用户 2026-11-04 确认不阻塞 L1 | 未验证（用户已同意后置） |
| 7 | 测试配置注入：优先设置页 UI；测试专用 env 不得在生产生效 | 未新增任何注入面，只复用 Service 既有的 `JELLY_*`、`OPENAI_*` 环境变量；无产品代码改动，生产构建没有新增开关 | 通过（L1 层） |
| 8 | 假模型覆盖普通流式、读/写工具、错误或中断 | `support/model.ts` 覆盖流式两块增量、分片工具参数、读/写文档、工具失败、HTTP 503、挂起（hold）；协议断言失败会在 `harness.close()` 里被断言出来 | 通过 |
| 9 | 最小链路：隔离 Vault → 消息 → 流式 → 工具读/写 → JSONL → 重启后恢复 | 隔离 Vault、真实 HTTP/oRPC、JSONL 落盘、服务重启恢复与崩溃 interrupted 都验证了；重启的是 Service，不是 Obsidian | 部分通过（L1 名义范围内符合文档声明） |
| 10 | `pnpm test:e2e` 可重复、失败非 0 退出、日志/trace 写 gitignored 目录 | 退出码与产物目录符合；可重复性被下面的阻塞问题破坏 | 部分失败 |
| 11 | CI 可行性只给结论 | 结论已写：L1 无图形依赖、可作 Linux PR CI 候选；L2 不进 PR 门禁；macOS runner 未实测 | 通过 |

## 审查发现

| 级别 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 阻塞 | `apps/obsidian-plugin/e2e/service.e2e.ts:77-97`（卡在 `:89`）、`apps/obsidian-plugin/e2e/support/harness.ts:68` | 取消用例间歇性挂起：手工触发 abort 后的第二次 `stream.next()` 迟迟不落定，直到测试框架 60 s 超时才结束。106 次完整 `pnpm test:e2e` 里失败 4 次（3.8%）；失败 run 的 artifact 里最后一条都是 `hold` 的 `run-started`，没有 `run-finished`，说明取消从未到达 Service。abort 后单测里的 10 s 单次 fetch 超时也没有结束挂起。 | 该命令现在是 Phase 2 候选门禁，约每 27 次跑一次红、且要等 60 s；同时失败信息只有一句 timeout，无法排查。生产端 `apps/obsidian-plugin/src/chat-view/use-chat.ts:235` 用的是同一套 AbortController + oRPC 流式取消写法，不能排除真实「停止」也会卡住。 | 把取消路径做成确定性的：给每次 `next()` / `return()` 和 `waitFor` 明确的上限，超时即失败并打印当前 run 状态、abort 状态和最后一次事件；定位 abort 与 oRPC 事件迭代器读之间的竞争。修好后至少连续 100 次全绿再交回验证。 |
| 重要 | `docs/development-workflow.md:63` | 文档写「就绪等待、RPC 和测试均有超时」，但实测取消用例会一直挂到 60 s 测试超时，单次 fetch 的 10 s 超时没有兜住。 | 读者会以为失败最多 10 s 内出现，实际 CI 上会白等 60 s，且错误信息没有指向。 | 与阻塞项一起修：要么让超时真的生效，要么把文档改成实际行为并写清如何定位。 |
| 建议 | `docs/changes/JELLY-6-e2e-harness/plan.md:35` | 安装耗时 1.203 s 是热 pnpm store 的结果；我在同样「干净 checkout」里首次安装下载了 209 个包、耗时 21.1 s。 | 别人按记录预期几秒装完，容易误判环境问题。 | 在验证记录里注明「需网络、首次安装耗时取决于 store 是否预热」。 |
| 建议 | `apps/obsidian-plugin/e2e/support/harness.ts`（`close()` 与失败路径） | 失败时 `t.after` 会停服务、保留 artifact，方向正确；但当前 artifact 对「取消没生效」这种失败没有直接线索。 | 排查要先读 JSONL 才能发现 run 没结束。 | 失败时在 artifact 里额外写一段状态快照（最后一轮 run 状态、abort 是否触发、最后一次事件），并在 TAP 里输出。 |

## 实际执行

环境：macOS 26.6.2（25G83）/ arm64，Node 20.19.6，pnpm 10.25.0，本机无真实模型 Key。

| 命令 | 环境 | 结果 | 备注 |
| --- | --- | --- | --- |
| `pnpm install --frozen-lockfile` | 干净 `git archive` 树 | 通过 | 首次下载 209 个包，21.1 s；pnpm 提示忽略 `esbuild` 构建脚本，不影响后续步骤 |
| `pnpm build` | 干净树 | 通过 | 2.49–2.79 s |
| `pnpm check` | 干净树 | 通过 | 103 个文件格式、75 个文件 lint/类型；e2e 文件在 `tsconfig.json` 的 `apps/**/*.ts` 内，会被类型检查 |
| `pnpm test` | 干净树 | 通过 | 19 个文件、110 项测试 |
| `pnpm test:e2e` | 干净树 + 工作 checkout（SHA 7707fb2） | 106 次中 102 次通过、4 次失败 | 单次 1.24–1.31 s；失败全部 60 s 超时，另外 3 条后续用例因服务被清理而报 `fetch failed` |
| 负向验证：改坏首个流式断言 | 工作 checkout | 退出码 1 | TAP 给出 actual/expected 明细；恢复后 `git show HEAD:file \| diff -` 确认与 HEAD 完全一致 |
| 负向验证：删掉 `apps/agent-service/dist/agent-service.mjs` | 工作 checkout | 退出码 1 | 报 `Built service missing; run pnpm build first`，信息准确 |
| 定位实验：在取消用例里加同步打点 | 一次性副本（不提交） | 120 次中 2 次挂起 | 两次都停在 `controller.abort()` 之后、`await assert.rejects(() => stream.next())` 之内；第二次 next 在测试超时后的约 62.5 s 才落定 |
| 定位实验：裸 fetch + `TextDecoderStream` 复现 abort | 一次性脚本（不提交） | 600 次无挂起 | 说明原生 fetch abort 正常，问题在 oRPC 客户端事件迭代器这一层；在 fetch 包装里加日志后 80 次全绿，属窄窗口竞争 |

复现方式（约 1/27 命中，单次失败要等 60 s）：

```sh
git archive 7707fb2 | tar -x -C /tmp/jelly-clean && cd /tmp/jelly-clean
pnpm install --frozen-lockfile && pnpm build
for i in $(seq 1 60); do pnpm test:e2e || echo "FAILED run $i"; done
```

失败的 artifact 在 `.e2e-artifacts/l1-*/`：`service-N.log`、`trace.jsonl`、`vault/.jelly/sessions/*.jsonl` 都在，`hold` 轮次没有 `run-finished`，进程直到测试收尾才被 SIGKILL。这一点与「取消没有到达 Service」一致。

## 兼容与回归

- 旧会话 / 旧 JSONL：本 PR 没改持久化格式；测试只读自己生成的 JSONL，重启恢复用例断言读取结果与重启前一致，没做旧版本数据回归，也没有迁移需求。
- 未知字段：未涉及；测试没有构造旧版本或未知事件的 JSONL。
- 并行任务冲突：每次运行独立 Vault、独立端口、独立随机令牌；端口分配与监听之间仍有竞争窗口，文档已写明。审查期间约 20 次运行没遇到端口冲突。
- 产品行为：无改动。测试注入只用到 Service 既有环境变量，没有新增生产开关。

## 未覆盖与剩余风险

- L2 真实宿主未验证：Obsidian 只是被隔离配置启动、CDP 能看到应用页；Vault 打开、插件加载、侧栏、设置页写配置、SecretStorage 都没有证据。后续在 Mac mini 上继续，属已知后置项。
- 未验证「重启 Obsidian 后恢复」；只验证了 Service 重启，文档已明确区分。
- L1 没有截图或浏览器 trace（无图形界面），失败排查依赖服务日志、协议 trace、JSONL。
- Linux/macOS CI 未实跑，macOS runner 的下载、显示会话、耗时与费用没有数据，不能据此报预算或承诺稳定性。
- 取消路径的 flake 说明该用例本身也是「取消行为」的证据里最弱的一环；修好之前不能把它当取消行为的稳定回归。
- 并发跑两份 checkout 时的端口竞争窗口未测。

## 结论

- [x] 需要返工（阻塞项：取消用例约 3.8% 概率挂起 60 s，且失败不可定位）
- [ ] 可进入人工验收

## 交接

- 移回「开发中」。请先让取消路径有确定上限并输出可定位信息，再按上面的复现方式连续跑 ≥100 次 `pnpm test:e2e` 全绿，然后重新交「验证与审查」。
- L2 与逐用户机验证不阻塞本轮，但要在后续 issue 里保留。
