/**
 * Comprar (M2.1.4 · placeholder guiado, D-NW-2).
 *
 * No hay proveedor on-ramp integrado (requiere claves de terceros), así que el
 * panel guía al usuario: compra en la sección VALOR de la plataforma o recibe
 * cripto desde un exchange a su propia dirección (QR). Acciones reales, sin
 * simular una compra que no existe.
 */
import { RecibirQR } from './RecibirQR'

const URL_VALOR = 'https://truekeate-web-593453426217.europe-west1.run.app/suite/valor'

export function Comprar({ account }: { account: string }) {
  return (
    <div className="tk-comprar">
      <p className="tk-muted" style={{ fontSize: 11, marginTop: 0 }}>
        La compra con tarjeta/transferencia se gestiona en la plataforma. Aquí puedes ir a la
        sección de valor o recibir cripto en tu dirección.
      </p>
      <button
        className="tk-btn tk-config__enlace"
        onClick={() => void chrome.tabs.create({ url: URL_VALOR })}
      >
        🛒 Ir a comprar en TrueKeate
      </button>
      <p className="tk-muted" style={{ fontSize: 10, marginBottom: 0 }}>
        ¿Compras en un exchange? Envía los fondos a esta dirección:
      </p>
      <RecibirQR address={account} />
    </div>
  )
}
