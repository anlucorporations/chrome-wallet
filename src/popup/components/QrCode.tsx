/**
 * M41 (soporte) — `src/popup/components/QrCode.tsx`
 * Pintado del QR de recepción a partir de la matriz que produce el codificador LOCAL.
 *
 * El codificador es el módulo NORMATIVO `src/shared/qr.ts` (M63, `plan_desarrollo.md` §3.2.4
 * tarea 2.8): sin red, sin dependencias remotas (RNF-20 / RT-03) y sin criptografía (RNF-14).
 * La copia `src/popup/qr.ts` que existía como respaldo se ha **eliminado**: dos codificadores
 * en el mismo repositorio podían divergir.
 *
 * El símbolo se dibuja como una rejilla de módulos con dos tokens de color y el módulo claro
 * como fondo; el contraste queda garantizado por la matriz cerrada de `identidad_visual.md` §2.4.
 * Accesibilidad: la figura lleva `role="img"` y una etiqueta en español con la dirección
 * completa, de modo que el QR nunca es la única forma de obtener el dato.
 */

import type { JSX } from 'react';
import { encodeQr } from '../../shared/qr';

/** Props del QR. */
export interface QrCodeProps {
  /** Cadena que se codifica (la dirección de recepción). */
  value: string;
  /** Etiqueta accesible de la figura. */
  label: string;
  /** Lado del símbolo en píxeles. */
  size?: number;
}

/** QR local de la dirección de recepción. */
export function QrCode({ value, label, size = 168 }: QrCodeProps): JSX.Element {
  const encoded = encodeQr(value);
  if (!encoded.ok) {
    return (
      <p className="tk-status tk-status--warning" role="status">
        No se pudo generar el código QR de esta dirección; usa el botón «Copiar» para obtenerla.
      </p>
    );
  }
  const { modules: matrix, size: moduleCount } = encoded.qr;
  const columns = `repeat(${moduleCount}, 1fr)`;

  return (
    /*
     * H6 · accesibilidad: `role="img"` NO es un rol admitido en `<figure>` (axe-core lo marca con
     * `aria-allowed-role`, RNF-21), así que el QR se declara como lo que es: una `<figure>` con su
     * `figcaption` visible y el valor de la dirección en el nombre accesible del propio QR.
     */
    <figure className="tk-qr" aria-label={`${label}: ${value}`}>
      <div
        className="tk-qr__grid"
        style={{ width: `${size}px`, height: `${size}px`, gridTemplateColumns: columns }}
        aria-hidden="true"
      >
        {matrix.flatMap((row, rowIndex) =>
          row.map((dark, colIndex) => (
            <span
              key={`${rowIndex}-${colIndex}`}
              className={dark ? 'tk-qr__module tk-qr__module--dark' : 'tk-qr__module'}
            />
          )),
        )}
      </div>
      <figcaption className="tk-qr__caption">{label}</figcaption>
    </figure>
  );
}
