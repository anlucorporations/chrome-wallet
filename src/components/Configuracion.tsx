/**
 * Configuración (M6 · RF-WN-18..25, M6.1).
 *
 * Página hub con las cinco áreas del requerimiento —notificaciones, modo de
 * vista, redes, ayuda y perfil— que dan acceso a las sub-páginas de Redes y
 * Perfil. El modo de vista se guarda en `codecrypto_view_mode` y lo aplican el
 * side panel, la pestaña y el content script `floating.ts`. No toca la lógica
 * de firma/RPC/bóveda.
 */
import { useEffect, useState } from 'react'
import type { ChainConfig, LogEntry } from '../types'
import { Notificaciones } from './Notificaciones'
import { Redes } from './Redes'
import { Perfil } from './Perfil'

type Modo = 'panel' | 'pestana' | 'flotante'
type Vista = 'inicio' | 'redes' | 'perfil'

const CLAVE_MODO = 'codecrypto_view_mode'
const URL_AYUDA = 'https://truekeate-web-593453426217.europe-west1.run.app/help/manual'

const MODOS: { id: Modo; icono: string; titulo: string; texto: string }[] = [
  { id: 'panel', icono: '📊', titulo: 'Panel lateral', texto: 'Junto a la pestaña de la dApp.' },
  { id: 'pestana', icono: '🗂️', titulo: 'Pestaña', texto: 'Se abre como pestaña del navegador.' },
  { id: 'flotante', icono: '🪟', titulo: 'Flotante', texto: 'Botón y panel sobre la propia web.' },
]

interface Props {
  chainId: string
  chains: ChainConfig[]
  onSwitch: (chainId: string) => void
  onChainsChanged: (chains: ChainConfig[]) => void
  account: string
  logs: LogEntry[]
}

export function Configuracion({ chainId, chains, onSwitch, onChainsChanged, account, logs }: Props) {
  const [modo, setModo] = useState<Modo>('panel')
  const [vista, setVista] = useState<Vista>('inicio')
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

  // ── Sub-páginas ─────────────────────────────────────────────────────
  if (vista === 'redes') {
    return (
      <div className="tk-config">
        <button className="tk-volver" onClick={() => setVista('inicio')}>
          ← Configuración
        </button>
        <Redes
          chains={chains}
          activeChainId={chainId}
          onSwitch={onSwitch}
          onChainsChanged={onChainsChanged}
        />
      </div>
    )
  }
  if (vista === 'perfil') {
    return (
      <div className="tk-config">
        <button className="tk-volver" onClick={() => setVista('inicio')}>
          ← Configuración
        </button>
        <Perfil account={account} />
      </div>
    )
  }

  // ── Hub ─────────────────────────────────────────────────────────────
  return (
    <div className="tk-config">
      <h4 className="tk-config__area">Notificaciones</h4>
      <Notificaciones logs={logs} />

      <h4 className="tk-config__area">Modo de vista</h4>
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
      </div>
      {aviso && (
        <p className="tk-contactos__error" role="alert">
          {aviso}
        </p>
      )}

      <h4 className="tk-config__area">Red</h4>
      <p className="tk-muted" style={{ fontSize: 11, margin: 0 }}>
        Red actual: <strong>{chainId}</strong>
      </p>
      <button className="tk-btn tk-config__enlace" onClick={() => setVista('redes')}>
        🌐 Gestionar redes
      </button>

      <h4 className="tk-config__area">Ayuda</h4>
      <button
        className="tk-btn tk-config__enlace"
        onClick={() => void chrome.tabs.create({ url: URL_AYUDA })}
      >
        ❓ Abrir la ayuda de la plataforma
      </button>

      <h4 className="tk-config__area">Perfil</h4>
      <p className="tk-muted" style={{ fontSize: 11, margin: 0 }}>
        Cuenta: <span className="tk-mono">{account.slice(0, 6)}…{account.slice(-4)}</span>
      </p>
      <button className="tk-btn tk-config__enlace" onClick={() => setVista('perfil')}>
        👤 Abrir perfil
      </button>
    </div>
  )
}
