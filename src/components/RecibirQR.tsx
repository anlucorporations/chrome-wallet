/**
 * Panel "Recibir" (M2.1.4): muestra la dirección actual como QR y permite
 * copiarla. Solo presentación; no toca lógica de wallet ni de firma.
 */
import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export function RecibirQR({ address }: { address: string }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="tk-recibir">
      <div className="tk-recibir__qr">
        <QRCodeSVG value={address} size={148} bgColor="#ffffff" fgColor="#1a2b4c" level="M" />
      </div>
      <p className="tk-recibir__direccion tk-mono">{address}</p>
      <button className="tk-btn tk-recibir__copiar" onClick={() => void copiar()}>
        {copiado ? '✅ Copiada' : '📋 Copiar dirección'}
      </button>
      <p className="tk-muted" style={{ fontSize: 10, marginTop: 8 }}>
        Comparte esta dirección para recibir ETH o tokens en la red activa.
      </p>
    </div>
  )
}
