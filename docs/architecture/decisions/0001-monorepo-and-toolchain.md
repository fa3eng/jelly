# 0001：Monorepo 与工具链

状态：已采用

## 背景

Aula 包含 Obsidian 插件、本地 Agent Service、React UI、Agent Runtime 和共享契约。模块需要独立维护边界，并在同一仓库中协同构建和验证。

## 决策

- 使用 pnpm workspace 管理 `apps/*` 和 `packages/*`。
- 使用 Vite+ 提供构建、格式化、Lint 和类型检查；使用 Vitest 执行测试。
- 使用 TypeScript 和 ESM 编写源码；Obsidian 插件输出 CommonJS `main.js`。
- Agent Service 输出独立的 ESM 文件 `agent-service.mjs`，开发与生产均使用 Node。
- React UI 使用 Obsidian CSS 变量适配宿主外观。
- Obsidian API 只进入宿主适配层，Runtime、UI 和领域契约保持宿主无关。

## 影响

共享契约和依赖由 workspace 统一管理。插件构建前先构建 Service，再将服务产物复制到插件输出目录。开发构建写入专用测试 Vault，生产构建写入 `dist`。

独立服务需要处理子进程生命周期、Node 定位和额外文件分发。目前提供手动复制完整构建目录的安装方式；标准社区安装包仍需适配。

实际依赖版本以各 package.json 和 pnpm-lock.yaml 为准。当前模块关系见 [架构说明](../current-runtime.md)。
