/**
 * Panel "Contactos" (M2.1.4): libreta de direcciones guardadas del usuario.
 *
 * Se almacena en `chrome.storage.local` bajo `codecrypto_contacts`. Es una
 * función de la propia wallet (no RPC ni firma): no altera la lógica existente.
 */
import { useCallback, useEffect, useState } from 'react'

interface Contacto {
  nombre: string
  direccion: string
}

const CLAVE = 'codecrypto_contacts'
const RE_DIRECCION = /^0x[a-fA-F0-9]{40}$/

export function Contactos() {
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE).then((s) => {
      setContactos((s[CLAVE] as Contacto[]) || [])
    })
  }, [])

  const guardar = useCallback(async (lista: Contacto[]) => {
    setContactos(lista)
    await chrome.storage.local.set({ [CLAVE]: lista })
  }, [])

  const agregar = () => {
    const dir = direccion.trim()
    if (!nombre.trim()) {
      setError('Ponle un nombre al contacto.')
      return
    }
    if (!RE_DIRECCION.test(dir)) {
      setError('Dirección inválida (0x + 40 caracteres hex).')
      return
    }
    if (contactos.some((c) => c.direccion.toLowerCase() === dir.toLowerCase())) {
      setError('Esa dirección ya está guardada.')
      return
    }
    void guardar([...contactos, { nombre: nombre.trim(), direccion: dir.toLowerCase() }])
    setNombre('')
    setDireccion('')
    setError(null)
  }

  return (
    <div className="tk-contactos">
      <div className="tk-contactos__form">
        <input
          className="tk-input"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          className="tk-input tk-mono"
          placeholder="0x…"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
        />
        <button className="tk-btn" onClick={agregar}>
          ➕ Guardar
        </button>
      </div>
      {error && (
        <p className="tk-contactos__error" role="alert">
          {error}
        </p>
      )}

      {contactos.length === 0 ? (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Aún no tienes direcciones guardadas.
        </p>
      ) : (
        <ul className="tk-sitios">
          {contactos.map((c) => (
            <li key={c.direccion} className="tk-sitio">
              <div className="tk-sitio__info">
                <span className="tk-sitio__origen">{c.nombre}</span>
                <span className="tk-sitio__cuenta">{c.direccion}</span>
              </div>
              <button
                className="tk-sitio__desconectar"
                title={`Eliminar ${c.nombre}`}
                onClick={() => void guardar(contactos.filter((x) => x.direccion !== c.direccion))}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
