/// <reference types="chrome"/>
/**
 * Aprobaciones DENTRO de la wallet: la conexión y la firma se muestran en el
 * mismo espacio que la página principal (el popup).
 *
 * Desde D-NW-9 la página se compone con el modelo de 10 bloques
 * (`DetalleAprobacion` + `utils/aprobacion`): origen, cuenta, red, acción,
 * detalles, consecuencias, avisos y datos técnicos.
 */
import { useEffect, useState } from 'react'
import type { ChainConfig } from '../types'
import { DetalleAprobacion } from './DetalleAprobacion'
import { describirConexion, describirFirma, type ContextoAprobacion } from '../utils/aprobacion'
import { acortarDireccion } from '../utils/formato'
import { cargarNivel, NIVEL_POR_DEFECTO, type NivelDetalle } from '../utils/preferencias'

export interface SolicitudConexion {
  requestId: number
  origin: string
  accounts: string[]
  currentAccountIndex: number
}

export interface SolicitudFirma {
  approvalId: number
  method: string
  params: unknown[]
  chainId: string
}

interface Props {
  conexion?: SolicitudConexion | null
  firma?: SolicitudFirma | null
  chains: ChainConfig[]
  /** Cuentas de la wallet (para etiquetar `Cuenta N`). */
  cuentas?: string[]
  /** Red activa en la wallet. */
  chainIdActivo: string
  redNombre: string
  onResponderConexion: (ok: boolean, account?: string, accountIndex?: number) => void
  onResponderFirma: (ok: boolean) => void
}

export function Aprobacion({
  conexion,
  firma,
  chains,
  cuentas = [],
  chainIdActivo,
  redNombre,
  onResponderConexion,
  onResponderFirma,
}: Props) {
  const [indice, setIndice] = useState(conexion?.currentAccountIndex ?? 0)
  const [nivel, setNivel] = useState<NivelDetalle>(NIVEL_POR_DEFECTO)

  useEffect(() => {
    void cargarNivel().then(setNivel)
  }, [])

  const ctx: ContextoAprobacion = { chains, cuentas, chainIdActivo, redNombre }

  // ── Conexión ─────────────────────────────────────────────────────────
  if (conexion) {
    const desc = describirConexion(conexion, ctx)
    return (
      <DetalleAprobacion
        desc={desc}
        nivel={nivel}
        onRechazar={() => onResponderConexion(false)}
        onAprobar={() => onResponderConexion(true, conexion.accounts[indice], indice)}
      >
        <p className="tk-muted" style={{ fontSize: 12, margin: 0 }}>
          Elige la cuenta que compartes con esta aplicación:
        </p>
        <ul className="tk-sitios">
          {conexion.accounts.map((acc, i) => (
            <li key={acc} className={`tk-sitio${i === indice ? ' tk-sitio--sel' : ''}`}>
              <button className="tk-sitio__info tk-aprobacion__cuenta" onClick={() => setIndice(i)}>
                <span className="tk-sitio__origen">Cuenta {i}</span>
                <span className="tk-sitio__cuenta">{acortarDireccion(acc)}</span>
              </button>
              <span aria-hidden>{i === indice ? '🔘' : '⚪'}</span>
            </li>
          ))}
        </ul>
      </DetalleAprobacion>
    )
  }

  // ── Firma / transacción / red ────────────────────────────────────────
  if (firma) {
    const desc = describirFirma(firma, ctx)
    return (
      <DetalleAprobacion
        desc={desc}
        nivel={nivel}
        onRechazar={() => onResponderFirma(false)}
        onAprobar={() => onResponderFirma(true)}
      />
    )
  }

  return null
}
