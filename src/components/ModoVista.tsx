/**
 * Modo de vista (M5 · RF-WN-20): panel lateral, pestaña o flotante.
 *
 * Se guarda en `codecrypto_view_mode` y lo aplican el side panel, la pestaña y
 * el content script `floating.ts`. Extraído del hub de Configuración para que
 * sea accesible directamente desde el menú del pie.
 */
import { useEffect, useState } from 'react'

type Modo = 'panel' | 'pestana' | 'flotante'

const CLAVE_MODO = 'codecrypto_view_mode'

const MODOS: { id: Modo; icono: string; titulo: string; texto: string }[] = [
  { id: 'panel', icono: '📊', titulo: 'Panel lateral', texto: 'Junto a la pestaña de la dApp.' },
  { id: 'pestana', icono: '🗂️', titulo: 'Pestaña', texto: 'Se abre como pestaña del navegador.' },
  { id: 'flotante', icono: '🪟', titulo: 'Flotante', texto: 'Botón y panel sobre la propia web.' },
]

export function ModoVista() {
  const [modo, setModo] = useState<Modo>('panel')
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE_MODO).then((s) => {
      const guardado = s[CLAVE_MODO] as Modo | undefined
      if (guardado) setModo(guardado)
    })
  }, [])

  const aplicar = async (m: Modo) => {
    setModo(m)
    setAviso(null)
    await chrome.storage.local.set({ [CLAVE_MODO]: m })
    try {
      if (m === 'panel') {
        const win = await chrome.windows.getCurrent()
        if (win.id !== undefined) {
          const sidePanel = (
            chrome as unknown as { sidePanel?: { open: (o: { windowId: number }) => Promise<void> } }
          ).sidePanel
          await sidePanel?.open({ windowId: win.id })
        }
      } else if (m === 'pestana') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
      }
      // "flotante": lo aplica el content script floating.js en las páginas.
    } catch (e) {
      setAviso(`No se pudo abrir el modo: ${(e as Error).message}`)
    }
  }

  return (
    <div className="tk-modos">
      {MODOS.map((m) => (
        <button
          key={m.id}
          className={`tk-modo${modo === m.id ? ' tk-modo--activo' : ''}`}
          onClick={() => void aplicar(m.id)}
          aria-pressed={modo === m.id}
        >
          <span className="tk-modo__icono" aria-hidden>
            {m.icono}
          </span>
          <span className="tk-modo__titulo">{m.titulo}</span>
          <span className="tk-modo__texto">{m.texto}</span>
        </button>
      ))}
      {aviso && (
        <p className="tk-contactos__error" role="alert">
          {aviso}
        </p>
      )}
    </div>
  )
}
