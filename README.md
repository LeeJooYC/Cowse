# Cowse · 牛马

基于 Cline Core 的 macOS AI 桌面助手。Cowse 提供中文界面与桌面交互，Cline Core 负责会话、模型调用、工具执行和上下文管理。

这是 Cowse 当前版本的独立源码目录，不包含早期独立运行时、其他桌面示例、VS Code 插件源码、本地依赖、用户数据或编译产物。

## 功能

- 多供应商与 OpenAI Compatible 接入，支持本地模型服务。
- 流式会话、思考展示、上下文预算与压缩状态提示。
- 规划 / 执行模式，以及按能力配置的自动允许选项。
- 文件、命令、网页和 MCP 工具，技能与扩展管理。
- 计划任务、会话搜索、主题设置与代理配置。

具体模型、推理、图像和内置搜索能力取决于供应商；上下文预算不能扩大后端真实容量。

## 目录

```text
apps/examples/cowse-app/  牛马界面、Bun 后台、Tauri 原生外壳
sdk/packages/             Cline Core 与依赖的共享、模型、智能体、UI、SDK 包
apps/cli/                 Cline CLI 与连接器所需源码
apps/cline-hub/           CLI 依赖的 Hub 管理界面与服务适配
patches/                  依赖补丁
```

保留现有相对目录结构，以免破坏工作区依赖和构建入口。开发主入口是 `apps/examples/cowse-app`，不是旧的 `desktop-app` 示例。

## 本地开发

需要 macOS、Bun **1.3.13**、Node.js **22 或更新版本**、支持 Rust edition 2024 的 Rust 工具链，以及 Xcode Command Line Tools。不要混用 npm/yarn/pnpm。

在仓库根目录执行：

```sh
bun install --frozen-lockfile
bun run build:sdk
bun run dev
```

只开发浏览器界面和后台时，可用 `bun run dev:headless`。默认使用本机 3125 / 3126 端口。首次安装或构建可能需要联网下载依赖。

## 检查与打包

```sh
bun run typecheck
bun run test:chat-ui
ALLOW_UNSIGNED_MAC=1 bun run package:mac
```

`package:mac` 会先构建 SDK，再打包牛马。输出位于：

- 应用：`apps/examples/cowse-app/src-tauri/target/release/bundle/macos/牛马.app`
- 安装分发文件：`apps/examples/cowse-app/dist/desktop/`

`ALLOW_UNSIGNED_MAC=1` 仅用于本地临时签名构建，不等于已获得 Apple 签名或公证。公开分发需要另行配置签名与公证；仓库不包含签名私钥。当前重点验证平台为 Apple Silicon macOS，其他平台不保证可用。

## 配置与隐私

在应用中配置供应商、登录和代理。不要把 API 密钥、OAuth 凭据、代理密码、`.env`、`~/.cline` 或会话数据库提交到仓库。此目录不附带任何可用账户或凭据。

代理和自动允许均应按需配置；自动允许可能让模型读写文件、执行命令或访问网络。使用前请确认授权范围。

## 来源与许可

基于 [Cline](https://github.com/cline/cline) 源码进行开发，不是 Cline 官方发布。保留上游源码的版权及许可证声明；参见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
