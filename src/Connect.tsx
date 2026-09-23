/// <reference types="chrome"/>
/**
 * `connect.html`: ventana donde el usuario decide qué cuenta comparte con una dApp.
 *
 * Lee la solicitud pendiente de `chrome.storage.local`, muestra las 5 cuentas con
 * su balance en la red activa y, al confirmar, actualiza la cuenta activa y
 * responde al service worker (que es quien guarda el permiso por origen).
 */
import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import './App.css'
import { CHAINS_KEY, DEFAULT_CHAINS, findChain, mergeChains } from './utils/chains'
import { formatWeiToEth } from './utils/amount'
import type { ChainConfig, ConnectResponseMessage, ConnectionRequest } from './types'

interface AccountWithBalance {
  address: string
  /** Balance formateado en ETH */
  balance: string
  index: number
}

const REJECT_TIMEOUT_MS = 60_000

function Connect() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [data, setData] = useState<ConnectionRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(true)

  /** Carga el balance de cada cuenta usando el RPC de la red activa. */
  const loadBalances = useCallback(async (accountsList: string[], chains: ChainConfig[], chainId: string) => {
    const chain = findChain(chains, chainId) ?? chains[0]
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl)

    const withBalance: AccountWithBalance[] = []
    for (let i = 0; i < accountsList.length; i++) {
      try {
        const balance = await provider.getBalance(accountsList[i])
        withBalance.push({ address: accountsList[i], balance: formatWeiToEth(balance, 4), index: i })
      } catch {
        // Si el nodo no responde, la cuenta se muestra sin balance
        withBalance.push({ address: accountsList[i], balance: '?', index: i })
      }
    }

    setAccounts(withBalance)
    setLoadingBalances(false)
  }, [])

  const loadConnectionRequest = useCallback(async () => {
    try {
      const stored = await chrome.storage.local.get([
        'codecrypto_connect_request',
        'codecrypto_accounts',
        'codecrypto_current_account',
        'codecrypto_chain_id',
        CHAINS_KEY
      ])

      const request = stored.codecrypto_connect_request as ConnectionRequest | undefined
      if (!request) {
        throw new Error('No hay solicitud de conexión pendiente')
      }

      const accountsList = (stored.codecrypto_accounts as string[]) || []
      const currentIdx = parseInt((stored.codecrypto_current_account as string) || '0')
      const chainId = (stored.codecrypto_chain_id as string) || DEFAULT_CHAINS[0].chainId
      const customChains = (stored[CHAINS_KEY] as ChainConfig[]) || []
      const chains = mergeChains(customChains)

      setData(request)
      setSelectedIndex(currentIdx)
      setLoading(false)

      await loadBalances(accountsList, chains, chainId)
    } catch (err) {
      console.error('Error cargando solicitud:', err)
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }, [loadBalances])

  useEffect(() => {
    void loadConnectionRequest()
  }, [loadConnectionRequest])

  const sendResponse = useCallback((message: ConnectResponseMessage, closeDelay: number) => {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error enviando mensaje:', chrome.runtime.lastError.message)
      }
      setTimeout(() => window.close(), closeDelay)
    })
  }, [])

  const handleConnect = async () => {
    if (!data || !accounts[selectedIndex]) return

    setLoading(true)
    try {
      // La cuenta elegida pasa a ser la activa
      await chrome.storage.local.set({ codecrypto_current_account: selectedIndex.toString() })

      console.log('📤 Enviando conexión al background')
      sendResponse({
        type: 'CONNECT_RESPONSE',
        requestId: data.requestId,
        success: true,
        account: accounts[selectedIndex].address,
        accountIndex: selectedIndex
      }, 300)
    } catch (err) {
      console.error('❌ Error conectando:', err)
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (!data) return
    console.log('❌ Usuario canceló la conexión')

    sendResponse({
      type: 'CONNECT_RESPONSE',
      requestId: data.requestId,
      success: false,
      error: 'User rejected connection'
    }, 0)
  }

  if (loading) {
    return (
      <div className="notification-container">
        <div className="notification-content">
          <h2>⏳ Cargando...</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="notification-container">
        <div className="notification-content">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={() => window.close()}>Cerrar</button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="notification-container">
        <div className="notification-content">
          <h2>❌ No hay solicitud de conexión</h2>
          <button onClick={() => window.close()}>Cerrar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="notification-container">
      <div className="notification-header">
        <img
          className="tk-brand__logo"
          src="/brand/TrueKeate_logoIntegral.svg"
          alt="TrueKeate"
        />
        <h1>TrueKeate Wallet</h1>
        <p>Solicitud de autorización</p>
      </div>

      <div className="notification-content">
        <h2>🌐 Conectar a dApp</h2>

        <div className="connect-origin">
          <div className="origin-label">dApp solicitante</div>
          <div className="origin-value">{data.origin || 'Aplicación Web'}</div>
        </div>

        <div className="connect-info">
          <p>Selecciona la cuenta que deseas conectar a esta aplicación:</p>
          <p className="field-hint">
            La solicitud caduca en {Math.round(REJECT_TIMEOUT_MS / 1000)} s
          </p>
        </div>

        <div className="accounts-list">
          {accounts.length === 0 ? (
            <div className="account-item">
              <p>No hay cuentas disponibles</p>
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.index}
                className={`account-item ${selectedIndex === account.index ? 'selected' : ''}`}
                onClick={() => setSelectedIndex(account.index)}
              >
                <div className="account-radio">
                  {selectedIndex === account.index ? '🔘' : '⚪'}
                </div>
                <div className="account-info">
                  <div className="account-label">
                    Cuenta {account.index}
                  </div>
                  <div className="account-address">
                    {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </div>
                  <div className="account-address-full">
                    {account.address}
                  </div>
                </div>
                <div className="account-balance">
                  {loadingBalances ? (
                    <span className="balance-loading">⏳</span>
                  ) : (
                    <span className="balance-value">
                      {account.balance === '?' ? '— ETH' : `${account.balance} ETH`}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {accounts.length > 0 && (
          <div className="selected-account-detail">
            <div className="detail-label">Cuenta Seleccionada:</div>
            <div className="detail-value">
              {accounts[selectedIndex]?.address}
            </div>
          </div>
        )}
      </div>

      <div className="notification-actions">
        <button
          className="btn-reject"
          onClick={handleCancel}
          disabled={loading}
        >
          {loading ? '⏳' : '❌'} Cancelar
        </button>
        <button
          className="btn-approve"
          onClick={handleConnect}
          disabled={loading || accounts.length === 0}
        >
          {loading ? '⏳ Conectando...' : '✅ Conectar'}
        </button>
      </div>
    </div>
  )
}

export default Connect
