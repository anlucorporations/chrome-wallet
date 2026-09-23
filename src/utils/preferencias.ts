/**
 * Nivel de detalle de las páginas de aprobación (RF-WN-55 · decisión D2).
 * Se guarda en `chrome.storage.local` y lo aplica `DetalleAprobacion`.
 */
export type NivelDetalle = 'basico' | 'completo' | 'experto'

export const CLAVE_NIVEL = 'codecrypto_nivel_detalle'
export const NIVEL_POR_DEFECTO: NivelDetalle = 'completo'

export const NIVELES: { id: NivelDetalle; titulo: string; texto: string }[] = [
  { id: 'basico', titulo: 'Básico', texto: 'Origen, cuenta, red y acción.' },
  { id: 'completo', titulo: 'Completo', texto: 'Añade detalles, coste y avisos.' },
  { id: 'experto', titulo: 'Experto', texto: 'Muestra también los datos técnicos.' },
]

export function esNivel(v: unknown): v is NivelDetalle {
  return v === 'basico' || v === 'completo' || v === 'experto'
}

export async function cargarNivel(): Promise<NivelDetalle> {
  const s = await chrome.storage.local.get(CLAVE_NIVEL)
  return esNivel(s[CLAVE_NIVEL]) ? s[CLAVE_NIVEL] : NIVEL_POR_DEFECTO
}

export async function guardarNivel(nivel: NivelDetalle): Promise<void> {
  await chrome.storage.local.set({ [CLAVE_NIVEL]: nivel })
}
