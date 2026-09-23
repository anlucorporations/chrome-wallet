/**
 * Catálogo de avisos de las aprobaciones (RF-WN-53 · AV-01..AV-12).
 *
 * Cada aviso tiene severidad `info` | `atencion` | `peligro` y un texto fijo.
 * Los textos son del proyecto (no editables por el usuario, decisión D6).
 */
export type Severidad = 'info' | 'atencion' | 'peligro'

export interface Aviso {
  id: string
  severidad: Severidad
  texto: string
}

export const AVISOS = {
  /** AV-01 · Mensaje EIP-191 binario/no legible. */
  binario: (): Aviso => ({
    id: 'AV-01',
    severidad: 'peligro',
    texto: 'No podemos mostrar qué firmas: el mensaje no es texto legible.',
  }),
  /** AV-02 · Firma de datos que autorizan gasto. */
  permisoDeGasto: (): Aviso => ({
    id: 'AV-02',
    severidad: 'peligro',
    texto: 'Esta firma puede autorizar el gasto de tus tokens sin otra confirmación.',
  }),
  /** AV-03 · Envío de fondos a contrato no verificado. */
  contratoDesconocido: (): Aviso => ({
    id: 'AV-03',
    severidad: 'peligro',
    texto: 'Vas a enviar fondos a una dirección de contrato que la wallet no reconoce.',
  }),
  /** AV-04 · approve sin límite. */
  approveIlimitado: (): Aviso => ({
    id: 'AV-04',
    severidad: 'peligro',
    texto: 'Autorizas un gasto ILIMITADO de tus tokens.',
  }),
  /** AV-05 · Sitio inseguro / origen no confiable. */
  origenInseguro: (): Aviso => ({
    id: 'AV-05',
    severidad: 'peligro',
    texto: 'El sitio no usa HTTPS: la petición podría no venir de donde dice.',
  }),
  /** AV-06 · Acción TrueKeate con marca de tiempo antigua. */
  accionAntigua: (minutos: number): Aviso => ({
    id: 'AV-06',
    severidad: 'atencion',
    texto: `La acción se emitió hace unos ${minutos} min; podría ser una repetición.`,
  }),
  /** AV-07 · Red del mensaje distinta de la red activa. */
  redDistinta: (esperada: string, actual: string): Aviso => ({
    id: 'AV-07',
    severidad: 'atencion',
    texto: `El mensaje es para la red ${esperada}, pero estás en ${actual}.`,
  }),
  /** AV-08 · Tarifa de gas elevada. */
  gasAlto: (veces: number): Aviso => ({
    id: 'AV-08',
    severidad: 'atencion',
    texto: `La tarifa de red parece alta (unas ${veces}× lo habitual).`,
  }),
  /** AV-09 · Red de prueba o personalizada. */
  redNoPrincipal: (): Aviso => ({
    id: 'AV-09',
    severidad: 'atencion',
    texto: 'Estás operando en una red de prueba o personalizada.',
  }),
  /** AV-10 · Firma sin coste. */
  sinCoste: (): Aviso => ({
    id: 'AV-10',
    severidad: 'info',
    texto: 'Firmar no cuesta gas ni mueve fondos.',
  }),
  /** AV-11 · Transacción irreversible. */
  irreversible: (): Aviso => ({
    id: 'AV-11',
    severidad: 'info',
    texto: 'Una vez confirmada en la red, la transacción no se puede revertir.',
  }),
  /** AV-12 · Datos no decodificables. */
  datosNoLegibles: (): Aviso => ({
    id: 'AV-12',
    severidad: 'info',
    texto: 'No podemos interpretar los datos de esta llamada.',
  }),
} as const

/** Avisos ordenados por severidad (peligro primero). */
export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  const peso: Record<Severidad, number> = { peligro: 0, atencion: 1, info: 2 }
  return [...avisos].sort((a, b) => peso[a.severidad] - peso[b.severidad])
}

/** ¿Hay algún aviso de peligro? (para la confirmación extra, decisión D5). */
export function tienePeligro(avisos: Aviso[]): boolean {
  return avisos.some((a) => a.severidad === 'peligro')
}
