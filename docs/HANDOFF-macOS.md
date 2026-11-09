# 快捷面板 · macOS 交接文档

> 2026-11-09。写这份文档时的状态：macOS 分支功能已落地，Windows 主线未合并、未改动。

## 1. 目标与边界

| 项 | 决定 |
|---|---|
| 目标 | 在 macOS 上实现与 `v1.0.4-beta.1` 等价的功能通路 |
| 代码位置 | 独立分支 `feat/macos`，**不合并进 `main`** |
| Windows | **零改动**。所有代码都在 `PLATFORM.mac` 分支内；没有 Windows 环境时不碰 Windows 路径（见仓库 `AGENTS.md`） |
| 发布 | 本阶段不发布。要发布时按第 9 节走 |

## 2. 代码与环境

- GitHub：<https://github.com/cinewave0/cinewave0-dsh-quick-panel>，分支 `feat/macos`
- 本地工作副本：`/tmp/qp`（**注意：`/tmp` 会被系统清理**，长期保存用第 10 节的备份）
- 本机备份：`~/dsh/backups/quick-panel-1.0.4-beta.1-20261109-135858-mac-port.zip`（含 `.git` 全历史，sha256 见同名 `.sha256`）
- Electron：`~/.dsh/electron/Electron.app/Contents/MacOS/Electron`（43.3.0，由 dsh-pet 下载）
- 安装方式：以 `link:` 挂载进桌面版 profile（`~/.dsh/profiles/desktop/package.json` 里的 `dsh-quick-panel: link:/tmp/qp`）

## 3. 三方架构

```
DSH 页面里的 client.js（React）          唯一状态源是 Host，两边都不持有业务状态
        │  待办/提醒/实时消息/审批/问题卡
        ▼
Host 半区 index.js（跑在 DSH 主进程）
        ├ 状态：state.json（todos/reminders/settings/activeSessionId）
        ├ live 镜像：feed / approval / question / usage
        ├ token：注入页面 + 拼进独立窗 URL
        └ 拉起独立窗：spawn Electron → runtime/electron-helper/main.cjs
                    ▼
        独立窗（panel/*）：每 1s 轮询 /quick-panel/state，操作 POST 回 Host
```

联动靠两件事：共享 `state.json` + `companion-ping` 心跳（Host 用 `companionOpen` 告诉内部"外部在不在"）。

## 4. macOS 侧改了什么

| 文件 | 改动 | 为什么 |
|---|---|---|
| `index.js` | `electronExecutable()` 按平台解析路径 | 原版只在 win32 返回路径，mac 上永远 `electron-missing` |
| `runtime/electron-helper/platform.cjs` | 新增：平台规则纯函数 | 平台差异集中一处，可被 `node:test` 断言 |
| `main.cjs` | `app.setPath('userData')`（仅 mac） | 默认 userData 是共享目录，mac 的单实例锁也在里面 |
| `main.cjs` | `app.dock.hide()/show()` | mac 没有任务栏按钮，浮岛态隐藏 Dock |
| `main.cjs` | 保留应用菜单（mac） | 菜单是 Cmd+C/V/W/Q 的来源，`setMenu(null)` 会连带干掉快捷键 |
| `main.cjs` | `floating` 档 + `setVisibleOnAllWorkspaces` | 全屏/多 Space 下不被遮挡 |
| `main.cjs` | 启动时补 `applyTopmost(true)` | 启动不走 `setMode()`，原来拿不到置顶带 |
| `main.cjs` | `activate` 要求 Dock 可见 | macOS 启动时也发 `activate`，否则一启动就弹成大面板 |
| `main.cjs` | `clampReachable`（仅 mac） | 任意屏幕/任意位置；只保证 120×48 露在屏幕内 |
| `preload.cjs` + `panel/*` | 底部 resize grip + `qp:resize-*`（仅 mac） | 无边框窗在 mac 上没有系统缩放边 |
| `panel/trayTemplate*.png` | 16/32 模板图 | 菜单栏图标必须纯黑+alpha，系统自动反色 |

## 5. 踩过的坑（最重要的一节）

1. **`ELECTRON_RUN_AS_NODE=1`**：DSH 的进程树带这个变量，直接拉 Electron 会当 Node 跑（报 `bad option: --no-sandbox`）。Host 里必须 `delete environment.ELECTRON_RUN_AS_NODE`；手工调试时用 `env -u ELECTRON_RUN_AS_NODE`。
2. **单实例锁在 userData 里**：mac 的锁是 userData 下的 `SingletonLock` socket。默认 userData 是共享的 `~/Library/Application Support/Chromium`，会撞锁导致 helper 秒退。必须 `app.setPath('userData', …)`（仅 mac）。
3. **`activate` 启动即触发**：不处理的话，窗口一创建就被切成 440×720 面板、Dock 出现、非置顶，然后被 DSH 主窗盖住——看起来像"没打开"。
4. **无边框窗在 mac 上没有缩放边**：Windows 有系统边框，mac 没有，必须自绘 grip。
5. **`setSkipTaskbar` 在 mac 是空操作**：要靠 `app.dock.hide()`。
6. **托盘图标必须模板图**：把 256px 大图缩到 16px 会糊成一块白砖（已经踩过）。
7. **`clampBounds` 会把窗口拉回工作区**：mac 上已放开，Windows 保留原行为。
8. **页面 token 依赖注入时机**：`__QUICK_PANEL_CONFIG__` 只在服务 HTML 时注入；插件是在页面已打开后装的，所以装完必须刷新页面。

## 6. 怎么跑

```sh
# 不装插件、只看窗口（种子数据）
npm install
npm run demo

# 装进本机 profile（link 挂载，会写 ~/.dsh/profiles/desktop）
#   在 DSH 里：设置 → 插件 → 安装 → 填 /tmp/qp
#   或者用 plugin_manager 工具：install_bundle target=/tmp/qp
# 装完刷新 DSH 页面；Host 半区（index.js）改动需要重启 DSH
```

## 7. 测试

```sh
npm run check && npm run lint
node test/host.test.mjs          # 11 项 Host 回归
node test/platform.test.mjs      # 三平台规则断言
node test/client-bundle.test.mjs # 产物与源码一致
node test/source-imports.test.mjs
node test/dsh-adapter.test.mjs

# macOS 上注意去掉 ELECTRON_RUN_AS_NODE
env -u ELECTRON_RUN_AS_NODE node test/panel.test.mjs
```

## 8. 当前验证状态

| 能力 | 状态 |
|---|---|
| 浮岛出现 / 显示最新消息 / 时间 / 呼吸灯 | ✅ 截图确认 |
| 展开成面板、真实数据（余额 ¥560.97、3 会话、30 日 tokens） | ✅ 截图确认 |
| Dock 隐藏（`UIElement`）、置顶、任意屏幕/位置 | ✅ 进程与窗口状态确认 |
| 菜单栏图标 | ✅ 已重画并确认 |
| 拖动浮岛、面板高度拖拽、会话 1/2/3 切换 | ⏳ 已实现，等人工点验 |
| 审批接管、问题卡镜像、附件上传、原图、提醒提示音、上滚加载更早 | ⏳ 需要特定场景触发 |
| 虚拟桌面（Space）切换后仍在 | ⏳ 待验 |
| Windows 侧回归 | ⏳ 需在 Windows 实机跑 |

## 9. 未完成事项

1. 上面表中 ⏳ 的项逐条人工验（约 10 分钟）。
2. Space 行为：若切换桌面后窗口弹回原桌面，是 `setVisibleOnAllWorkspaces` 的已知行为，需要改成"跟随当前 Space"或换 `collectionBehavior`。
3. 通知身份：裸 Electron 二进制在系统里叫 "Electron"（应用名、通知来源都是）。要正名得打成签名的 `.app`，超出当前范围。
4. 发布：如果要做独立 mac 发布线，需要新包名（如 `dsh-quick-panel-mac`）+ `os: ["darwin"]` + 独立索引条目；`main` 不动。
5. Windows 侧：不要在这个分支上改 Windows 路径。`AGENTS.md` 里有"不可动清单"。

## 10. 备份与回滚

- 备份：`node scripts/backup.mjs --out ~/dsh/backups --label <标签>`，产出 zip + `.sha256` + `.manifest.json`（含 HEAD 与脏文件列表）。本次备份：`quick-panel-1.0.4-beta.1-20261109-135858-mac-port.zip`。
- 回滚某次改动：分支内 `git revert <commit>`；整个分支不要了直接删。
- 从本机 profile 卸载插件：DSH 设置 → 插件 → 卸载；或 `plugin_manager remove_bundle target=dsh-quick-panel`。
- 清理运行痕迹：`rm -rf ~/.dsh/quick-panel`（窗口位置、helper.log、Chromium profile）。

## 11. 与 Windows 主线的唯一交集

`feat/macos` 是从 `main@d4f203b` 快进出来的，合并是 fast-forward。但**按当前决定不合并**：Windows 的问题在 Windows 上发现和修复，不在这个分支做。
