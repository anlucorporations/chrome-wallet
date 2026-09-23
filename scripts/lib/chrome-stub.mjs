/**
 * scripts/lib/chrome-stub.mjs — Simulador de las APIs de `chrome` para pruebas.
 *
 * Permite cargar el service worker compilado (`dist/background.js`) en Node y
 * ejercitar los flujos RPC reales sin abrir el navegador. Lo usan:
 *   - `scripts/test-background.mjs`   (pruebas de regresión del service worker)
 *   - `scripts/test-acceptance.mjs`   (los 11 casos del enunciado, con anvil)
 *
 * Cubre: storage.local, storage.session, storage.onChanged, runtime.onMessage,
 * runtime.sendMessage, action (badge), notifications, windows y tabs.
 */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export { delay }

/**
 * Instala el stub en `globalThis.chrome` y devuelve el estado observable.
 * Debe llamarse ANTES de importar `dist/background.js`.
 */
export function installChromeStub() {
  const localData = new Map()
  const sessionData = new Map()
  const openWindows = new Map()
  const openTabs = new Map()
  const messageListeners = []
  const windowRemovedListeners = []
  const storageChangedListeners = []
  /** Mensajes enviados a las pestañas: { tabId, message } */
  const tabMessages = []
  let badgeText = ''
  let windowIdSeq = 100

  function makeStorageArea(map, areaName) {
    const notify = (changes) => {
      for (const listener of storageChangedListeners) {
        Promise.resolve(listener(changes, areaName)).catch(() => {})
      }
    }
    const finish = (changes, cb) => {
      const promise = Promise.resolve()
      if (cb) {
        promise.then(cb)
        notify(changes)
        return undefined
      }
      notify(changes)
      return promise
    }

    return {
      get(keys, cb) {
        let result = {}
        if (keys === null || keys === undefined) {
          result = Object.fromEntries(map)
        } else if (typeof keys === 'string') {
          if (map.has(keys)) result[keys] = map.get(keys)
        } else {
          for (const key of keys) if (map.has(key)) result[key] = map.get(key)
        }
        const promise = Promise.resolve(result)
        if (cb) {
          promise.then(cb)
          return undefined
        }
        return promise
      },
      set(items, cb) {
        const changes = {}
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: map.get(key), newValue: value }
          map.set(key, value)
        }
        return finish(changes, cb)
      },
      remove(keys, cb) {
        const changes = {}
        for (const key of [].concat(keys)) {
          if (map.has(key)) changes[key] = { oldValue: map.get(key) }
          map.delete(key)
        }
        return finish(changes, cb)
      }
    }
  }

  globalThis.chrome = {
    runtime: {
      // Igual que en el manifest real: la guarda de métodos de la bóveda
      // compara el origen del remitente con `chrome-extension://<id>`.
      id: 'test',
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      removeListener: () => {},
      // El bus de logs avisa al popup; en las pruebas solo se ACK-ea
      sendMessage: (_message, cb) => {
        if (cb) cb()
        return Promise.resolve()
      },
      getURL: (path) => `chrome-extension://test/${path}`,
      lastError: undefined
    },
    storage: {
      local: makeStorageArea(localData, 'local'),
      session: makeStorageArea(sessionData, 'session'),
      onChanged: { addListener: (fn) => storageChangedListeners.push(fn) }
    },
    action: {
      setBadgeText: ({ text }) => {
        badgeText = text
        return Promise.resolve()
      },
      setBadgeBackgroundColor: () => Promise.resolve()
    },
    notifications: { create: () => Promise.resolve('notification-id') },
    windows: {
      create: (options) => {
        const id = ++windowIdSeq
        openWindows.set(id, options)
        return Promise.resolve({ id })
      },
      get: (id) => (openWindows.has(id) ? Promise.resolve({ id }) : Promise.reject(new Error(`No window ${id}`))),
      remove: (id) => {
        openWindows.delete(id)
        setTimeout(() => windowRemovedListeners.forEach((fn) => fn(id)), 0)
        return Promise.resolve()
      },
      onRemoved: { addListener: (fn) => windowRemovedListeners.push(fn) }
    },
    tabs: {
      query: (_query, cb) => {
        const tabs = Array.from(openTabs.values())
        if (cb) {
          cb(tabs)
          return undefined
        }
        return Promise.resolve(tabs)
      },
      sendMessage: (tabId, message) => {
        tabMessages.push({ tabId, message })
        return Promise.resolve()
      }
    }
  }

  return {
    localData,
    sessionData,
    openWindows,
    tabMessages,
    getBadgeText: () => badgeText,
    /** Registra una pestaña simulada (para verificar la difusión de eventos) */
    addTab: (id, url) => openTabs.set(id, { id, url }),
    /** Cierra una ventana simulada (dispara windows.onRemoved) */
    closeWindow: (id) => globalThis.chrome.windows.remove(id),
    /** Envía un mensaje al service worker y espera su respuesta */
    send(message, sender = {}, timeoutMs = 20000) {
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(
          () => rejectPromise(new Error(`Sin respuesta para ${message.type}`)),
          timeoutMs
        )
        const sendResponse = (response) => {
          clearTimeout(timer)
          resolvePromise(response)
        }
        for (const listener of messageListeners) {
          listener(message, sender, sendResponse)
        }
      })
    }
  }
}

/** Reportero de comprobaciones con salida por consola y resumen. */
export function createReporter() {
  const results = []
  let passed = 0
  let failed = 0

  return {
    check(name, condition, detail = '') {
      results.push({ name, ok: Boolean(condition), detail })
      if (condition) {
        passed++
        console.log(`  ✅ ${name}`)
      } else {
        failed++
        console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
      }
    },
    get passed() { return passed },
    get failed() { return failed },
    get results() { return results },
    summary() {
      console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} comprobaciones OK, ${failed} fallidas\n`)
      return failed === 0
    }
  }
}

/**
 * Servidor JSON-RPC mínimo que responde a `eth_chainId`, para probar el alta de
 * redes sin depender de una red real.
 */
export async function startFakeRpcServer(chainIdHex) {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const payload = JSON.parse(body || '{}')
      const requests = Array.isArray(payload) ? payload : [payload]
      const responses = requests.map((request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: request.method === 'eth_chainId' ? chainIdHex : '0x0'
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(Array.isArray(payload) ? responses : responses[0]))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) }
}
