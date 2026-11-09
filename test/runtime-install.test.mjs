/**
 * Exercises the first-open provisioning path without the real 120 MB Electron
 * artifact: a tiny zip with the same `Electron.app/Contents/MacOS/Electron`
 * shape is served from a loopback HTTP server, downloaded, hash-checked,
 * extracted, and moved into $DSH_HOME/electron.
 *
 * Run with: node test/runtime-install.test.mjs
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { installElectronRuntime } from '../index.js'

const ZIP = Buffer.from(
  'UEsDBBQAAAAIAAAAIQDihkXDEwAAABEAAAAkAAAARWxlY3Ryb24uYXBwL0NvbnRlbnRzL01hY09TL0VsZWN0cm9uU1bUT8rM0y/O4EqtyCxRMOACAFBLAQIUAxQAAAAIAAAAIQDihkXDEwAAABEAAAAkAAAAAAAAAAAAAADtgQAAAABFbGVjdHJvbi5hcHAvQ29udGVudHMvTWFjT1MvRWxlY3Ryb25QSwUGAAAAAAEAAQBSAAAAVQAAAAAA',
  'base64',
)
const home = join(import.meta.dirname, '.runtime-home')
const previousHome = process.env.DSH_HOME
after(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

test(
  'provisioning downloads, verifies, extracts and installs a runtime',
  { skip: process.platform === 'win32' },
  async () => {
    rmSync(home, { recursive: true, force: true })
    mkdirSync(home, { recursive: true })
    process.env.DSH_HOME = home
    const server = createServer((request, response) => {
      if (request.url !== '/electron.zip') {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': String(ZIP.length),
      })
      response.end(ZIP)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${server.address().port}/electron.zip`
      const updates = []
      const result = await installElectronRuntime(
        {
          artifact: {
            sha256: createHash('sha256').update(ZIP).digest('hex'),
            bytes: ZIP.length,
          },
          urls: [url],
        },
        (update) => updates.push(update.status),
      )
      assert.ok(existsSync(result.path), 'the installed binary exists')
      assert.ok(statSync(result.path).isFile(), 'the installed binary is a file')
      assert.ok(updates.includes('downloading'), 'emits download progress')
      assert.ok(updates.includes('extracting'), 'emits extraction progress')
      assert.ok(
        existsSync(join(home, 'electron', 'Electron.app', 'Contents', 'MacOS', 'Electron')),
        'lands under $DSH_HOME/electron',
      )
    } finally {
      server.close()
      rmSync(home, { recursive: true, force: true })
    }
  },
)
