## 安装

**方式一：DSH 插件页（推荐）**

插件 → 发现 → 添加索引源：

```text
https://cinewave0.github.io/cinewave0-dsh-quick-panel/market/index.json
```

然后搜索 **Quick Panel** 安装。索引固定到某个 commit，装完即用。

**方式二：本页的 Release 包**

下载本页附带的 `dsh-quick-panel-<version>.tgz`，先用 `SHA256SUMS` 校验：

```sh
shasum -a 256 -c SHA256SUMS          # macOS / Linux
certutil -hashfile <tgz> SHA256      # Windows，与 SHA256SUMS 里的值比对
```

然后在 DSH 插件页的安装入口填 tgz 的**绝对路径**；装了 `dsh` CLI 的环境也可以用：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-quick-panel-<version>.tgz
```

**方式三：钉到 git commit**

```sh
dsh plugin --profile desktop add "git+https://github.com/cinewave0/cinewave0-dsh-quick-panel.git#<commit>"
```

## 平台要求

| | 要求 |
|---|---|
| DSH | `>=0.2.2-rc.1 <0.3.0` |
| Windows | 10/11；独立窗需要 `%USERPROFILE%\.dsh\electron\electron.exe` |
| macOS | 12+；独立窗需要 `~/.dsh/electron/Electron.app`（dsh-pet 会下载，也可用 `scripts/ensure-electron.mjs`） |

路径缺失时打开独立窗会报 `electron-missing`；也可以用 `DSH_QUICK_PANEL_ELECTRON` 指向别处的 Electron。

> 本项目**不发布 npm**，只有上面三个渠道。装完或升级后请刷新一次 DSH 页面（Host 半区改动需要重启 DSH）。

## 变更
