/**
 * Perfil (M6 · RF-WN-24/25): cuenta, apariencia, respaldo de la frase, cambio de
 * clave de bloqueo y backup exportable/restaurable de la bóveda.
 *
 * Todo pasa por métodos de la bóveda (solo extensión). El respaldo de la frase
 * y el cambio de clave exigen la bóveda desbloqueada; el backup exporta la
 * bóveda CIFRADA (nunca la frase en claro).
 */
import { useEffect, useState } from 'react'
import { sendRPCToBackground } from '../utils/rpc'
import {
  cargarNivel,
  guardarNivel,
  NIVEL_POR_DEFECTO,
  NIVELES,
  type NivelDetalle,
} from '../utils/preferencias'

const CLAVE_TEMA = 'codecrypto_theme'

export function Perfil({ account }: { account: string }) {
  const [oscuro, setOscuro] = useState(false)
  const [nivel, setNivel] = useState<NivelDetalle>(NIVEL_POR_DEFECTO)
  const [frase, setFrase] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [passBackup, setPassBackup] = useState('')

  useEffect(() => {
    void chrome.storage.local.get(CLAVE_TEMA).then((s) => {
      const dark = s[CLAVE_TEMA] === 'dark'
      setOscuro(dark)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    })
    void cargarNivel().then(setNivel)
  }, [])

  const cambiarNivel = async (n: NivelDetalle) => {
    setNivel(n)
    await guardarNivel(n)
  }

  const alternarTema = async () => {
    const nuevo = !oscuro
    setOscuro(nuevo)
    document.documentElement.dataset.theme = nuevo ? 'dark' : 'light'
    await chrome.storage.local.set({ [CLAVE_TEMA]: nuevo ? 'dark' : 'light' })
  }

  const revelar = async () => {
    setAviso(null)
    setCargando(true)
    try {
      setFrase(await sendRPCToBackground<string>('wallet_revealMnemonic'))
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const cambiarClave = async () => {
    setAviso(null)
    if (nueva.length < 8) {
      setAviso('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== repetir) {
      setAviso('Las contraseñas nuevas no coinciden.')
      return
    }
    setCargando(true)
    try {
      await sendRPCToBackground('wallet_changeVaultPassword', [actual, nueva])
      setAviso('✅ Clave de bloqueo actualizada.')
      setActual('')
      setNueva('')
      setRepetir('')
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const descargarBackup = async () => {
    setAviso(null)
    try {
      const boveda = await sendRPCToBackground<Record<string, unknown>>('wallet_exportVault')
      const blob = new Blob([JSON.stringify(boveda, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = 'TrueKeateWallet-backup.json'
      enlace.click()
      URL.revokeObjectURL(url)
      setAviso('✅ Backup descargado (bóveda cifrada).')
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  const restaurar = async (archivo: File) => {
    setAviso(null)
    try {
      const boveda = JSON.parse(await archivo.text())
      await sendRPCToBackground('wallet_importVault', [boveda, passBackup])
      setAviso('✅ Bóveda restaurada desde el backup.')
      setPassBackup('')
    } catch (e) {
      setAviso(`No se pudo restaurar: ${(e as Error).message}`)
    }
  }

  return (
    <div className="tk-perfil">
      <h4 className="tk-config__area">Cuenta</h4>
      <p className="tk-mono" style={{ fontSize: 10, wordBreak: 'break-all', margin: 0 }}>
        {account}
      </p>

      <h4 className="tk-config__area">Apariencia</h4>
      <label className="tk-switch">
        <input type="checkbox" checked={oscuro} onChange={() => void alternarTema()} />
        <span>🌙 Modo oscuro</span>
      </label>

      <h4 className="tk-config__area">Detalle de las firmas</h4>
      <div className="tk-modos">
        {NIVELES.map((n) => (
          <button
            key={n.id}
            className={`tk-modo${nivel === n.id ? ' tk-modo--activo' : ''}`}
            onClick={() => void cambiarNivel(n.id)}
            aria-pressed={nivel === n.id}
          >
            <span className="tk-modo__titulo">{n.titulo}</span>
            <span className="tk-modo__texto">{n.texto}</span>
          </button>
        ))}
      </div>

      <h4 className="tk-config__area">Respaldo de la frase</h4>
      {frase ? (
        <>
          <p className="tk-warning" style={{ marginTop: 4 }}>
            <strong>Nunca compartas esta frase.</strong> Quien la tenga controla tus fondos.
          </p>
          <p className="tk-mono tk-perfil__frase">{frase}</p>
          <button className="tk-btn" onClick={() => setFrase(null)}>
            Ocultar
          </button>
        </>
      ) : (
        <button className="tk-btn" onClick={() => void revelar()} disabled={cargando}>
          {cargando ? '⏳ Verificando…' : '👁️ Mostrar frase de recuperación'}
        </button>
      )}

      <h4 className="tk-config__area">Cambiar clave de bloqueo</h4>
      <input
        className="tk-input"
        type="password"
        placeholder="Contraseña actual"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
      />
      <input
        className="tk-input"
        type="password"
        placeholder="Nueva contraseña (mín. 8)"
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
      />
      <input
        className="tk-input"
        type="password"
        placeholder="Repite la nueva"
        value={repetir}
        onChange={(e) => setRepetir(e.target.value)}
      />
      <button className="tk-btn tk-config__enlace" onClick={() => void cambiarClave()} disabled={cargando}>
        🔑 Cambiar clave
      </button>

      <h4 className="tk-config__area">Backup de la bóveda</h4>
      <button className="tk-btn tk-config__enlace" onClick={() => void descargarBackup()}>
        ⬇️ Descargar backup (cifrado)
      </button>
      <input
        className="tk-input"
        type="password"
        placeholder="Contraseña del backup"
        value={passBackup}
        onChange={(e) => setPassBackup(e.target.value)}
      />
      <label className="tk-backup">
        <span>⬆️ Restaurar backup (.json)</span>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void restaurar(f)
          }}
        />
      </label>
      <p className="tk-muted" style={{ fontSize: 10, margin: 0 }}>
        El backup contiene la bóveda <strong>cifrada</strong>: para restaurarla hace falta tu
        contraseña.
      </p>

      {aviso && (
        <p className="tk-contactos__error" role="alert">
          {aviso}
        </p>
      )}
    </div>
  )
}
