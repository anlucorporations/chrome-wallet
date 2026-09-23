/// <reference types="chrome"/>
import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import ChainManager from './components/ChainManager'
import LogsPanel from './components/LogsPanel'
import TransferSection from './components/TransferSection'
import WalletSetup from './components/WalletSetup'
import { RecibirQR } from './components/RecibirQR'
import { Contactos } from './components/Contactos'
import { Comprar } from './components/Comprar'
import { Cambiar } from './components/Cambiar'
import { Caracteristicas } from './components/Caracteristicas'
import { Configuracion } from './components/Configuracion'
import { Redes } from './components/Redes'
import { Perfil } from './components/Perfil'
import { ModoVista } from './components/ModoVista'
import { Notificaciones } from './components/Notificaciones'
import { Aprobacion, type SolicitudConexion, type SolicitudFirma } from './components/Aprobacion'
import { Inicio } from './components/Inicio'
import { Pagina } from './components/Pagina'
import { VaultPassword } from './components/VaultPassword'
import { VaultUnlock } from './components/VaultUnlock'
import { formatWeiToEth, parseEthToWei } from './utils/amount'
import { LOCAL_CHAIN_ID, iconoRed, mergeChains } from './utils/chains'
import {
  MAX_LOG_ENTRIES,
  appendLog,
  clearLogs,
  createLogEntry,
  isSameEntry,
  loadLogs
} from './utils/logs'
import { notifyWalletReset, sendRPCToBackground } from './utils/rpc'
import { walletKeysToReset } from './utils/storage'
import type { ChainConfig, LogEntry, LogMessage, LogType } from './types'

/**
 * Popup principal de la wallet.
 *
 * Es solo interfaz: no importa ethers ni maneja claves. Toda la criptografía
 * (derivación de cuentas, firmas y envío de transacciones) ocurre en el service
 * worker, al que se piden las operaciones por RPC.
 */

/** Páginas internas de la wallet (rediseño: navegación por páginas). */
type Vista =
  | 'inicio'
  | 'cuenta'
  | 'balance'
  | 'recibir'
  | 'enviar'
  | 'comprar'
  | 'cambiar'
  | 'contactos'
  | 'red'
  | 'caracteristicas'
  | 'configuracion'
  | 'conexiones'
  | 'notificaciones'
  | 'redes'
  | 'perfil'
  | 'modo-vista'

/** Ayuda de la plataforma (menú Configuración del pie). */
const URL_AYUDA = 'https://truekeate-web-593453426217.europe-west1.run.app/help/manual'

/** Abrevia una dirección para mostrarla (0x1234…abcd). */
function acortarDireccion(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

function App() {
  const [isWalletLoaded, setIsWalletLoaded] = useState(false)
  const [accounts, setAccounts] = useState<string[]>([])
  const [currentAccountIndex, setCurrentAccountIndex] = useState(0)
  const [balance, setBalance] = useState('0')
  const [balanceWei, setBalanceWei] = useState<bigint>(0n)
  const [chainId, setChainId] = useState(LOCAL_CHAIN_ID)
  const [chains, setChains] = useState<ChainConfig[]>(() => mergeChains([]))
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  /** dApps autorizadas (origen → cuenta) para el pie y la ficha Conexiones. */
  const [sitiosConectados, setSitiosConectados] = useState<Record<string, string>>({})
  /** Página activa (rediseño: navegación por páginas). */
  const [vista, setVista] = useState<Vista>('inicio')
  /** Menú desplegable del pie (Configuración: Perfil, Redes, Ayuda). */
  const [menuConfig, setMenuConfig] = useState(false)
  /** Solicitudes pendientes: se atienden DENTRO de la wallet. */
  const [solicitudConexion, setSolicitudConexion] = useState<SolicitudConexion | null>(null)
  const [solicitudFirma, setSolicitudFirma] = useState<SolicitudFirma | null>(null)
  /** Estado de la bóveda cifrada: si existe y si está abierta. */
  const [boveda, setBoveda] = useState<{
    existe: boolean
    desbloqueada: boolean
    migracionPendiente: boolean
  } | null>(null)
  /** Frase pendiente de cifrar (aún no se ha escrito en disco). */
  const [pendienteCifrar, setPendienteCifrar] = useState<string | null>(null)

  const bootstrapped = useRef(false)

  // ── Bus de logs ─────────────────────────────────────────────────────
  const addLog = useCallback((type: LogType, content: string, source = 'wallet') => {
    const entry = createLogEntry(type, content, source)
    setLogs((prev) => [...prev, entry].slice(-MAX_LOG_ENTRIES))
    void appendLog(entry)
  }, [])

  // Historial guardado + entradas que publica el service worker (actividad de dApps)
  useEffect(() => {
    void loadLogs().then((stored) => setLogs(stored.slice(-MAX_LOG_ENTRIES)))

    const listener = (message: unknown) => {
      const msg = message as LogMessage
      if (msg?.type !== 'CODECRYPTO_LOG' || !msg.entry) return
      setLogs((prev) => {
        if (isSameEntry(prev[prev.length - 1], msg.entry)) return prev
        return [...prev, msg.entry].slice(-MAX_LOG_ENTRIES)
      })
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const handleClearLogs = useCallback(async () => {
    await clearLogs()
    setLogs([])
  }, [])

  // ── Redes ───────────────────────────────────────────────────────────
  const refreshChains = useCallback(async () => {
    try {
      const list = await sendRPCToBackground<ChainConfig[]>('wallet_getChains')
      if (Array.isArray(list) && list.length > 0) setChains(list)
    } catch (error) {
      console.error('No se pudieron cargar las redes:', error)
    }
  }, [])

  // ── Carga de la wallet ──────────────────────────────────────────────
  const applyWallet = useCallback(async (
    phrase: string,
    options?: { accountIndex?: number; chainId?: string; persist?: boolean }
  ) => {
    const normalized = phrase.trim().replace(/\s+/g, ' ').toLowerCase()
    if (normalized.split(' ').length !== 12) {
      throw new Error('La frase debe tener exactamente 12 palabras')
    }

    const derived = await sendRPCToBackground<string[]>('wallet_deriveAccounts', [normalized, 5])
    const index = options?.accountIndex ?? 0
    const activeChain = options?.chainId || chainId

    setAccounts(derived)
    setCurrentAccountIndex(index)
    setChainId(activeChain)
    setIsWalletLoaded(true)
    setIsLoading(false)

    if (options?.persist !== false) {
      // La frase NO se guarda aquí: su sitio es la bóveda cifrada. En disco
      // solo quedan datos públicos (direcciones, índice y red).
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          codecrypto_accounts: derived,
          codecrypto_current_account: index.toString(),
          codecrypto_chain_id: activeChain
        }, () => resolve())
      })
      await chrome.storage.local.remove('codecrypto_mnemonic')
      addLog('event', `Wallet guardada · ${derived.length} cuentas derivadas`, 'wallet')
    }
  }, [chainId, addLog])

  /** Carga cuentas ya derivadas desde el almacenamiento (sin mnemonic). */
  const cargarCuentasGuardadas = useCallback(async () => {
    const guardado = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(
        ['codecrypto_accounts', 'codecrypto_current_account', 'codecrypto_chain_id'],
        (result) => resolve(result)
      )
    })
    const cuentas = (guardado.codecrypto_accounts as string[]) || []
    if (!cuentas.length) return false
    setAccounts(cuentas)
    setCurrentAccountIndex(parseInt((guardado.codecrypto_current_account as string) || '0'))
    setChainId((guardado.codecrypto_chain_id as string) || LOCAL_CHAIN_ID)
    setIsWalletLoaded(true)
    setIsLoading(false)
    return true
  }, [])

  /** Bloquea la wallet: se olvida la clave y se pide la contraseña. */
  const bloquearWallet = useCallback(async () => {
    await sendRPCToBackground('wallet_lock')
    setBoveda((b) => (b ? { ...b, desbloqueada: false } : b))
    setIsWalletLoaded(false)
    addLog('event', 'Wallet bloqueada', 'wallet')
  }, [addLog])

  /** Aviso de migración: pasa la frase heredada en claro al paso de contraseña. */
  const migrarBoveda = useCallback(async () => {
    const datos = await new Promise<Record<string, unknown>>((resolve) =>
      chrome.storage.local.get('codecrypto_mnemonic', (r) => resolve(r))
    )
    const frase = datos.codecrypto_mnemonic as string | undefined
    if (frase) setPendienteCifrar(frase)
  }, [])

  const handleLoadWallet = useCallback(
    async (phrase: string) => {
      // Sin bóveda todavía: primero se pide la contraseña y se cifra la frase.
      if (!boveda?.existe) {
        setPendienteCifrar(phrase)
        return
      }
      await applyWallet(phrase, { persist: true })
    },
    [applyWallet, boveda]
  )

  // Arranque: redes + wallet guardada (solo la primera vez)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const bootstrap = async () => {
      await refreshChains()
      try {
        // Bóveda primero: si existe y está cerrada, se pide la contraseña y no
        // se toca ninguna frase. Si está abierta, las cuentas ya están en disco.
        const estado = await sendRPCToBackground<{
          existe: boolean
          desbloqueada: boolean
          migracionPendiente: boolean
        }>('wallet_vaultStatus')
        setBoveda(estado)

        if (estado.existe) {
          if (estado.desbloqueada) await cargarCuentasGuardadas()
          setIsLoading(false)
          return
        }

        // Compatibilidad: wallet creada antes de existir la bóveda.
        const stored = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get([
            'codecrypto_mnemonic',
            'codecrypto_current_account',
            'codecrypto_chain_id'
          ], (result) => resolve(result))
        })

        const savedMnemonic = stored.codecrypto_mnemonic as string | undefined
        if (!savedMnemonic) {
          setIsLoading(false)
          return
        }

        await applyWallet(savedMnemonic, {
          accountIndex: parseInt((stored.codecrypto_current_account as string) || '0'),
          chainId: (stored.codecrypto_chain_id as string) || LOCAL_CHAIN_ID,
          persist: false
        })
      } catch (error) {
        addLog('error', `No se pudo cargar la wallet: ${(error as Error).message}`)
        setIsLoading(false)
      }
    }

    void bootstrap()
    // El guardia `bootstrapped` garantiza que el arranque ocurra una sola vez,
    // aunque las dependencias cambien (p. ej. al cambiar de red)
  }, [addLog, applyWallet, refreshChains, cargarCuentasGuardadas])

  // ── Balance (sondeo cada 5 s) ───────────────────────────────────────
  const updateBalance = useCallback(async () => {
    if (!isWalletLoaded || !accounts.length) return

    try {
      const balanceHex = await sendRPCToBackground<string>('eth_getBalance', [accounts[currentAccountIndex], 'latest'])
      // Se guarda el wei exacto (bigint) para validar el saldo y el formato
      // legible para mostrarlo; nada de Number() que perdería precisión.
      const wei = BigInt(balanceHex)
      setBalanceWei(wei)
      setBalance(formatWeiToEth(wei))
    } catch (error) {
      // Silenciar errores de sondeo (el nodo puede estar apagado)
      console.error('Error actualizando balance:', error)
    }
  }, [isWalletLoaded, accounts, currentAccountIndex])

  useEffect(() => {
    if (!isWalletLoaded || !accounts.length) return

    void updateBalance()
    const interval = setInterval(() => void updateBalance(), 5000)

    return () => clearInterval(interval)
  }, [isWalletLoaded, accounts, currentAccountIndex, chainId, updateBalance])

  // ── dApps conectadas (M2.1.7) ───────────────────────────────────────
  useEffect(() => {
    if (!isWalletLoaded) return
    const cargarSitios = async () => {
      try {
        const sitios = await sendRPCToBackground<Record<string, string>>('wallet_getConnectedSites')
        setSitiosConectados(sitios || {})
      } catch {
        setSitiosConectados({})
      }
    }
    void cargarSitios()
    // Mantener el pie en vivo cuando una dApp se conecta o se desconecta.
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'local' || !changes.codecrypto_connected_sites) return
      setSitiosConectados(
        (changes.codecrypto_connected_sites.newValue as Record<string, string>) || {}
      )
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [isWalletLoaded])

  const desconectarSitio = useCallback(
    async (origen: string) => {
      try {
        const sitios = await sendRPCToBackground<Record<string, string>>(
          'wallet_disconnectSite',
          [origen]
        )
        setSitiosConectados(sitios || {})
        addLog('event', `Desconectada dApp ${origen}`)
      } catch (e) {
        addLog('error', `No se pudo desconectar ${origen}: ${(e as Error).message}`)
      }
    },
    [addLog]
  )

  // ── Solicitudes pendientes (conexión/firma) DENTRO de la wallet ─────
  useEffect(() => {
    const cargar = async () => {
      const s = await chrome.storage.local.get([
        'codecrypto_connect_request',
        'codecrypto_pending_request',
      ])
      setSolicitudConexion((s.codecrypto_connect_request as SolicitudConexion | undefined) ?? null)
      setSolicitudFirma((s.codecrypto_pending_request as SolicitudFirma | undefined) ?? null)
    }
    void cargar()
    const onChanged = (cambios: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (cambios.codecrypto_connect_request) {
        setSolicitudConexion(
          (cambios.codecrypto_connect_request.newValue as SolicitudConexion | undefined) ?? null
        )
      }
      if (cambios.codecrypto_pending_request) {
        setSolicitudFirma(
          (cambios.codecrypto_pending_request.newValue as SolicitudFirma | undefined) ?? null
        )
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  const responderConexion = useCallback(
    (ok: boolean, account?: string, accountIndex?: number) => {
      if (!solicitudConexion) return
      chrome.runtime.sendMessage(
        {
          type: 'CONNECT_RESPONSE',
          requestId: solicitudConexion.requestId,
          success: ok,
          account,
          accountIndex,
          error: ok ? undefined : 'User rejected connection',
        },
        () => void chrome.runtime.lastError
      )
      setSolicitudConexion(null)
      addLog('event', ok ? 'Conexión autorizada en la wallet' : 'Conexión rechazada')
    },
    [solicitudConexion, addLog]
  )

  const responderFirma = useCallback(
    (ok: boolean) => {
      if (!solicitudFirma) return
      chrome.runtime.sendMessage(
        {
          type: 'SIGN_RESPONSE',
          approvalId: solicitudFirma.approvalId,
          success: ok,
          error: ok ? undefined : 'User rejected',
        },
        () => void chrome.runtime.lastError
      )
      setSolicitudFirma(null)
      addLog('event', ok ? 'Firma aprobada en la wallet' : 'Firma rechazada')
    },
    [solicitudFirma, addLog]
  )

  // ── Cambios de cuenta y de red ──────────────────────────────────────
  const changeAccount = (index: number) => {
    if (index >= accounts.length || index < 0) {
      addLog('error', 'Índice de cuenta inválido')
      return
    }

    setCurrentAccountIndex(index)
    addLog('event', `Cuenta cambiada a ${accounts[index].slice(0, 10)}…`)

    chrome.storage.local.set({ codecrypto_current_account: index.toString() }, () => {
      chrome.runtime.sendMessage({
        type: 'ACCOUNT_CHANGED',
        accountIndex: index,
        account: accounts[index]
      }, () => { void chrome.runtime.lastError })
    })
  }

  const changeChain = (newChainId: string) => {
    setChainId(newChainId)
    const chain = chains.find((item) => item.chainId === newChainId)
    addLog('event', `Red cambiada a ${chain?.name || newChainId}`)

    chrome.storage.local.set({ codecrypto_chain_id: newChainId }, () => {
      chrome.runtime.sendMessage({ type: 'CHAIN_CHANGED', chainId: newChainId }, () => {
        void chrome.runtime.lastError
      })
    })
  }

  // ── Reset ───────────────────────────────────────────────────────────
  const resetWallet = () => {
    addLog('event', 'Reseteando wallet…')

    // Se borran TODAS las claves de la wallet (mnemonic, cuentas, cuenta activa,
    // red, sitios conectados, redes personalizadas y solicitudes pendientes),
    // pero se conserva el historial de logs (requisito 23 y Test 8).
    chrome.storage.local.get(null, (all) => {
      const keys = walletKeysToReset(Object.keys(all))
      chrome.storage.local.remove(keys, () => {
        addLog('event', `Datos de extensión limpiados (${keys.length} claves)`)
      })
    })

    // El background cierra las ventanas abiertas y cancela sus solicitudes
    notifyWalletReset()

    setIsWalletLoaded(false)
    setAccounts([])
    setCurrentAccountIndex(0)
    setBalance('0')
    setBalanceWei(0n)
    setChainId(LOCAL_CHAIN_ID)
    void refreshChains()

    addLog('event', '✅ Wallet reseteada · ingresa o crea una nueva frase')
  }

  // ── Transferencias ──────────────────────────────────────────────────
  const handleTransfer = async (toAccountIndex: number, amount: string) => {
    if (!isWalletLoaded) return

    try {
      addLog('message', `Transferencia de ${amount} ETH a la cuenta ${toAccountIndex}`)

      // Conversión EXACTA ETH → wei (antes: BigInt(parseFloat(amount) * 1e18),
      // que desviaba importes reales: 1.1 ETH → 1100000000000000128 wei)
      const valueWei = parseEthToWei(amount)
      if (valueWei > balanceWei) {
        throw new Error(`Saldo insuficiente: disponible ${formatWeiToEth(balanceWei)} ETH`)
      }

      const tx = {
        to: accounts[toAccountIndex],
        value: '0x' + valueWei.toString(16),
        from: accounts[currentAccountIndex]
      }

      const txHash = await sendRPCToBackground<string>('eth_sendTransaction', [tx])
      addLog('event', `Transacción enviada: ${txHash.slice(0, 18)}…`)

      await new Promise((resolve) => setTimeout(resolve, 2000))
      await updateBalance()
      addLog('event', '✅ Transacción confirmada')

      return txHash
    } catch (error) {
      const err = error as Error
      addLog('error', `Error en transferencia: ${err.message}`)
      throw err
    }
  }

  // ── Render ──────────────────────────────────────────────────────────
  const nombreRed =
    chains.find((c) => c.chainId.toLowerCase() === chainId.toLowerCase())?.name ??
    `Chain ${Number(chainId)}`
  /** Nombre corto de la red para el icono del pie (sin el chainId). */
  const nombreCortoRed = nombreRed.replace(/\s*\(\d+\)\s*$/, '')

  /** Contenido de cada página interna (cada sección ocupa todo el espacio). */
  const paginaActual = () => {
    const volver = () => setVista('inicio')
    const cuenta = accounts[currentAccountIndex] ?? ''
    switch (vista) {
      case 'cuenta':
        return (
          <Pagina titulo="Cuenta" onVolver={volver}>
            <p className="tk-pagina__dato tk-mono">{cuenta}</p>
            <p className="tk-muted" style={{ fontSize: 12 }}>
              Cambia de cuenta desde el selector de la cabecera.
            </p>
          </Pagina>
        )
      case 'balance':
        return (
          <Pagina titulo="Balance" onVolver={volver}>
            <p className="tk-inicio__monto">{balance} ETH</p>
            <p className="tk-muted" style={{ fontSize: 12 }}>
              Red: {nombreRed}
            </p>
          </Pagina>
        )
      case 'recibir':
        return (
          <Pagina titulo="Recibir" onVolver={volver}>
            {cuenta && <RecibirQR address={cuenta} />}
          </Pagina>
        )
      case 'enviar':
        return (
          <Pagina titulo="Enviar" onVolver={volver}>
            <TransferSection
              accounts={accounts}
              currentAccountIndex={currentAccountIndex}
              balanceWei={balanceWei}
              onTransfer={handleTransfer}
            />
          </Pagina>
        )
      case 'comprar':
        return (
          <Pagina titulo="Comprar" onVolver={volver}>
            {cuenta && <Comprar account={cuenta} />}
          </Pagina>
        )
      case 'cambiar':
        return (
          <Pagina titulo="Cambiar" onVolver={volver}>
            {cuenta && <Cambiar account={cuenta} chainId={chainId} />}
          </Pagina>
        )
      case 'contactos':
        return (
          <Pagina titulo="Contactos" onVolver={volver}>
            <Contactos />
          </Pagina>
        )
      case 'red':
        return (
          <Pagina titulo="Red" onVolver={volver}>
            <ChainManager
              chains={chains}
              activeChainId={chainId}
              onSwitch={changeChain}
              onChainsChanged={setChains}
            />
          </Pagina>
        )
      case 'caracteristicas':
        return (
          <Pagina titulo="Características" onVolver={volver}>
            {cuenta && <Caracteristicas account={cuenta} chainId={chainId} />}
          </Pagina>
        )
      case 'configuracion':
        return (
          <Pagina titulo="Configuración" onVolver={volver}>
            {cuenta && (
              <Configuracion
                chainId={chainId}
                chains={chains}
                onSwitch={changeChain}
                onChainsChanged={setChains}
                account={cuenta}
                logs={logs}
              />
            )}
          </Pagina>
        )
      case 'conexiones':
        return (
          <Pagina titulo="Conexiones" onVolver={volver}>
            {Object.keys(sitiosConectados).length === 0 ? (
              <p className="tk-muted" style={{ fontSize: 12 }}>
                Ninguna dApp conectada.
              </p>
            ) : (
              <ul className="tk-sitios">
                {Object.entries(sitiosConectados).map(([origen, c]) => (
                  <li key={origen} className="tk-sitio">
                    <div className="tk-sitio__info">
                      <span className="tk-sitio__origen">{origen}</span>
                      <span className="tk-sitio__cuenta">{acortarDireccion(c)}</span>
                    </div>
                    <button
                      className="tk-sitio__desconectar"
                      onClick={() => void desconectarSitio(origen)}
                      title={`Desconectar ${origen}`}
                    >
                      ⛔
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Pagina>
        )
      case 'redes':
        return (
          <Pagina titulo="Redes" onVolver={volver}>
            <Redes
              chains={chains}
              activeChainId={chainId}
              onSwitch={changeChain}
              onChainsChanged={setChains}
            />
          </Pagina>
        )
      case 'perfil':
        return (
          <Pagina titulo="Perfil" onVolver={volver}>
            {cuenta ? <Perfil account={cuenta} /> : null}
          </Pagina>
        )
      case 'notificaciones':
        return (
          <Pagina titulo="Notificaciones" onVolver={volver}>
            <Notificaciones logs={logs} />
          </Pagina>
        )
      case 'modo-vista':
        return (
          <Pagina titulo="Modo de vista" onVolver={volver}>
            <ModoVista />
          </Pagina>
        )
      default:
        return null
    }
  }

  return (
    <div className="app">
      {/* Header alineado arriba: icono + título; 2.ª línea con cuenta y red */}
      <header className="tk-header">
        <div className="tk-header__marca">
          <img
            className="tk-header__logo"
            src="/brand/TrueKeate_logoIntegral.svg"
            alt="TrueKeate"
          />
          <span className="tk-header__titulo">TrueKeate Wallet</span>
        </div>
        {isWalletLoaded && (
          <div className="tk-header__estado">
            <select
              className="tk-header__cuenta"
              aria-label="Cuenta activa"
              value={currentAccountIndex}
              onChange={(e) => changeAccount(parseInt(e.target.value))}
            >
              {accounts.map((acc, i) => (
                <option key={acc} value={i}>
                  {acortarDireccion(acc)}
                </option>
              ))}
            </select>
            <span className="tk-header__red" title={nombreRed}>
              {nombreRed}
            </span>
          </div>
        )}
      </header>

      {boveda?.migracionPendiente && isWalletLoaded && !pendienteCifrar && (
        <div className="tk-warning" style={{ margin: '0 0 12px' }}>
          Tu wallet guarda la frase de recuperación <strong>sin cifrar</strong>.{' '}
          <button
            className="tk-btn tk-btn--gold"
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => void migrarBoveda()}
          >
            🔐 Cifrarla ahora
          </button>
        </div>
      )}

      {pendienteCifrar ? (
        <VaultPassword
          mnemonic={pendienteCifrar}
          onListo={async () => {
            const frase = pendienteCifrar
            setPendienteCifrar(null)
            setBoveda({ existe: true, desbloqueada: true, migracionPendiente: false })
            await applyWallet(frase, { persist: true })
          }}
        />
      ) : isLoading ? (
        <div className="wallet-setup-container">
          <div className="wallet-setup">
            <h2>⏳ Cargando wallet...</h2>
            <p className="setup-note">Verificando si hay una wallet guardada</p>
          </div>
        </div>
      ) : boveda?.existe && !boveda.desbloqueada ? (
        <VaultUnlock onDesbloqueada={() => void cargarCuentasGuardadas()} />
      ) : !isWalletLoaded ? (
        <>
          <WalletSetup onLoadWallet={handleLoadWallet} />
          <LogsPanel logs={logs} onClear={handleClearLogs} />
        </>
      ) : (
        <>
          {solicitudConexion || solicitudFirma ? (
            <Aprobacion
              conexion={solicitudConexion}
              firma={solicitudFirma}
              chains={chains}
              cuentas={accounts}
              chainIdActivo={chainId}
              redNombre={nombreRed}
              onResponderConexion={responderConexion}
              onResponderFirma={responderFirma}
            />
          ) : vista === 'inicio' ? (
            <Inicio
              cuenta={accounts[currentAccountIndex] ?? ''}
              balanceETH={balance}
              balanceWei={balanceWei}
              accounts={accounts}
              currentAccountIndex={currentAccountIndex}
              chainId={chainId}
              onTransfer={handleTransfer}
            />
          ) : (
            paginaActual()
          )}

          {/* Pie fijo: estado de la dApp + Configuración (menú), Bloquear y Desconectar */}
          <footer className="tk-footer">
            <button
              type="button"
              className="tk-footer__dapp"
              onClick={() => setVista('conexiones')}
              title="Ver conexiones"
            >
              <span
                className={`tk-dot${
                  Object.keys(sitiosConectados).length > 0 ? ' tk-dot--ok' : ''
                }`}
                aria-hidden
              />
              <span>
                {Object.keys(sitiosConectados).length > 0
                  ? `${Object.keys(sitiosConectados).length} dApp(s) conectada(s)`
                  : 'Sin dApp conectada'}
              </span>
            </button>
            <button
              type="button"
              className="tk-footer__red"
              onClick={() => setVista('redes')}
              title={`Red conectada: ${nombreRed}`}
              aria-label={`Red conectada: ${nombreRed}`}
            >
              <span className="tk-footer__red-icono" aria-hidden>
                {iconoRed(chainId)}
              </span>
              <span className="tk-footer__red-nombre">{nombreCortoRed}</span>
            </button>
            <div className="tk-footer__acciones">
              <div className="tk-menu">
                <button
                  type="button"
                  onClick={() => setMenuConfig((v) => !v)}
                  title="Configuración"
                  aria-haspopup="menu"
                  aria-expanded={menuConfig}
                >
                  ⚙️
                </button>
                {menuConfig && (
                  <div className="tk-menu__lista" role="menu" aria-label="Configuración">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuConfig(false)
                        setVista('perfil')
                      }}
                    >
                      <span aria-hidden>👤</span> Perfil
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuConfig(false)
                        setVista('redes')
                      }}
                    >
                      <span aria-hidden>🌐</span> Redes
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuConfig(false)
                        void chrome.tabs.create({ url: URL_AYUDA })
                      }}
                    >
                      <span aria-hidden>❓</span> Ayuda
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuConfig(false)
                        setVista('notificaciones')
                      }}
                    >
                      <span aria-hidden>🔔</span> Notificaciones
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuConfig(false)
                        setVista('modo-vista')
                      }}
                    >
                      <span aria-hidden>🖥️</span> Modo de vista
                    </button>
                    <button
                      role="menuitem"
                      className="tk-menu__peligro"
                      onClick={() => {
                        setMenuConfig(false)
                        resetWallet()
                      }}
                    >
                      <span aria-hidden>🔄</span> Reiniciar
                    </button>
                  </div>
                )}
              </div>
              {boveda?.existe && (
                <button onClick={() => void bloquearWallet()} title="Bloquear wallet">
                  🔒
                </button>
              )}
              <button
                onClick={() => {
                  const origen = Object.keys(sitiosConectados)[0]
                  if (origen) void desconectarSitio(origen)
                }}
                title="Desconectar la dApp"
                disabled={Object.keys(sitiosConectados).length === 0}
              >
                🔌
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

export default App
