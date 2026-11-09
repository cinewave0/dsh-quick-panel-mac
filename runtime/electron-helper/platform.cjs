'use strict'

/**
 * Platform rules for the standalone companion window.
 *
 * Pure decisions only — deliberately no `require('electron')`, so `node:test`
 * can load this module on any machine without a display. `main.cjs` keeps only
 * the wiring; every "what differs per OS" answer lives here.
 *
 * Windows
 *   · a frameless window still has a native resize edge, and `setSkipTaskbar`
 *     removes the taskbar button while the island is showing
 *   · a tray context menu owns the right click, so the left click stays ours
 *   · `setAlwaysOnTop(true)` needs the `screen-saver` band to beat other
 *     topmost windows
 *
 * macOS
 *   · there is no per-window taskbar button: the Dock icon is the app's only
 *     taskbar presence, so island mode hides it with `app.dock.hide()`
 *   · the menu-bar icon must be a template image (black + alpha) so the system
 *     inverts it for dark and light menu bars; a colour icon disappears
 *   · once `setContextMenu` is set, a left click already opens it
 *   · `Menu.setApplicationMenu(null)` also drops Cmd+C/V/W/Q, because the
 *     application menu is what carries those shortcuts — keep a minimal menu
 *   · a frameless window has no native resize edge, so the panel height needs
 *     its own grip
 *   · `setAlwaysOnTop(true, 'floating')` plus
 *     `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` keeps
 *     the island above normal windows and in every Space
 *
 * @param {string} platform - `process.platform`
 */
function companionPlatform(platform) {
  const mac = platform === 'darwin'
  return {
    mac,
    /** Menu-bar icon must be a template image (macOS inverts it for the menu bar). */
    templateTrayIcon: mac,
    /** With a context menu set, a left click already opens it (no manual popup). */
    leftClickOpensMenu: mac,
    /** macOS replaces the taskbar button with the Dock icon, which island mode hides. */
    hideDockInIsland: mac,
    /**
     * Always-on-top band. macOS floats above normal windows; leaving it undefined
     * elsewhere keeps Electron's previous default (no explicit band).
     */
    topmostLevel: mac ? 'floating' : undefined,
    /** The application menu carries the standard shortcuts on macOS only. */
    keepApplicationMenu: mac,
    /** A frameless window keeps its native resize edge only off macOS. */
    framelessEdgeResizable: !mac,
  }
}

/**
 * The companion only ever loads a loopback panel page. Keep this decision here
 * so the Host-side fence and the window's navigation fence cannot drift.
 * @param {string} value
 */
const LOCAL_PANEL_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\//

function isLocalPanelUrl(value) {
  return typeof value === 'string' && LOCAL_PANEL_URL.test(value)
}

module.exports = { companionPlatform, isLocalPanelUrl }
