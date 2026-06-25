const { app, BrowserWindow, net, protocol, session, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_SCHEME = 'musik'
const APP_HOST = 'app'

app.commandLine.appendSwitch('disable-http-cache')

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function isTrustedUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST) return true
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return true
    return false
  } catch {
    return false
  }
}

function registerAppProtocol() {
  const distDir = path.join(app.getAppPath(), 'dist')

  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const filePath = path.resolve(distDir, `.${requestedPath}`)
    const relativePath = path.relative(distDir, filePath)
    const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

    if (!isSafe) {
      return new Response('Bad request', { status: 400 })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function registerPermissions() {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'media' || permission === 'fullscreen') {
      return isTrustedUrl(requestingOrigin)
    }

    return false
  })

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'media' || permission === 'fullscreen') {
      callback(isTrustedUrl(details?.requestingUrl ?? webContents.getURL()))
      return
    }

    callback(false)
  })
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#fff7f0',
    title: 'musik.lab',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    if (process.platform === 'darwin') app.focus({ steal: true })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[load-failed] ${errorCode} ${errorDescription} ${validatedUrl}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer-gone]', details)
  })

  await win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`)
}

app.whenReady().then(async () => {
  app.setName('musik.lab')
  registerAppProtocol()
  registerPermissions()
  await session.defaultSession.clearCache()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
