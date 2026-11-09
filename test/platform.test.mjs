import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { companionPlatform } = require('../runtime/electron-helper/platform.cjs')

test('windows keeps its taskbar button, colour tray icon and default topmost band', () => {
  const win = companionPlatform('win32')
  assert.equal(win.mac, false)
  assert.equal(win.templateTrayIcon, false)
  assert.equal(win.leftClickOpensMenu, false)
  assert.equal(win.hideDockInIsland, false)
  assert.equal(win.topmostLevel, undefined)
  assert.equal(win.keepApplicationMenu, false)
  assert.equal(win.framelessEdgeResizable, true)
})

test('macOS hides the Dock, keeps the app menu and uses a template tray icon', () => {
  const mac = companionPlatform('darwin')
  assert.equal(mac.mac, true)
  assert.equal(mac.templateTrayIcon, true)
  assert.equal(mac.leftClickOpensMenu, true)
  assert.equal(mac.hideDockInIsland, true)
  assert.equal(mac.topmostLevel, 'floating')
  assert.equal(mac.keepApplicationMenu, true)
  assert.equal(mac.framelessEdgeResizable, false)
})

test('linux has no Dock and no application menu of its own', () => {
  const linux = companionPlatform('linux')
  assert.equal(linux.mac, false)
  assert.equal(linux.templateTrayIcon, false)
  assert.equal(linux.hideDockInIsland, false)
  assert.equal(linux.keepApplicationMenu, false)
  assert.equal(linux.framelessEdgeResizable, true)
})
