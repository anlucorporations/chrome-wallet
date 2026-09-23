/// <reference types="chrome"/>
/**
 * Overlay flotante (M5 · RF-WN-16).
 *
 * Si el modo de vista elegido en Configuración es «flotante», inyecta un botón y
 * un panel (iframe con la misma UI de la wallet) sobre la página de la dApp.
 * Se aísla con Shadow DOM para no chocar con los estilos del sitio y reacciona
 * a los cambios de modo en `chrome.storage.local`.
 *
 * Solo presentación: no toca la lógica de la wallet (el iframe es la propia
 * página index.html de la extensión).
 */
const CLAVE_MODO = 'codecrypto_view_mode'
const HOST_ID = 'codecrypto-floating-host'

let host: HTMLElement | null = null

const ESTILOS = `
  :host { all: initial; }
  #cc-btn {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147483646;
    width: 48px; height: 48px; border-radius: 9999px; border: 0; cursor: pointer;
    background: linear-gradient(135deg, #1a2b4c 0%, #2a9d8f 100%); color: #fff;
    font-size: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
  }
  #cc-btn:hover { filter: brightness(1.1); }
  #cc-panel {
    position: fixed; right: 18px; bottom: 76px; z-index: 2147483647;
    width: 380px; height: 600px; max-height: calc(100vh - 100px); display: none;
    background: #fff; border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 48px rgba(0,0,0,.4); border: 1px solid rgba(26,43,76,.12);
  }
  #cc-panel.abierto { display: flex; flex-direction: column; }
  #cc-barra {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: #1a2b4c; color: #fff;
    font-family: Inter, -apple-system, sans-serif; font-size: 12px; font-weight: 600;
  }
  #cc-cerrar { border: 0; background: rgba(255,255,255,.15); color: #fff; border-radius: 8px; cursor: pointer; padding: 2px 8px; }
  #cc-frame { flex: 1; border: 0; width: 100%; background: #f8f9fa; }
`

function crear(): void {
  if (document.getElementById(HOST_ID)) return
  host = document.createElement('div')
  host.id = HOST_ID
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const estilo = document.createElement('style')
  estilo.textContent = ESTILOS
  shadow.appendChild(estilo)

  const boton = document.createElement('button')
  boton.id = 'cc-btn'
  boton.type = 'button'
  boton.title = 'TrueKeate Wallet'
  boton.setAttribute('aria-label', 'Abrir TrueKeate Wallet')
  boton.textContent = '🔐'
  shadow.appendChild(boton)

  const panel = document.createElement('div')
  panel.id = 'cc-panel'
  panel.innerHTML = `
    <div id="cc-barra">
      <span>TrueKeate Wallet</span>
      <button id="cc-cerrar" type="button" aria-label="Cerrar">✕</button>
    </div>
    <iframe id="cc-frame" title="TrueKeate Wallet" src="${chrome.runtime.getURL('index.html')}"></iframe>
  `
  shadow.appendChild(panel)

  const alternar = () => panel.classList.toggle('abierto')
  boton.addEventListener('click', alternar)
  panel.querySelector('#cc-cerrar')?.addEventListener('click', () => panel.classList.remove('abierto'))
}

function quitar(): void {
  host?.remove()
  host = null
}

async function aplicarModo(): Promise<void> {
  try {
    const guardado = await chrome.storage.local.get(CLAVE_MODO)
    if (guardado[CLAVE_MODO] === 'flotante') crear()
    else quitar()
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

void aplicarModo()
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios[CLAVE_MODO]) void aplicarModo()
})
