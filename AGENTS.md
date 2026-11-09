# AGENTS.md — 改这个仓库前先读

## 一句话规则

**本仓库只发布 macOS 版。** 所有 macOS 改动必须被平台判断隔离在 `darwin` 分支里；Windows 的代码路径保持与上游一致，不在这个仓库里改。

上游 Windows 版：<https://github.com/cinewave0/cinewave0-dsh-quick-panel>。两个仓库独立发布，互不合并。

## 平台基线

| 平台 | 支持状态 | 谁在实际机器上验证 |
|---|---|---|
| Windows 10/11 | 不在本仓库发布；代码路径与上游保持一致 | 上游仓库维护者 |
| macOS 12+ | 本仓库唯一发布目标 | 任何能跑 mac 的人 |
| Linux | 未支持 | — |

## 硬性规则

1. **平台差异只能住在 `runtime/electron-helper/platform.cjs`**。`main.cjs` 只负责把 `companionPlatform()` 的结果接进 Electron 调用，不得自己写 `process.platform === ...` 分支（除非 `platform.cjs` 表达不了）。
2. **新行为只能放进 `PLATFORM.mac` 为真的分支。** 非 darwin 路径必须逐行保持原样，包括调用顺序和参数。
3. **无法用平台判断隔离的改动，先停下来。** 例如改公共函数签名、改路径解析、改窗口 z 序、换托盘图标资源、动 `skipTaskbar` 语义——把清单和理由列给维护者，由他在 Windows 上决定，**不要先改再解释**。
4. **不确定就写"未验证"。** 提交信息和 PR 描述里，没有在 Windows 实机跑过的行为必须明说，不得写"应该没问题""无影响""行为不变"。上一版就是这么写错的。
5. **不允许为了让 macOS 跑通而牺牲 Windows 的既有行为。** 宁可 mac 少一个特性，也不要让 Windows 多一个变量。

## Windows 代码路径：保持与上游一致（不要在本地改）

| 位置 | 现状 | 为什么不能动 |
|---|---|---|
| `main.cjs` userData | Electron 默认位置（`app.setPath` 只在 darwin 执行） | 换目录会重置 Chromium profile，且改变单实例锁位置 |
| `main.cjs` 窗口菜单 | `setMenu(null)` | Windows/Linux 专用；去掉会改变窗口菜单行为 |
| `main.cjs` 托盘 | `panel/icon.png` 缩放 16×16 | 彩色图标在 Windows 通知区域是预期外观 |
| `main.cjs` 任务栏 | `setSkipTaskbar(true/false)` | 浮岛不占任务栏的核心行为 |
| `main.cjs` 置顶 | `setAlwaysOnTop(flag)`，不带 level | 带 `level` 会改变 z 序档位 |
| `main.cjs` 缩放 | 依赖无边框窗的原生边缘 | Windows 无边框窗自带缩放边，不要加自绘 grip |
| `index.js` 沙箱重试 | 仅 `win32` 命中 NTSTATUS 退出码 | mac 上不会触发，但条件本身不能删 |

## macOS 专属清单（改这些不用问 Windows）

- `app.setPath('userData', …)`：默认 userData 是共享目录，单实例锁也在里面
- `app.dock.hide()/show()`：替代 Windows 的任务栏按钮
- 应用菜单：macOS 的 Cmd+C/V/W/Q 由菜单提供，不能像 Windows 那样 `setMenu(null)`
- 托盘模板图：`panel/trayTemplate.png` + `@2x`，跟随深浅色菜单栏反色
- `floating` 置顶档 + `setVisibleOnAllWorkspaces(…, { visibleOnFullScreen: true })`
- 面板底部自绘 resize grip：无边框窗在 macOS 没有原生缩放边
- `app.focus({ steal: true })`：host 拉起的窗口不一定在前台

## 验证矩阵

| 命令 | Windows | macOS | 备注 |
|---|---|---|---|
| `npm run check` | ✅ | ✅ | 语法检查，含 `.cjs` |
| `npm run lint` | ✅ | ✅ | oxlint，0 warning 门槛 |
| `node test/host.test.mjs` | ✅ | ✅ | Host 回归 11 项 |
| `node test/platform.test.mjs` | ✅ | ✅ | 三个平台的规则断言 |
| `node test/client-bundle.test.mjs` | ✅ | ✅ | 含 `client.js` 漂移检查（配合 `npm run build`） |
| `node test/panel.test.mjs` | ✅ | ✅ | 需要 `$DSH_HOME/electron`；macOS 上见下条 |
| `npm run demo` | ✅ | ✅ | 起真实独立窗 + 演示 Host（`demo/`），不需要 DSH 在跑 |

macOS 上手工拉 Electron 必须去掉 `ELECTRON_RUN_AS_NODE`（DSH 的进程树里带着它，否则 Electron 会以 Node 模式启动）：

```sh
env -u ELECTRON_RUN_AS_NODE node test/panel.test.mjs
```

## 提交前

1. 跑完上表里你在本机能跑的部分，跑不了的写"未验证"。
2. `npm run build` 后 `git diff --exit-code client.js` 必须干净（`client.js` 是产物）。
3. 提交信息说明改动是否触及非 darwin 路径；触及了就写清楚是哪一处、为什么无法隔离。
