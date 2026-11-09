'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * macOS frameless windows have no native resize edge, so the panel exposes a
 * bottom grip that drives the height through the main process. Other platforms
 * keep the native edge and never see the grip.
 */
const RESIZABLE_PANEL = process.platform === 'darwin'

contextBridge.exposeInMainWorld('quickPanelDesktop', {
  minimize: () => ipcRenderer.invoke('qp:minimize'),
  close: () => ipcRenderer.invoke('qp:close'),
  expand: () => ipcRenderer.invoke('qp:expand'),
  collapse: () => ipcRenderer.invoke('qp:collapse'),
  getMode: () => ipcRenderer.invoke('qp:mode-state'),
  onMode: (callback) => {
    const handler = (_event, mode) => callback(mode)
    ipcRenderer.on('qp:mode', handler)
    return () => ipcRenderer.removeListener('qp:mode', handler)
  },
  openMenu: () => ipcRenderer.invoke('qp:menu'),
  dragStart: (x, y) => ipcRenderer.invoke('qp:drag-start', x, y),
  dragMove: (x, y) => ipcRenderer.invoke('qp:drag-move', x, y),
  dragEnd: () => ipcRenderer.invoke('qp:drag-end'),
  supportsResize: RESIZABLE_PANEL,
  resizeStart: (y) => ipcRenderer.invoke('qp:resize-start', y),
  resizeMove: (y) => ipcRenderer.invoke('qp:resize-move', y),
  resizeEnd: () => ipcRenderer.invoke('qp:resize-end'),
  togglePin: () => ipcRenderer.invoke('qp:pin'),
  pinState: () => ipcRenderer.invoke('qp:pin-state'),
})
