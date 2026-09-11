/**
 * M39 — `src/popup/App.tsx`
 * Popup 380×600 en ESTADO VACÍO (H1: todavía no existe cartera).
 *
 * Contenido de bienvenida en español:
 * - isologo `brand/truekeate-mark-96.png`;
 * - título «TrueKeate Wallet»;
 * - texto de bienvenida;
 * - tagline de marca `PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS`;
 * - llamada a la acción «Crear cartera», todavía SIN lógica (H2 la implementa).
 *
 * RNF-14: este fichero NO importa `ethers` (ni ningún módulo del Service Worker). El
 * bundle de `ethers` vive solo en el SW; el popup es solo React + estilos.
 */

import { useState, type JSX } from 'react';
import '../styles/tokens.css';
import '../styles/base.css';

/** Tagline literal de marca (identidad_visual.md §1 y §8). */
export const TAGLINE = 'PRODUCTOS | SERVICIOS | CRIPTOACTIVOS TOKENIZADOS';

/** Ruta pública del isologo de 96 px. */
const MARK_SRC = 'brand/truekeate-mark-96.png';

/**
 * Pantalla de bienvenida del popup. El botón «Crear cartera» aún no tiene lógica: al
 * pulsarlo se muestra un aviso de que la creación de cartera llega en el hito H2.
 */
export function App(): JSX.Element {
  const [noticeVisible, setNoticeVisible] = useState(false);

  return (
    <div className="tk-window tk-popup">
      <header className="tk-header">
        <h1 className="tk-header__title">TrueKeate Wallet</h1>
        <img className="tk-header__mark" src={MARK_SRC} alt="" aria-hidden="true" />
      </header>

      <main className="tk-main tk-empty">
        <img className="tk-empty__mark" src={MARK_SRC} alt="Isologo de TrueKeate" />
        <h2 className="tk-empty__title">TrueKeate Wallet</h2>
        <p className="tk-empty__text">
          Bienvenido a tu cartera de criptoactivos tokenizados. Todavía no hay ninguna
          cartera en este navegador: créala con una frase de recuperación de 12 palabras o
          importa una cuenta.
        </p>
        <p className="tk-tagline">{TAGLINE}</p>

        <button
          type="button"
          className="tk-btn-primary"
          onClick={() => {
            setNoticeVisible(true);
          }}
        >
          Crear cartera
        </button>

        {noticeVisible ? (
          <p className="tk-notice" role="status">
            La creación de cartera se implementa en el hito H2 (cartera, cuentas y
            recuperación). Todavía no hay nada que guardar.
          </p>
        ) : null}

        <p className="tk-pending">Aplicación en construcción · H1 (andamiaje)</p>
      </main>
    </div>
  );
}

export default App;
