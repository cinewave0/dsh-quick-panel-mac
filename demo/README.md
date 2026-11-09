# macOS / Windows 演示

不需要装进 DSH，也不需要 DSH 在跑，直接用发布包里的代码起一个真实独立窗。

```sh
npm install            # 只需要一次，装 esbuild/oxlint
npm run demo           # 或 npm run demo -- --keep-state 保留上次窗口位置
```

## 这里什么是真的

| 部分 | 是否真实 |
|---|---|
| `runtime/electron-helper/main.cjs`（窗口、托盘、Dock、置顶） | 真 |
| `runtime/electron-helper/preload.cjs`（IPC 桥） | 真 |
| `panel/`（HTML/CSS/JS） | 真 |
| Host（`index.js` 的 HTTP 接口） | 假，`demo/serve.mjs` 用种子数据模拟 |

所以看到的是要发货的窗口代码，只是消息、待办、余额是假的。状态写进 `demo/.state/`，不碰 `$DSH_HOME`。

## 可以试的

- 点浮岛文字或 `⌃` 展开面板；`⠿` 拖动浮岛；关面板收起回浮岛
- 展开面板：固定 440 宽、高度拉满当前屏；没有可拖的缩放条
- 菜单栏图标：打开面板 / 收起到浮岛 / 退出
- 浮岛态 Dock 图标消失，展开面板后回来（macOS）
- 托盘勾选「面板置顶」再切到别的应用，看面板是否还在最前

## 截图

`docs/mac-island.png`、`docs/mac-panel.png` 由同一套 `panel/` 资源渲染，用于 README。
