#!/usr/bin/env node
/**
 * Run the real standalone companion against the demo host.
 *
 *   npm run demo          # macOS / Windows / Linux
 *   npm run demo -- --keep-state
 *
 * What runs here is the shipping code: `runtime/electron-helper/main.cjs` with
 * its real preload and the real `panel/` assets. Only the host behind it is a
 * stub, so todos, reminders and messages are seeded instead of coming from DSH.
 *
 * State written by the helper (window position, Chromium profile) goes to
 * `demo/.state`, never to `$DSH_HOME`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { startDemoHost } from './serve.mjs'

const root = join(import.meta.dirname, '..')
const stateHome = join(import.meta.dirname, '.state')
const keepState = process.argv.includes('--keep-state')

const ELECTRON_RELATIVE =
  process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
      : 'electron'

const electron =
  process.env.DSH_QUICK_PANEL_ELECTRON ||
  join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'electron', ELECTRON_RELATIVE)

if (!existsSync(electron)) {
  console.error(`找不到 Electron：${electron}`)
  console.error('先运行 dsh-pet 的 scripts/ensure-electron.mjs，或设置 DSH_QUICK_PANEL_ELECTRON。')
  process.exit(1)
}

if (!keepState) rmSync(stateHome, { recursive: true, force: true })
mkdirSync(join(stateHome, 'quick-panel'), { recursive: true })

// Chromium's own sandbox cannot nest inside another one (the DSH bash tool runs
// this script inside its file sandbox, and some containers do the same). The
// window still renders normally with --no-sandbox.
const needsNoSandbox = process.argv.includes('--no-sandbox') || process.env.DSH_SHELL === '1'

const host = await startDemoHost(0)
const url = `${host.origin}/quick-panel/panel?token=demo`
const helper = join(root, 'runtime', 'electron-helper', 'main.cjs')

const env = {
  ...process.env,
  DSH_HOME: stateHome,
  QUICK_PANEL_HOST_PID: String(process.pid),
  QUICK_PANEL_URL: url,
}
// The DSH process tree carries ELECTRON_RUN_AS_NODE=1; leaving it set would
// start Electron as plain Node instead of a window.
delete env.ELECTRON_RUN_AS_NODE

console.log('快捷面板 · macOS/Windows 演示')
console.log(`  Electron: ${electron}`)
console.log(`  演示 Host: ${host.origin}`)
console.log(`  状态目录: ${stateHome}`)
console.log('  浮岛应出现在屏幕顶部中央；点浮岛文字或 ⌃ 展开面板，关面板=收起为浮岛。')
if (needsNoSandbox) console.log('  已加 --no-sandbox（外层已有沙箱，不能嵌套）')
console.log('  Ctrl+C 结束演示。')

const args = needsNoSandbox ? ['--no-sandbox', helper, `--url=${url}`] : [helper, `--url=${url}`]

const child = spawn(electron, args, {
  cwd: stateHome,
  env,
  stdio: 'inherit',
})

const stop = async (code = 0) => {
  await host.close()
  process.exit(code)
}

child.on('error', async (error) => {
  console.error(`启动 Electron 失败：${error.message}`)
  await stop(1)
})
child.on('exit', async (code) => {
  console.log(`独立窗已退出（code=${code}）`)
  await stop(0)
})
process.on('SIGINT', () => {
  child.kill()
  void stop(0)
})
