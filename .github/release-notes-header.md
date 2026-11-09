> **安装或更新后必须重启 DSH：⌘Q（Command + Q）完全退出，确认 Dock 图标消失，再重新打开。只关闭窗口或刷新页面（Cmd+R / Cmd+Shift+R）不够。** 首次安装时 DSH 页面里的插件入口还没加载，看到“Host 未连接”不是插件坏了；按 ⌘Q 退出重开即可。

## 安装

**方式一：DSH 插件页（推荐）**

插件 → 发现 → 添加索引源：

```text
https://cinewave0.github.io/dsh-quick-panel-mac/market/index.json
```

然后搜索 **Quick Panel** 安装。**装完必须按 ⌘Q（Command + Q）完全退出 DSH，确认 Dock 图标消失后重新打开**；只刷新页面不够。重新打开后第一次点“打开独立面板”会自动下载并安装 Electron（约 120 MB），不需要 dsh-pet 或手工解压。

**方式二：本页的 Release 包**

下载本页附带的 `dsh-quick-panel-mac-<version>.tgz`，先用 `SHA256SUMS` 校验：

```sh
shasum -a 256 -c SHA256SUMS          # macOS / Linux
certutil -hashfile <tgz> SHA256      # Windows，与 SHA256SUMS 里的值比对
```

然后在 DSH 插件页的安装入口填 tgz 的**绝对路径**；装了 `dsh` CLI 的环境也可以用：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-quick-panel-mac-<version>.tgz
```

**方式三：钉到 git commit**

```sh
dsh plugin --profile desktop add "git+https://github.com/cinewave0/dsh-quick-panel-mac.git#<commit>"
```

## 平台要求

| | 要求 |
|---|---|
| DSH | `>=0.2.2-rc.1 <0.3.0` |
| Windows | 10/11；独立窗需要 `%USERPROFILE%\.dsh\electron\electron.exe` |
| macOS | 12+；首次打开自动下载/校验 Electron 43.3.0 到 `~/.dsh/electron`，也可手动放置或设置 `DSH_QUICK_PANEL_ELECTRON` |

下载源优先 npmmirror、失败回退 GitHub Releases，zip 的 SHA-256 固定在校验表里。离线环境可设 `DSH_QUICK_PANEL_NO_RUNTIME_DOWNLOAD=1` 后手动安装，或设 `DSH_QUICK_PANEL_ELECTRON` 指向已有 Electron。

> 本项目**不发布 npm**，只有上面三个渠道。装完或升级后请刷新一次 DSH 页面（Host 半区改动需要重启 DSH）。

## 变更
