import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { companionPlatform, isLocalPanelUrl } = require('../runtime/electron-helper/platform.cjs')

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

test('the companion only loads loopback panel URLs', () => {
  assert.equal(isLocalPanelUrl('http://127.0.0.1:1234/quick-panel/panel?token=x'), true)
  assert.equal(isLocalPanelUrl('http://localhost:1234/quick-panel/panel'), true)
  assert.equal(isLocalPanelUrl('http://[::1]:1234/quick-panel/panel'), true)
  assert.equal(isLocalPanelUrl('https://127.0.0.1:1234/quick-panel/panel'), true)
  assert.equal(isLocalPanelUrl('http://127.0.0.1.evil.com:1234/quick-panel/panel'), false)
  assert.equal(isLocalPanelUrl('https://example.com/quick-panel/panel'), false)
  assert.equal(isLocalPanelUrl('file:///tmp/panel.html'), false)
  assert.equal(isLocalPanelUrl(undefined), false)
})
