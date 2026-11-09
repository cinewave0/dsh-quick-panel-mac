'use strict'

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { companionPlatform } = require('./platform.cjs')

const PANEL_WIDTH = 440
const PANEL_MIN_HEIGHT = 560
const PANEL_DEFAULT_HEIGHT = 720
const ISLAND_WIDTH = 360
const ISLAND_HEIGHT = 48

const PLATFORM = companionPlatform(process.platform)

app.setName('dsh-quick-panel')

const urlArgument = process.argv.find((value) => value.startsWith('--url='))
const target =
  process.env.QUICK_PANEL_URL || (urlArgument ? urlArgument.slice('--url='.length) : '')
const allowed = /^http:\/\/127\.0\.0\.1:\d+\//.test(target)

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const boundsFile = path.join(home, 'quick-panel', 'window.json')
const iconPath = path.join(__dirname, '..', '..', 'panel', 'icon.png')
const trayIconPath = path.join(
  __dirname,
  '..',
  '..',
  'panel',
  PLATFORM.templateTrayIcon ? 'trayTemplate.png' : 'icon.png',
)

/**
 * macOS only: Electron derives userData from the app name, and launched as
 * `electron <main.cjs>` that name is absent, so it falls back to a directory
 * shared with every other bare Electron script — profile, cache and the
 * single-instance socket the helper locks at startup. Windows keeps its
 * existing location; this branch must not change it.
 */
if (PLATFORM.mac) app.setPath('userData', path.join(home, 'quick-panel', 'user-data'))

let mainWindow = null
let tray = null
let mode = 'island'
let quitting = false
let pinned = false
let panelBounds = null
let islandBounds = null
let saveTimer = 0
let dragState = null
let resizeState = null
let programmaticResize = false

function readPersisted() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile, 'utf8'))
  } catch (_error) {
    return null
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(boundsFile), { recursive: true })
    fs.writeFileSync(
      boundsFile,
      JSON.stringify({ panel: panelBounds, island: islandBounds, pinned }, null, 2),
      'utf8',
    )
  } catch (_error) {
    /* position persistence is best effort */
  }
}

const persisted = readPersisted()
if (persisted) {
  pinned = Boolean(persisted.pinned)
  if (persisted.panel && typeof persisted.panel === 'object') panelBounds = persisted.panel
  if (persisted.island && typeof persisted.island === 'object') islandBounds = persisted.island
  if (!panelBounds && Number.isFinite(persisted.x)) {
    panelBounds = { x: persisted.x, y: persisted.y, height: persisted.height }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function workAreaFor(bounds) {
  if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
    return screen.getDisplayMatching({ x: bounds.x, y: bounds.y, width: 1, height: 1 }).workArea
  }
  return screen.getPrimaryDisplay().workArea
}

function panelTarget(workArea) {
  const height = panelBounds && Number.isFinite(panelBounds.height)
    ? clamp(panelBounds.height, PANEL_MIN_HEIGHT, workArea.height)
    : Math.min(PANEL_DEFAULT_HEIGHT, workArea.height)
  const x = panelBounds && Number.isFinite(panelBounds.x)
    ? clamp(panelBounds.x, workArea.x, workArea.x + workArea.width - PANEL_WIDTH)
    : Math.round(workArea.x + (workArea.width - PANEL_WIDTH) / 2)
  const y = panelBounds && Number.isFinite(panelBounds.y)
    ? clamp(panelBounds.y, workArea.y, workArea.y + workArea.height - height)
    : Math.round(workArea.y + (workArea.height - height) / 2)
  return { x, y, width: PANEL_WIDTH, height }
}

function islandTarget(workArea) {
  if (islandBounds && Number.isFinite(islandBounds.x) && Number.isFinite(islandBounds.y)) {
    return {
      x: clamp(islandBounds.x, workArea.x, workArea.x + workArea.width - ISLAND_WIDTH),
      y: clamp(islandBounds.y, workArea.y, workArea.y + workArea.height - ISLAND_HEIGHT),
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
    }
  }
  return {
    x: Math.round(workArea.x + (workArea.width - ISLAND_WIDTH) / 2),
    y: workArea.y + 12,
    width: ISLAND_WIDTH,
    height: ISLAND_HEIGHT,
  }
}

function clampBounds(bounds) {
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const width = mode === 'island' ? ISLAND_WIDTH : PANEL_WIDTH
  const minHeight = mode === 'island' ? ISLAND_HEIGHT : PANEL_MIN_HEIGHT
  const maxHeight = mode === 'island' ? ISLAND_HEIGHT : area.height
  const height = Math.min(Math.max(bounds.height, minHeight), maxHeight)
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

function saveCurrent() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const current = mainWindow.getBounds()
  const clamped = clampBounds(current)
  const changed =
    Math.abs(clamped.x - current.x) > 2 ||
    Math.abs(clamped.y - current.y) > 2 ||
    Math.abs(clamped.width - current.width) > 2 ||
    Math.abs(clamped.height - current.height) > 2
  if (changed) {
    if (mode === 'island') {
      mainWindow.setPosition(clamped.x, clamped.y)
    } else {
      programmaticResize = true
      mainWindow.setBounds(clamped)
      setTimeout(() => {
        programmaticResize = false
      }, 80)
    }
  }
  if (mode === 'island') {
    islandBounds = { x: clamped.x, y: clamped.y, width: ISLAND_WIDTH, height: ISLAND_HEIGHT }
    enforceIslandSize()
  } else {
    panelBounds = { x: clamped.x, y: clamped.y, width: PANEL_WIDTH, height: clamped.height }
  }
  persist()
}

function enforceIslandSize() {
  if (!mainWindow || mainWindow.isDestroyed() || mode !== 'island') return
  const [width, height] = mainWindow.getSize()
  if (width === ISLAND_WIDTH && height === ISLAND_HEIGHT) return
  programmaticResize = true
  mainWindow.setResizable(true)
  mainWindow.setSize(ISLAND_WIDTH, ISLAND_HEIGHT, false)
  mainWindow.setResizable(false)
  setTimeout(() => {
    programmaticResize = false
  }, 80)
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = 0
    saveCurrent()
  }, 250)
}

function setMode(next) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (next === mode) {
    if (next === 'panel') {
      setDockVisible(true)
      mainWindow.show()
      mainWindow.focus()
      stealFocus()
    }
    return
  }
  saveCurrent()
  const workArea = workAreaFor(next === 'island' ? islandBounds : panelBounds)
  if (next === 'island') {
    mode = 'island'
    programmaticResize = true
    mainWindow.unmaximize()
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(ISLAND_WIDTH, ISLAND_HEIGHT)
    mainWindow.setMaximumSize(ISLAND_WIDTH, ISLAND_HEIGHT)
    mainWindow.setBounds(islandTarget(workArea))
    mainWindow.setSize(ISLAND_WIDTH, ISLAND_HEIGHT, false)
    mainWindow.setSkipTaskbar(true)
    applyTopmost(true)
    setDockVisible(false)
    mainWindow.webContents.send('qp:mode', 'island')
    mainWindow.show()
    mainWindow.setResizable(false)
    setTimeout(() => {
      programmaticResize = false
    }, 200)
    setTimeout(() => {
      if (mode === 'island') enforceIslandSize()
    }, 300)
  } else {
    mode = 'panel'
    programmaticResize = true
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(PANEL_WIDTH, PANEL_MIN_HEIGHT)
    mainWindow.setMaximumSize(PANEL_WIDTH, workArea.height)
    mainWindow.setSkipTaskbar(false)
    applyTopmost(pinned)
    setDockVisible(true)
    mainWindow.setBounds(panelTarget(workArea))
    mainWindow.webContents.send('qp:mode', 'panel')
    mainWindow.show()
    mainWindow.focus()
    stealFocus()
    setTimeout(() => {
      programmaticResize = false
    }, 200)
  }
  persist()
}

/** macOS swaps the taskbar button for the Dock icon, so the island hides it. */
function setDockVisible(visible) {
  if (!PLATFORM.hideDockInIsland || !app.dock) return
  try {
    if (visible) app.dock.show()
    else app.dock.hide()
  } catch (_error) {
    /* the Dock is optional */
  }
}

/** Keep the island in the right window band (macOS needs an explicit `floating`). */
function applyTopmost(on) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (PLATFORM.topmostLevel) mainWindow.setAlwaysOnTop(on, PLATFORM.topmostLevel)
  else mainWindow.setAlwaysOnTop(on)
  if (PLATFORM.mac && on) {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

/** macOS: a window raised from a helper process is not necessarily frontmost. */
function stealFocus() {
  if (!PLATFORM.mac || !mainWindow || mainWindow.isDestroyed()) return
  app.focus({ steal: true })
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(trayIconPath)
    if (image.isEmpty()) return
    // A template image lets macOS invert the menu-bar icon for dark and light bars.
    if (PLATFORM.templateTrayIcon) image.setTemplateImage(true)
    tray = new Tray(PLATFORM.templateTrayIcon ? image : image.resize({ width: 16, height: 16 }))
    tray.setToolTip('快捷面板')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开面板', click: () => setMode('panel') },
        { label: '收起到浮岛', click: () => setMode('island') },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            quitting = true
            app.quit()
          },
        },
      ]),
    )
    tray.on('click', () => setMode('panel'))
  } catch (_error) {
    /* the tray is optional */
  }
}

/**
 * macOS draws the menu bar from the application menu, and that menu is also what
 * supplies Cmd+C/V/A/W/Q. Dropping it (as Windows does with `setMenu(null)`)
 * would leave the quick-input box unable to paste.
 */
function installApplicationMenu() {
  if (!PLATFORM.keepApplicationMenu) return
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  )
}

function createWindow() {
  const workArea = workAreaFor(islandBounds)
  const island = islandTarget(workArea)
  mainWindow = new BrowserWindow({
    width: ISLAND_WIDTH,
    height: ISLAND_HEIGHT,
    x: island.x,
    y: island.y,
    minWidth: ISLAND_WIDTH,
    maxWidth: ISLAND_WIDTH,
    minHeight: ISLAND_HEIGHT,
    maxHeight: ISLAND_HEIGHT,
    frame: false,
    show: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#101318',
    title: '快捷面板',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    // macOS: the first click should reach the control under the cursor even when
    // the companion is not the active app yet.
    acceptFirstMouse: PLATFORM.mac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // `win.setMenu` is Windows/Linux only, and on macOS the application menu must
  // stay because it carries Cmd+C/V/W/Q — see installApplicationMenu().
  if (!PLATFORM.mac) mainWindow.setMenu(null)
  let launchUrl = target
  try {
    const url = new URL(target)
    url.searchParams.set('mode', 'island')
    launchUrl = url.toString()
  } catch (_error) {
    /* keep the raw target */
  }
  mainWindow.loadURL(launchUrl)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!/^https?:\/\/127\.0\.0\.1:\d+\//.test(url)) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const raiseWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    if (typeof mainWindow.moveTop === 'function') mainWindow.moveTop()
    stealFocus()
  }
  mainWindow.once('ready-to-show', raiseWindow)
  mainWindow.webContents.once('did-finish-load', raiseWindow)
  setTimeout(raiseWindow, 1500)

  mainWindow.on('resize', queueSave)
  mainWindow.on('move', queueSave)
  mainWindow.on('will-resize', (event, newBounds) => {
    if (mode === 'island') {
      if (!programmaticResize) event.preventDefault()
      return
    }
    if (!newBounds || programmaticResize) return
    const clamped = clampBounds(newBounds)
    if (
      Math.abs(clamped.x - newBounds.x) > 2 ||
      Math.abs(clamped.y - newBounds.y) > 2 ||
      Math.abs(clamped.width - newBounds.width) > 2 ||
      Math.abs(clamped.height - newBounds.height) > 2
    ) {
      event.preventDefault()
      programmaticResize = true
      mainWindow.setBounds(clamped)
      setTimeout(() => {
        programmaticResize = false
      }, 80)
    }
  })
  mainWindow.on('will-move', (event, newBounds) => {
    if (!newBounds || programmaticResize) return
    const clamped = clampBounds(newBounds)
    if (mode === 'island') {
      if (
        Math.abs(clamped.x - newBounds.x) > 2 ||
        Math.abs(clamped.y - newBounds.y) > 2
      ) {
        event.preventDefault()
        mainWindow.setPosition(clamped.x, clamped.y)
      }
      return
    }
    if (
      Math.abs(clamped.x - newBounds.x) > 2 ||
      Math.abs(clamped.y - newBounds.y) > 2
    ) {
      event.preventDefault()
      programmaticResize = true
      mainWindow.setBounds(clamped)
      setTimeout(() => {
        programmaticResize = false
      }, 80)
    }
  })
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    setMode('island')
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })
}

if (!allowed) {
  app.whenReady().then(() => app.quit())
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    setMode('panel')
  })

  app.whenReady().then(() => {
    createWindow()
    installApplicationMenu()
    createTray()
    setDockVisible(false)
    // A launch starts in island mode and never passes through setMode(), so the
    // floating band and the "show on every Space" flag have to be applied here.
    if (PLATFORM.mac) applyTopmost(true)
    setInterval(() => {
      if (!quitting) enforceIslandSize()
    }, 2000)
    const hostPid = Number(process.env.QUICK_PANEL_HOST_PID)
    if (Number.isInteger(hostPid) && hostPid > 0) {
      setInterval(() => {
        try {
          process.kill(hostPid, 0)
        } catch (error) {
          if (error && error.code === 'ESRCH') app.quit()
        }
      }, 3000)
    }

    ipcMain.handle('qp:minimize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
    })
    ipcMain.handle('qp:close', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
    })
    ipcMain.handle('qp:expand', () => {
      setMode('panel')
    })
    ipcMain.handle('qp:collapse', () => {
      setMode('island')
    })
    ipcMain.handle('qp:mode-state', () => mode)
    ipcMain.handle('qp:drag-start', (_event, x, y) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const [winX, winY] = mainWindow.getPosition()
      dragState = {
        cursorX: Number(x) || 0,
        cursorY: Number(y) || 0,
        winX,
        winY,
      }
    })
    ipcMain.handle('qp:drag-move', (_event, x, y) => {
      if (!dragState || !mainWindow || mainWindow.isDestroyed()) return
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const nextX = dragState.winX + Math.round(x - dragState.cursorX)
      const nextY = dragState.winY + Math.round(y - dragState.cursorY)
      const display = screen.getDisplayNearestPoint({ x: nextX, y: nextY })
      const area = display.workArea
      const clampedX = Math.min(Math.max(nextX, area.x), area.x + area.width - ISLAND_WIDTH)
      const clampedY = Math.min(Math.max(nextY, area.y), area.y + area.height - ISLAND_HEIGHT)
      mainWindow.setPosition(clampedX, clampedY)
      if (mode === 'island') {
        const [width, height] = mainWindow.getSize()
        if (width !== ISLAND_WIDTH || height !== ISLAND_HEIGHT) {
          programmaticResize = true
          mainWindow.setResizable(true)
          mainWindow.setSize(ISLAND_WIDTH, ISLAND_HEIGHT, false)
          mainWindow.setResizable(false)
          setTimeout(() => {
            programmaticResize = false
          }, 80)
        }
      }
    })
    ipcMain.handle('qp:drag-end', () => {
      dragState = null
    })
    // macOS frameless windows have no native resize edge, so the panel draws its
    // own bottom grip and drives the height through these three calls.
    ipcMain.handle('qp:resize-start', (_event, y) => {
      if (!mainWindow || mainWindow.isDestroyed() || mode !== 'panel') return
      const bounds = mainWindow.getBounds()
      resizeState = { cursorY: Number(y) || 0, height: bounds.height, y: bounds.y }
    })
    ipcMain.handle('qp:resize-move', (_event, y) => {
      if (!resizeState || !mainWindow || mainWindow.isDestroyed() || mode !== 'panel') return
      if (!Number.isFinite(y)) return
      const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea
      const height = Math.min(
        Math.max(resizeState.height + Math.round(y - resizeState.cursorY), PANEL_MIN_HEIGHT),
        area.height,
      )
      const bounds = mainWindow.getBounds()
      programmaticResize = true
      mainWindow.setBounds({ x: bounds.x, y: resizeState.y, width: PANEL_WIDTH, height })
      setTimeout(() => {
        programmaticResize = false
      }, 80)
    })
    ipcMain.handle('qp:resize-end', () => {
      resizeState = null
      queueSave()
    })
    ipcMain.handle('qp:pin', () => {
      pinned = !pinned
      if (mainWindow && !mainWindow.isDestroyed() && mode === 'panel') {
        applyTopmost(pinned)
      }
      persist()
      return pinned
    })
    ipcMain.handle('qp:pin-state', () => pinned)
    ipcMain.handle('qp:menu', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      Menu.buildFromTemplate([
        { label: '打开面板', click: () => setMode('panel') },
        {
          label: '面板置顶',
          type: 'checkbox',
          checked: pinned,
          click: () => {
            pinned = !pinned
            if (mainWindow && !mainWindow.isDestroyed() && mode === 'panel') {
              applyTopmost(pinned)
            }
            persist()
          },
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            quitting = true
            app.quit()
          },
        },
      ]).popup({ window: mainWindow })
    })
  })

  app.on('before-quit', () => {
    quitting = true
  })
  // macOS: clicking the Dock icon while the panel is collapsed reopens it.
  // `activate` also fires on launch, so require a visible Dock icon — it is
  // hidden whenever the island is showing.
  if (PLATFORM.mac) {
    app.on('activate', () => {
      if (!app.dock || !app.dock.isVisible()) return
      if (mainWindow && !mainWindow.isDestroyed()) setMode('panel')
    })
  }
  app.on('window-all-closed', () => {
    /* the window is reused for panel/island; quit only from the tray */
  })
}
