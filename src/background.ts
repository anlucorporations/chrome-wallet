/// <reference types="chrome"/>
// Background service worker para manejar solicitudes RPC
// ⭐ IMPLEMENTA EIP-1559: Fee Market Change for ETH 1.0 Chain
// - Usa maxFeePerGas (máximo gas dispuesto a pagar)
// - Usa maxPriorityFeePerGas (propina para mineros)
// - Tipo de transacción 2 (EIP-1559) en lugar de legacy (tipo 0)
// ⭐ IMPLEMENTA PERSISTENCIA DE CONEXIONES:
// - Guarda qué sitios están autorizados (codecrypto_connected_sites)
// - Verifica permisos antes de compartir cuentas (eth_accounts)
// - Mantiene conexión aunque el service worker se duerma
// ⭐ IMPLEMENTA GESTIÓN DE REDES (EIP-3085 / EIP-3326):
// - wallet_addEthereumChain y wallet_switchEthereumChain
// - Redes personalizadas persistidas en codecrypto_chains
// ⭐ PUBLICA ACTIVIDAD EN EL BUS DE LOGS para que el popup la muestre
/**
 * Service worker de la extensión: es el único componente que maneja claves.
 *
 * Responsabilidades:
 *  - Enrutar las peticiones RPC que llegan de las dApps (vía content script) y del popup.
 *  - Derivar cuentas (BIP-44), generar y validar mnemónicos (BIP-39).
 *  - Pedir aprobación al usuario (connect.html / notification.html), firmar y
 *    enviar transacciones con EIP-1559 y firmar mensajes EIP-712.
 *  - Gestionar las redes disponibles (EIP-3085 / EIP-3326) y los sitios
 *    autorizados por origen.
 *  - Difundir accountsChanged / chainChanged a todas las pestañas y publicar la
 *    actividad en el bus de logs que consume el popup.
 *
 * Los errores se devuelven a la dApp serializados con el código de EIP-1193.
 */
import { ethers } from 'ethers';
import { log as writeLog } from './utils/logs';
import {
  bloquear,
  crearBoveda,
  descifrarBoveda,
  desbloquear,
  estadoBoveda,
  guardarBoveda,
  leerBoveda,
  MINUTOS_AUTOBLOQUEO,
  mnemonicDesbloqueado,
  type Boveda,
} from './vault';
import {
  CHAINS_KEY,
  findChain,
  mergeChains,
  normalizeChainId
} from './utils/chains';
import {
  AppError,
  RPC_ERROR_CODES,
  toSerializedError
} from './types';
import type {
  AccountChangedMessage,
  Approval,
  BackgroundMessage,
  ChainChangedMessage,
  ChainConfig,
  ConnectResponseMessage,
  ConnectionRequest,
  ConnectionResult,
  LogType,
  ProviderEventName,
  RpcRequestMessage,
  SignResponseMessage
} from './types';

console.log('🚀 CodeCrypto Background Service Worker iniciado');

// Manejar mensajes desde content scripts y popup
chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  const msg = message as BackgroundMessage;
  console.log('📨 Mensaje recibido:', msg);

  if (msg.type === 'CODECRYPTO_RPC') {
    const rpcMsg = msg as RpcRequestMessage;
    const requestId = Date.now();
    console.log(`🔵 [${requestId}] RPC Request:`, rpcMsg.method);
    
    handleRPCRequest(rpcMsg.method, rpcMsg.params as string[], sender)
      .then(result => {
        console.log(`✅ [${requestId}] RPC Success (${rpcMsg.method}):`, result);
        // Resultado de las operaciones de escritura de una dApp (hash o firma)
        if (sender.tab && WRITE_METHODS.has(rpcMsg.method) && typeof result === 'string') {
          logActivity('message', `${rpcMsg.method} ✓ ${shorten(result, 12)}`, 'dapp');
        }
        sendResponse({ result: result, error: null });
      })
      .catch((error: Error) => {
        console.error(`❌ [${requestId}] RPC Error (${rpcMsg.method}):`, error.message);
        if (shouldLogRpc(rpcMsg.method, sender)) {
          logActivity('error', `${rpcMsg.method}: ${error.message}`, sender.tab ? 'dapp' : 'wallet');
        }
        // El error viaja serializado con su código EIP-1193
        sendResponse({ result: null, error: toSerializedError(error) });
      });
    
    return true; // Mantener canal abierto para respuesta asíncrona
  }
  
  // Manejar respuesta de conexión desde connect.html
  if (msg.type === 'CONNECT_RESPONSE') {
    const connectMsg = msg as ConnectResponseMessage;
    console.log('📬 Respuesta de conexión recibida:', connectMsg);
    // Se responde a la ventana cuando el permiso ya está guardado, así la
    // solicitud no puede perderse entre el ACK y el cierre de la ventana.
    handleConnectResponse(connectMsg.requestId, connectMsg)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Manejar respuesta de firma desde el popup (incluye resultado firmado)
  if (msg.type === 'SIGN_RESPONSE') {
    const signMsg = msg as SignResponseMessage;
    console.log('📬 Respuesta de firma recibida:', signMsg);
    handleSignResponse(signMsg.approvalId, signMsg)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Reset de la wallet desde el popup: se cancelan solicitudes y ventanas abiertas
  if (msg.type === 'WALLET_RESET') {
    console.log('🔄 Reset de wallet solicitado desde el popup');
    cancelAllPending('Wallet was reset')
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Manejar cambio de cuenta desde el popup
  if (msg.type === 'ACCOUNT_CHANGED') {
    const accountMsg = msg as AccountChangedMessage;
    console.log('🔄 Cambio de cuenta desde popup:', accountMsg);
    
    // Emitir evento accountsChanged a todas las pestañas y registrarlo
    emitEventToTabs('accountsChanged', [accountMsg.account], 'wallet')
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  
  // Manejar cambio de red desde el popup
  if (msg.type === 'CHAIN_CHANGED') {
    const chainMsg = msg as ChainChangedMessage;
    console.log('🌐 Cambio de red desde popup:', chainMsg);
    
    // Emitir evento chainChanged a todas las pestañas y registrarlo
    emitEventToTabs('chainChanged', chainMsg.chainId, 'wallet')
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Solicitudes pendientes (aprobaciones de firma y conexiones de dApps)
// ─────────────────────────────────────────────────────────────────────────
// Además del Map en memoria, se guarda una copia serializable en
// `chrome.storage.session`: Chrome duerme el service worker (MV3) y, al
// despertarlo, las solicitudes se rehidratan. Si la ventana asociada ya no
// existe, se reabre para que el usuario pueda terminar de aprobarlas.
const SESSION_APPROVALS_KEY = 'codecrypto_session_approvals';
const SESSION_CONNECTIONS_KEY = 'codecrypto_session_connections';

// ─────────────────────────────────────────────────────────────────────────
// Redes soportadas (por defecto + personalizadas por el usuario)
// ─────────────────────────────────────────────────────────────────────────
/** Redes personalizadas guardadas por el usuario (formato EIP-3085). */
async function loadCustomChains(): Promise<ChainConfig[]> {
  const stored = await chrome.storage.local.get(CHAINS_KEY);
  const chains = stored[CHAINS_KEY];
  return Array.isArray(chains) ? (chains as ChainConfig[]) : [];
}

/** Todas las redes disponibles: por defecto + personalizadas. */
async function loadAllChains(): Promise<ChainConfig[]> {
  return mergeChains(await loadCustomChains());
}

/**
 * URL del RPC de una red.
 * @throws {Error} si el chainId no está registrado (una dApp debe añadirlo antes)
 */
async function resolveRpcUrl(chainId: string): Promise<string> {
  const chains = await loadAllChains();
  const chain = findChain(chains, chainId);
  if (!chain) {
    throw new AppError(
      RPC_ERROR_CODES.unrecognizedChain,
      `Unrecognized chain ID ${chainId}. Add it first with wallet_addEthereumChain.`
    );
  }
  return chain.rpcUrl;
}

/** Registra (o actualiza) una red personalizada y devuelve la lista resultante. */
async function saveCustomChain(chain: ChainConfig): Promise<ChainConfig[]> {
  const custom = await loadCustomChains();
  const normalized = normalizeChainId(chain.chainId);

  const filtered = custom.filter((item) => {
    try {
      return normalizeChainId(item.chainId) !== normalized;
    } catch {
      return true;
    }
  });
  filtered.push({ ...chain, chainId: normalized, isDefault: false });

  await chrome.storage.local.set({ [CHAINS_KEY]: filtered });
  return mergeChains(filtered);
}

/** Publica actividad en el bus de logs sin bloquear el flujo RPC. */
function logActivity(type: LogType, content: string, source: string): void {
  void writeLog(type, content, source);
}

/**
 * Emite un evento a TODAS las pestañas y lo registra en el bus de logs.
 * (Antes cada punto de emisión repetía el bucle sobre las pestañas.)
 */
async function emitEventToTabs(
  eventName: ProviderEventName,
  data: unknown,
  source: string
): Promise<void> {
  const tabs = await chrome.tabs.query({});
  tabs.forEach((tab: chrome.tabs.Tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CODECRYPTO_EVENT',
        eventName,
        data
      }).catch(() => {
        // Ignorar errores si la pestaña no tiene content script
      });
    }
  });

  const detail = eventName === 'accountsChanged'
    ? `accountsChanged → ${(data as string[]).join(', ')}`
    : `chainChanged → ${String(data)}`;
  logActivity('event', detail, source);
}

// Métodos RPC que solo leen estado y se invocan en bucle desde las interfaces
// (sondeo de balance cada 5 s): no se registran para no inundar el panel de logs.
const QUIET_METHODS = new Set(['eth_getBalance', 'eth_chainId']);

/**
 * ¿Debe registrarse esta llamada en el bus de logs?
 * Se omiten las lecturas que el propio popup consulta en bucle; las mismas
 * llamadas hechas por una dApp sí se registran.
 */
function shouldLogRpc(method: string, sender: chrome.runtime.MessageSender): boolean {
  const fromDapp = Boolean(sender.tab);
  return fromDapp || !QUIET_METHODS.has(method);
}

// Métodos que producen un resultado relevante (hash o firma) → se registran
const WRITE_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain'
]);

/** Resume los parámetros de una llamada para el panel de logs. */
function summarizeParams(params: unknown[]): string {
  if (!params || params.length === 0) return '';
  const first = params[0];

  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const tx = first as { to?: string; value?: string; chainId?: string };
    if (tx.to) {
      const value = tx.value ? ` · ${tx.value}` : '';
      return ` → ${shorten(tx.to)}${value}`;
    }
    if (tx.chainId) return ` → ${tx.chainId}`;
  }
  if (typeof first === 'string') return ` → ${shorten(first, 14)}`;
  return '';
}

/** Acorta direcciones y hashes para que quepan en una línea del panel. */
function shorten(value: string, size = 10): string {
  if (value.length <= size * 2 + 3) return value;
  return `${value.slice(0, size)}…${value.slice(-4)}`;
}

// Timeouts de aprobación (el provider de la dApp espera 130 s, ver inject.ts)
const APPROVAL_TIMEOUT_MS = 120000;   // firmas y transacciones
const CONNECTION_TIMEOUT_MS = 60000;  // conexión de sites (connect.html)

// Tiempo de gracia antes de considerar que una ventana se cerró "a mano"
const WINDOW_CLOSE_GRACE_MS = 1500;

// Solicitudes pendientes de aprobación
const pendingApprovals = new Map<number, Approval>();
let approvalIdCounter = 0;

// Solicitudes pendientes de conexión
const pendingConnections = new Map<number, ConnectionRequest>();
let connectionIdCounter = 0;

/** Refleja en el badge del icono cuántas solicitudes siguen pendientes. */
function updateBadge(): void {
  const count = pendingApprovals.size;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
}

/** Guarda una copia serializable (sin promesas) de las solicitudes pendientes. */
async function persistPendingRequests(): Promise<void> {
  try {
    await chrome.storage.session.set({
      [SESSION_APPROVALS_KEY]: Array.from(pendingApprovals.values()).map(p => ({
        approvalId: p.approvalId,
        method: p.method,
        params: p.params,
        chainId: p.chainId,
        windowId: p.windowId ?? null
      })),
      [SESSION_CONNECTIONS_KEY]: Array.from(pendingConnections.values()).map(c => ({
        requestId: c.requestId,
        origin: c.origin,
        accounts: c.accounts,
        currentAccountIndex: c.currentAccountIndex,
        windowId: c.windowId ?? null
      }))
    });
  } catch (error) {
    console.warn('⚠️ No se pudo persistir la solicitud pendiente:', error);
  }
}

/**
 * Rechaza y limpia TODAS las solicitudes pendientes (reset de la wallet) y
 * cierra sus ventanas.
 */
async function cancelAllPending(reason: string): Promise<void> {
  console.log('🧹 Cancelando solicitudes pendientes:', reason);

  for (const pending of pendingApprovals.values()) {
    if (pending.windowId) chrome.windows.remove(pending.windowId).catch(() => {});
    pending.reject?.(new AppError(RPC_ERROR_CODES.userRejected, reason));
  }
  pendingApprovals.clear();

  for (const pending of pendingConnections.values()) {
    if (pending.windowId) chrome.windows.remove(pending.windowId).catch(() => {});
    pending.reject?.(new AppError(RPC_ERROR_CODES.userRejected, reason));
  }
  pendingConnections.clear();

  await chrome.storage.local.remove(['codecrypto_pending_request', 'codecrypto_connect_request']);
  await chrome.storage.session.remove([SESSION_APPROVALS_KEY, SESSION_CONNECTIONS_KEY]);
  updateBadge();
}

/**
 * Rehidrata las solicitudes pendientes tras reiniciarse el service worker.
 * Si su ventana desapareció, la reabre: el usuario no pierde la aprobación.
 */
async function restorePendingRequests(): Promise<void> {
  try {
    const stored = await chrome.storage.session.get([SESSION_APPROVALS_KEY, SESSION_CONNECTIONS_KEY]);
    const approvals = (stored[SESSION_APPROVALS_KEY] as Array<Record<string, unknown>>) || [];
    const connections = (stored[SESSION_CONNECTIONS_KEY] as Array<Record<string, unknown>>) || [];

    if (approvals.length === 0 && connections.length === 0) return;

    console.log(`🔄 Rehidratando ${approvals.length} aprobación(es) y ${connections.length} conexión(es)`);

    for (const raw of approvals) {
      const approvalId = raw.approvalId as number;
      const windowId = (raw.windowId as number | null) ?? undefined;

      // Sin resolve/reject: la promesa original murió con el worker anterior.
      pendingApprovals.set(approvalId, {
        approvalId,
        method: raw.method as string,
        params: raw.params as unknown[],
        chainId: raw.chainId as string,
        windowId
      });
      approvalIdCounter = Math.max(approvalIdCounter, approvalId);

      // La solicitud se rehidrata en storage; se aprueba DENTRO de la wallet
      // (ya no se abren ventanas flotantes independientes).
      await chrome.storage.local.set({
        codecrypto_pending_request: {
          approvalId,
          method: raw.method,
          params: raw.params,
          chainId: raw.chainId
        }
      });
    }

    for (const raw of connections) {
      const requestId = raw.requestId as number;
      const windowId = (raw.windowId as number | null) ?? undefined;

      pendingConnections.set(requestId, {
        requestId,
        origin: raw.origin as string,
        accounts: raw.accounts as string[],
        currentAccountIndex: raw.currentAccountIndex as number,
        windowId
      });
      connectionIdCounter = Math.max(connectionIdCounter, requestId);

      // La solicitud de conexión se rehidrata en storage para la wallet.
      await chrome.storage.local.set({
        codecrypto_connect_request: {
          requestId,
          origin: raw.origin,
          accounts: raw.accounts,
          currentAccountIndex: raw.currentAccountIndex
        }
      });
    }

    updateBadge();
    await persistPendingRequests();
  } catch (error) {
    console.warn('⚠️ No se pudieron restaurar las solicitudes pendientes:', error);
  }
}

// Función para solicitar aprobación del usuario (el background firma después)
async function requestUserApprovalAndSign(method: string, params: unknown[], chainId: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const approvalId = ++approvalIdCounter;
    console.log('🔔 Solicitando aprobación al usuario para:', method, 'ID:', approvalId);
    
    // Guardar en pendientes y persistir (sobrevive a que Chrome duerma el worker)
    pendingApprovals.set(approvalId, { approvalId, method, params, chainId, resolve, reject });
    updateBadge();
    void persistPendingRequests();
    console.log('🔔 Badge:', pendingApprovals.size);
    
    // Mostrar notificación
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'TrueKeate Wallet',
      message: method === 'eth_sendTransaction' 
        ? '🔔 Solicitud de transacción - Abre la wallet para aprobar'
        : '🔔 Solicitud de firma - Abre la wallet para aprobar',
      priority: 2
    }).catch(() => {
      console.log('ℹ️ Notificaciones no disponibles');
    });
    
    // Guardar solicitud en storage para la página de notificación
    chrome.storage.local.set({
      codecrypto_pending_request: {
        approvalId: approvalId,
        method: method,
        params: params,
        chainId: chainId
      }
    }).then(() => {
      // La aprobación se muestra DENTRO de la wallet (mismo espacio que el popup);
      // el badge y la notificación avisan al usuario de que abra la wallet. Las
      // ventanas flotantes independientes se eliminaron (rediseño de la wallet).
      console.log('✅ Solicitud guardada: se aprueba en la wallet');
    }).catch((err: Error) => {
      console.error('❌ Error guardando solicitud:', err);
      pendingApprovals.delete(approvalId);
      updateBadge();
      void persistPendingRequests();
      reject(new AppError(RPC_ERROR_CODES.internal, 'Failed to save request'));
    });
    
    // La página de notificación obtiene los datos del storage directamente
    // No necesitamos enviar mensajes ni reintentar
    
    // Timeout de 120 s (el provider de la dApp espera 130 s, ver inject.ts)
    setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        console.error('⏰ Timeout para aprobación ID:', approvalId);
        const pending = pendingApprovals.get(approvalId);
        const windowId = pending?.windowId;
        pendingApprovals.delete(approvalId);
        
        // Cerrar ventana de confirmación
        if (windowId) {
          chrome.windows.remove(windowId).catch(() => {});
        }
        
        // Limpiar storage
        chrome.storage.local.remove('codecrypto_pending_request');
        
        updateBadge();
        void persistPendingRequests();
        
        // Se rechaza con el código 4001: la solicitud no llegó a aprobarse
        reject(new AppError(RPC_ERROR_CODES.userRejected, 'User approval timeout after 2 minutes'));
      }
    }, APPROVAL_TIMEOUT_MS);
  });
}

// Función para solicitar conexión del usuario (página connect.html)
async function requestUserConnection(origin: string, accounts: string[], currentAccountIndex: number): Promise<ConnectionResult> {
  return new Promise<ConnectionResult>((resolve, reject) => {
    const requestId = ++connectionIdCounter;
    console.log('🌐 Solicitando conexión al usuario, ID:', requestId);
    console.log('🌐 Origen:', origin);
    
    // Guardar en pendientes y persistir (sobrevive a que Chrome duerma el worker)
    pendingConnections.set(requestId, { requestId, origin, accounts, currentAccountIndex, resolve, reject });
    void persistPendingRequests();
    
    // Guardar solicitud en storage
    chrome.storage.local.set({
      codecrypto_connect_request: {
        requestId: requestId,
        origin: origin,
        accounts: accounts,
        currentAccountIndex: currentAccountIndex
      }
    }).then(() => {
      // La solicitud de conexión se atiende DENTRO de la wallet (mismo espacio).
      console.log('✅ Solicitud de conexión guardada: se atiende en la wallet');
    }).catch((err: Error) => {
      console.error('❌ Error guardando solicitud de conexión:', err);
      pendingConnections.delete(requestId);
      void persistPendingRequests();
      reject(new AppError(RPC_ERROR_CODES.internal, 'Failed to save connection request'));
    });
    
    // Timeout de 60 segundos (1 minuto)
    setTimeout(() => {
      if (pendingConnections.has(requestId)) {
        console.error('⏰ Timeout para conexión ID:', requestId);
        const pending = pendingConnections.get(requestId);
        const windowId = pending?.windowId;
        pendingConnections.delete(requestId);
        
        // Cerrar ventana de conexión
        if (windowId) {
          chrome.windows.remove(windowId).catch(() => {});
        }
        
        // Limpiar storage
        chrome.storage.local.remove('codecrypto_connect_request');
        void persistPendingRequests();
        
        // La conexión no se completó (código 4001, como un rechazo del usuario)
        reject(new AppError(RPC_ERROR_CODES.userRejected, 'User connection timeout'));
      }
    }, CONNECTION_TIMEOUT_MS);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sitios autorizados (permisos por origen)
// ─────────────────────────────────────────────────────────────────────────
/** Normaliza una URL completa a su origen: "http://localhost:5174/test.html" → "http://localhost:5174". */
function normalizeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url; // 'unknown' o valores no parseables se conservan tal cual
  }
}

/**
 * Lee los sitios autorizados, migrando el formato antiguo (clave = URL completa)
 * al formato por origen, que es el que consulta `eth_accounts`.
 */
async function loadConnectedSites(): Promise<Record<string, string>> {
  const storage = await chrome.storage.local.get('codecrypto_connected_sites');
  const stored = (storage.codecrypto_connected_sites as Record<string, string>) || {};

  const sites: Record<string, string> = {};
  let migrated = false;
  for (const [key, account] of Object.entries(stored)) {
    const origin = normalizeOrigin(key);
    if (origin !== key) migrated = true;
    sites[origin] = account;
  }

  if (migrated) {
    console.log('🔧 Migrando sitios conectados al formato por origen:', Object.keys(sites));
    await chrome.storage.local.set({ codecrypto_connected_sites: sites });
  }
  return sites;
}

/** Guarda la lista de sitios autorizados (siempre con clave = origen). */
async function saveConnectedSites(sites: Record<string, string>): Promise<void> {
  await chrome.storage.local.set({ codecrypto_connected_sites: sites });
}

// Manejar respuesta de conexión desde connect.html
async function handleConnectResponse(requestId: number, response: { success: boolean; account?: string; error?: string }) {
  console.log('📬 Procesando respuesta de conexión para ID:', requestId);
  console.log('📬 Respuesta:', response);
  
  if (!pendingConnections.has(requestId)) {
    console.warn('⚠️ Conexión ID no encontrada:', requestId);
    return;
  }
  
  const pending = pendingConnections.get(requestId);
  // ⭐ FIX: se autoriza por ORIGEN (http://localhost:5174), que es lo que luego
  // consulta eth_accounts. Antes se guardaba la URL completa y nunca coincidía.
  const siteOrigin = normalizeOrigin(pending!.origin);
  pendingConnections.delete(requestId);
  
  // Limpiar storage
  chrome.storage.local.remove('codecrypto_connect_request');
  void persistPendingRequests();
  
  if (response.success) {
    console.log('✅ Usuario conectó cuenta:', response.account);
    
    // ⭐ GUARDAR SITIO EN LISTA DE CONECTADOS (con migración del formato antiguo)
    const connectedSites = await loadConnectedSites();
    connectedSites[siteOrigin] = response.account!;
    await saveConnectedSites(connectedSites);
    console.log('💾 Sitio guardado en conectados:', siteOrigin, '→', response.account);
    logActivity('event', `Sitio autorizado: ${siteOrigin}`, 'wallet');
    
    // Si la solicitud se rehidrató tras dormirse el worker, ya no hay promesa
    // que resolver: el permiso queda concedido y la dApp puede reconectar.
    if (pending!.resolve) {
      pending!.resolve({ account: response.account, error: null });
    } else {
      console.log('ℹ️ Solicitud de conexión rehidratada: permiso guardado sin promesa pendiente');
    }
  } else {
    console.log('❌ Usuario canceló conexión');
    logActivity('event', `Conexión cancelada: ${siteOrigin}`, 'wallet');
    // Se rechaza con un Error real para que el mensaje llegue a la dApp
    pending!.reject?.(new AppError(
      RPC_ERROR_CODES.userRejected,
      response.error || 'User rejected connection'
    ));
  }
}

// Manejar respuesta de aprobación del popup (sin datos de firma)
async function handleSignResponse(approvalId: number, response: { success: boolean; result?: string; error?: string }) {
  console.log('📬 Procesando respuesta de aprobación para ID:', approvalId);
  console.log('📬 Respuesta completa:', JSON.stringify(response, null, 2));
  console.log('📬 response.success:', response.success);
  console.log('📬 response.error:', response.error);
  
  if (!pendingApprovals.has(approvalId)) {
    console.warn('⚠️ Aprobación ID no encontrada:', approvalId);
    console.warn('⚠️ Pendientes actuales:', Array.from(pendingApprovals.keys()));
    return;
  }
  
  const pending = pendingApprovals.get(approvalId);
  pendingApprovals.delete(approvalId);
  
  // Limpiar storage de solicitud pendiente
  chrome.storage.local.remove('codecrypto_pending_request');
  
  updateBadge();
  void persistPendingRequests();
  
  if (response.success) {
    console.log('✅ Usuario aprobó la solicitud');
    logActivity('message', `Aprobado por el usuario: ${pending!.method}`, 'wallet');
    if (pending!.resolve) {
      // Flujo normal: el handler RPC continúa y firma la operación
      pending!.resolve(true);
    } else {
      // Solicitud rehidratada: la dApp ya no espera, pero el usuario aprobó
      // explícitamente, así que ejecutamos la operación igualmente.
      try {
        const result = await executeApprovedOperation(pending!.method, pending!.params, pending!.chainId);
        console.log('✅ Operación rehidratada ejecutada:', result);
        await chrome.storage.local.set({
          codecrypto_last_result: { method: pending!.method, result, at: Date.now() }
        });
      } catch (error) {
        const err = error as Error;
        console.error('❌ Error ejecutando la operación rehidratada:', err);
        await chrome.storage.local.set({
          codecrypto_last_result: { method: pending!.method, error: err.message, at: Date.now() }
        });
      }
    }
  } else {
    console.log('❌ Usuario rechazó la solicitud:', response.error);
    logActivity('message', `Rechazado por el usuario: ${pending!.method}`, 'wallet');
    pending!.reject?.(new AppError(RPC_ERROR_CODES.userRejected, response.error || 'User rejected'));
  }
  
  // La ventana de confirmación se cierra automáticamente desde Notification.tsx
  // No necesitamos cerrarla aquí
}

/**
 * Firmar y enviar una transacción (EIP-1559, tipo 2) usando el mnemonic guardado.
 * @returns hash de la transacción enviada
 */
async function sendTransactionWithEthers(
  tx: { to: string; value?: string; data?: string; from?: string },
  mnemonic: string,
  accountIndex: number,
  chainId: string
): Promise<string> {
  const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
  const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, `m/44'/60'/0'/0/${accountIndex}`);

  const rpcUrl = await resolveRpcUrl(chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = wallet.connect(provider);

  // Obtener fee data para EIP-1559
  const feeData = await provider.getFeeData();
  console.log('📊 Fee Data (EIP-1559):', {
    maxFeePerGas: feeData.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    gasPrice: feeData.gasPrice?.toString()
  });

  // Transacción EIP-1559 (tipo 2): sin gasPrice legacy
  const txRequest = {
    to: tx.to,
    value: tx.value || '0x0',
    data: tx.data || '0x',
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    type: 2
  };

  console.log('📝 Enviando transacción EIP-1559 (Type 2):', txRequest);
  const txResponse = await signer.sendTransaction(txRequest);
  console.log('✅ Transacción EIP-1559 enviada:', txResponse.hash);
  console.log('📊 TX Type:', txResponse.type, '(2 = EIP-1559)');

  return txResponse.hash;
}

/**
 * Firma un mensaje con EIP-712 (eth_signTypedData_v4).
 * @returns firma de 132 caracteres (0x…)
 */
async function signTypedDataWithEthers(
  params: unknown[],
  mnemonic: string,
  accountIndex: number
): Promise<string> {
  const signerAddress = params[0] as string;
  const typedData = JSON.parse(params[1] as string);

  const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
  const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, `m/44'/60'/0'/0/${accountIndex}`);

  // La firma debe corresponder a la cuenta activa que pide la dApp
  if (wallet.address.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new AppError(RPC_ERROR_CODES.unauthorized, 'Signer address does not match current account');
  }

  const domain = typedData.domain;
  const types = { ...typedData.types };
  delete types.EIP712Domain; // ethers v6 no necesita EIP712Domain en types

  console.log('📝 Firmando mensaje EIP-712...');
  const signature = await wallet.signTypedData(domain, types, typedData.message);
  console.log('✅ Mensaje firmado:', signature);

  return signature;
}

/**
 * Firma un mensaje con EIP-191 (`personal_sign`).
 *
 * Es la firma que usa TrueKeate para el inicio de sesión y para autorizar cada
 * acción (`TrueKeate: <acción> (ts=…)`); sin este método la wallet no puede
 * sustituir a MetaMask en la plataforma.
 *
 * @param params [mensaje, dirección]; se tolera el orden invertido, como hacen
 *               otras wallets por compatibilidad con dApps despistadas.
 * @returns firma de 132 caracteres (0x…)
 */
async function signMessageEIP191(
  params: unknown[],
  mnemonic: string,
  accountIndex: number
): Promise<string> {
  const esDireccion = (v: unknown): v is string =>
    typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)

  const invertido = esDireccion(params[0]) && !esDireccion(params[1])
  const mensaje = invertido ? params[1] : params[0]
  const direccion = invertido ? params[0] : params[1]

  if (typeof mensaje !== 'string') {
    throw new AppError(RPC_ERROR_CODES.invalidParams, 'personal_sign: falta el mensaje a firmar')
  }

  const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic)
  const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, `m/44'/60'/0'/0/${accountIndex}`)

  // La firma debe corresponder a la cuenta activa que pide la dApp
  if (esDireccion(direccion) && wallet.address.toLowerCase() !== direccion.toLowerCase()) {
    throw new AppError(RPC_ERROR_CODES.unauthorized, 'Signer address does not match current account')
  }

  // Si el mensaje llega en hexadecimal se firman sus BYTES (estándar
  // personal_sign); si no, el texto en UTF-8.
  const payload = /^0x[0-9a-fA-F]*$/.test(mensaje) ? ethers.getBytes(mensaje) : mensaje

  console.log('📝 Firmando mensaje EIP-191 (personal_sign)...')
  const firma = await wallet.signMessage(payload)
  console.log('✅ Mensaje firmado:', firma)
  return firma
}

/**
 * Métodos `wallet_*` que pertenecen a la propia wallet. Una dApp NO debe poder
 * invocarlos: los de la bóveda permitirían intentar fuerza bruta contra la
 * contraseña desde una página web.
 */
const METODOS_SOLO_EXTENSION = new Set([
  'wallet_vaultStatus',
  'wallet_createVault',
  'wallet_unlock',
  'wallet_lock',
  'wallet_revealMnemonic',
  'wallet_changeVaultPassword',
  'wallet_exportVault',
  'wallet_importVault',
  'wallet_getConnectedSites',
  'wallet_disconnectSite',
]);

/**
 * Devuelve el mnemonic con el que firmar.
 *
 * Orden de preferencia:
 *  1. Bóveda desbloqueada (cifrada con contraseña) — el camino de producción.
 *  2. Mnemonic heredado en claro — wallets creadas antes de existir la bóveda,
 *     para no romper nada mientras se migran.
 *
 * Si la bóveda existe pero está bloqueada se lanza un error explicativo: es
 * preferible a firmar sin que el usuario haya desbloqueado.
 */
async function obtenerMnemonic(): Promise<string> {
  const estado = await estadoBoveda();

  if (estado.existe) {
    const claro = await mnemonicDesbloqueado();
    if (!claro) {
      throw new AppError(
        RPC_ERROR_CODES.unauthorized,
        `Wallet bloqueada: abre TrueKeate Wallet y desbloquea con tu contraseña ` +
          `(se bloquea sola tras ${MINUTOS_AUTOBLOQUEO} minutos de inactividad).`
      );
    }
    return claro;
  }

  const datos = await chrome.storage.local.get('codecrypto_mnemonic');
  const heredado = datos.codecrypto_mnemonic as string | undefined;
  if (!heredado) {
    throw new AppError(
      RPC_ERROR_CODES.unauthorized,
      'Wallet not configured. Please open the popup and setup your wallet.'
    );
  }
  return heredado;
}

/**
 * Ejecuta una operación YA aprobada por el usuario.
 * Se usa en el flujo normal y también cuando la solicitud se rehidrató tras
 * reiniciarse el service worker (en ese caso la dApp ya no espera la respuesta).
 */
async function executeApprovedOperation(method: string, params: unknown[], chainId: string): Promise<string> {
  const data = await chrome.storage.local.get('codecrypto_current_account');
  const accountIndex = parseInt((data.codecrypto_current_account as string) || '0');
  const mnemonic = await obtenerMnemonic();

  if (method === 'eth_sendTransaction') {
    return await sendTransactionWithEthers(
      params[0] as { to: string; value?: string; data?: string; from?: string },
      mnemonic, accountIndex, chainId
    );
  }

  if (method === 'eth_signTypedData_v4') {
    return await signTypedDataWithEthers(params, mnemonic, accountIndex);
  }

  if (method === 'personal_sign') {
    return await signMessageEIP191(params, mnemonic, accountIndex);
  }

  throw new AppError(RPC_ERROR_CODES.unsupportedMethod, `Method not implemented: ${method}`);
}

/**
 * Flujo común de escritura: pedir aprobación al usuario y ejecutar la operación.
 * @returns hash de la transacción o firma EIP-712
 */
async function signWithApproval(method: string, params: unknown[], chainId: string): Promise<string> {
  // Se comprueba el acceso ANTES de pedir aprobación: si la wallet está
  // bloqueada no tiene sentido abrir una ventana de confirmación.
  await obtenerMnemonic();

  console.log('🔔 Solicitando aprobación al usuario...');
  await requestUserApprovalAndSign(method, params, chainId);
  console.log('✅ Usuario aprobó la solicitud, firmando...');

  const result = await executeApprovedOperation(method, params, chainId);

  // Deja constancia del último resultado (útil para depurar y para las
  // solicitudes rehidratadas, donde ya no hay dApp esperando).
  await chrome.storage.local.set({
    codecrypto_last_result: { method, result, at: Date.now() }
  });

  return result;
}

// Manejar solicitudes RPC
async function handleRPCRequest(method: string, params: unknown[], sender: chrome.runtime.MessageSender) {
  console.log('🔵 Procesando RPC:', method, params);

  // Los métodos propios de la wallet solo se atienden a sus propias páginas: si
  // vinieran de una dApp (sender.tab), se rechazan. Sin esta comprobación, una
  // web podría intentar fuerza bruta contra la contraseña de la bóveda.
  // Los métodos de bóveda solo los puede invocar una página de la PROPIA
  // extensión (popup, pestaña, panel lateral, iframe flotante). Se comprueba por
  // origen y no por `sender.tab`: la página de la extensión también puede vivir
  // en una pestaña, mientras que una dApp (content script) tiene origen http(s).
  const origenRemitente = sender.origin || sender.url || '';
  const esPaginaExtension = origenRemitente.startsWith(`chrome-extension://${chrome.runtime.id}`);
  if (METODOS_SOLO_EXTENSION.has(method) && !esPaginaExtension) {
    throw new AppError(
      RPC_ERROR_CODES.unauthorized,
      `${method} solo puede invocarse desde la propia wallet`
    );
  }

  // Actividad de las dApps → al bus de logs del popup (se omiten las lecturas
  // que las interfaces consultan en bucle)
  if (shouldLogRpc(method, sender)) {
    logActivity('call', `${method}${summarizeParams(params)}`, sender.tab ? 'dapp' : 'wallet');
  }

  // Leer datos de storage
  const data = await chrome.storage.local.get([
    'codecrypto_accounts',
    'codecrypto_current_account',
    'codecrypto_chain_id'
  ]);

  const accounts = (data.codecrypto_accounts as string[]) || [];
  const currentAccountIndex = parseInt((data.codecrypto_current_account as string) || '0');
  const chainId = (data.codecrypto_chain_id as string) || '0x7a69';

  switch (method) {
    case 'wallet_deriveAccounts': {
      console.log('📝 wallet_deriveAccounts - Derivar cuentas desde mnemonic');
      const mnemonicPhrase = params[0] as string;
      const numAccounts = (params[1] as number) || 5;
      
      console.log('Mnemonic recibido, longitud de palabras:', mnemonicPhrase.trim().split(/\s+/).length);
      console.log('Número de cuentas a derivar:', numAccounts);
      
      // Validar mnemonic (ethers v6)
      const isValid = ethers.Mnemonic.isValidMnemonic(mnemonicPhrase);
      if (!isValid) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'Invalid mnemonic phrase');
      }
      
      // Crear objeto Mnemonic
      const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonicPhrase);
      
      // Derivar cuentas usando HDNodeWallet (ethers v6)
      const derivedAccounts: string[] = [];
      for (let i = 0; i < numAccounts; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
        derivedAccounts.push(wallet.address);
        console.log(`Cuenta ${i} (${path}): ${wallet.address}`);
      }
      
      console.log('✅ Cuentas derivadas exitosamente:', derivedAccounts);
      logActivity('event', `Cuentas derivadas (${derivedAccounts.length}) desde el mnemonic`, 'wallet');
      return derivedAccounts;
    }

    case 'wallet_generateMnemonic': {
      console.log('📝 wallet_generateMnemonic - Crear una wallet nueva');
      const wallet = ethers.Wallet.createRandom();
      const phrase = wallet.mnemonic?.phrase;
      if (!phrase) {
        throw new AppError(RPC_ERROR_CODES.internal, 'No se pudo generar la frase de recuperación');
      }
      // La frase se devuelve para que el usuario la respalde; todavía no se guarda
      logActivity('event', 'Nueva frase de recuperación generada (12 palabras)', 'wallet');
      return { mnemonic: phrase, address: wallet.address };
    }

    case 'wallet_validateMnemonic': {
      const phrase = String(params[0] ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!phrase) {
        return { valid: false, error: 'Ingresa la frase de recuperación' };
      }
      const words = phrase.split(' ');
      if (words.length !== 12) {
        return { valid: false, error: `La frase debe tener 12 palabras (tiene ${words.length})` };
      }
      if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
        return { valid: false, error: 'Frase BIP-39 no válida: revisa las palabras y su orden' };
      }
      return { valid: true, error: null };
    }

    case 'wallet_getChains': {
      return await loadAllChains();
    }

    case 'wallet_addEthereumChain': {
      console.log('📝 wallet_addEthereumChain - Añadir red personalizada');
      const request = (params[0] ?? {}) as {
        chainId?: string;
        chainName?: string;
        rpcUrls?: string[];
        nativeCurrency?: { name?: string; symbol?: string; decimals?: number };
        blockExplorerUrls?: string[];
      };

      if (!request.chainId) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'wallet_addEthereumChain: falta el chainId');
      }
      if (!request.rpcUrls?.[0]) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'wallet_addEthereumChain: falta rpcUrls[0]');
      }

      const chainIdHex = normalizeChainId(request.chainId);
      const rpcUrl = request.rpcUrls[0];

      // Se comprueba que el RPC responde realmente con el chainId declarado
      console.log('📝 Verificando RPC de la red nueva:', rpcUrl);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      let network;
      try {
        network = await provider.getNetwork();
      } catch (error) {
        const err = error as Error;
        throw new AppError(
          RPC_ERROR_CODES.resourceUnavailable,
          `No se pudo contactar con el RPC ${rpcUrl}: ${err.message}`
        );
      }

      const actualChainId = '0x' + network.chainId.toString(16);
      if (actualChainId !== chainIdHex) {
        throw new AppError(
          RPC_ERROR_CODES.invalidParams,
          `El RPC responde con chainId ${actualChainId}, no con ${chainIdHex}`
        );
      }

      const chains = await saveCustomChain({
        chainId: chainIdHex,
        name: request.chainName?.trim() || `Red ${actualChainId}`,
        rpcUrl,
        symbol: request.nativeCurrency?.symbol || 'ETH',
        explorer: request.blockExplorerUrls?.[0],
        isDefault: false
      });

      const name = request.chainName?.trim() || `Red ${actualChainId}`;
      logActivity('event', `Red añadida: ${name} (${actualChainId})`, 'wallet');

      // Se cambia a la red recién añadida, como hace MetaMask; el cambio de
      // storage dispara el evento chainChanged hacia todas las pestañas.
      await chrome.storage.local.set({ codecrypto_chain_id: chainIdHex });

      return { chains, chainId: chainIdHex };
    }

    case 'eth_requestAccounts': {
      console.log('📝 eth_requestAccounts - Solicitud de conexión');
      console.log('📝 Cuentas disponibles:', accounts);
      console.log('📝 Cuenta actual:', currentAccountIndex);
      
      if (!Array.isArray(accounts) || accounts.length === 0) {
        console.error('❌ No hay cuentas en storage');
        throw new AppError(
          RPC_ERROR_CODES.unauthorized,
          'No accounts available. Please open the wallet popup and load your mnemonic.'
        );
      }
      
      if (currentAccountIndex >= accounts.length) {
        console.error('❌ Índice de cuenta fuera de rango:', currentAccountIndex, 'de', accounts.length);
        throw new AppError(RPC_ERROR_CODES.unauthorized, 'Invalid account index. Please reset your wallet.');
      }
      
      // Abrir página de conexión para que el usuario seleccione cuenta
      console.log('🌐 Abriendo página de conexión...');
      
      const origin = sender.tab?.url || sender.url || 'unknown';
      
      const connectResult = await requestUserConnection(origin, accounts, currentAccountIndex);
      
      if (connectResult.error) {
        // Red de seguridad: hoy el rechazo llega como excepción, no por aquí
        throw new AppError(RPC_ERROR_CODES.userRejected, connectResult.error);
      }
      
      console.log('✅ Usuario conectó cuenta:', connectResult.account);
      return [connectResult.account];
    }

    case 'eth_accounts': {
      console.log('📝 eth_accounts - Verificar permisos del sitio');
      
      // Obtener origen del sitio que solicita
      const origin = sender.tab?.url || sender.url || 'unknown';
      console.log('📝 Origen solicitante:', origin);
      
      // Verificar si el sitio está conectado (migrando claves antiguas si hiciera falta)
      const connectedSites = await loadConnectedSites();
      
      console.log('📝 Sitios conectados:', connectedSites);
      
      // El permiso se guarda por origen: "http://localhost:5174/test.html" → "http://localhost:5174"
      const siteDomain = normalizeOrigin(origin);
      
      if (connectedSites[siteDomain]) {
        console.log('✅ Sitio autorizado:', siteDomain);
        // Devolver la cuenta que el usuario autorizó para este sitio
        return [connectedSites[siteDomain]];
      } else {
        console.log('⚠️ Sitio NO autorizado:', siteDomain);
        console.log('ℹ️ El sitio debe llamar eth_requestAccounts primero');
        // No devolver cuentas si el sitio no está autorizado
        return [];
      }
    }

    case 'eth_chainId':
      console.log('📝 eth_chainId');
      return chainId;

    case 'eth_getBalance': {
      console.log('📝 eth_getBalance');
      const address = (params[0] as string) || accounts[currentAccountIndex];
      console.log('📝 Balance para dirección:', address);
      
      try {
        // Usar ethers.JsonRpcProvider directamente con el RPC de la red activa
        const rpcUrl = await resolveRpcUrl(chainId);
        
        console.log('📝 RPC URL:', rpcUrl);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Obtener balance con ethers
        const balance = await provider.getBalance(address);
        const balanceHex = '0x' + balance.toString(16);
        
        console.log('✅ Balance obtenido:', balanceHex);
        return balanceHex;
      } catch (error) {
        const err = error as Error;
        console.error('❌ Error obteniendo balance:', err);
        throw new AppError(
          RPC_ERROR_CODES.resourceUnavailable,
          `Cannot get balance: ${err.message}. Make sure anvil is running (npm run chain) if using the local network.`
        );
      }
    }

    case 'eth_sendTransaction':
      console.log('📝 eth_sendTransaction - Solicitar aprobación y firmar');
      return await signWithApproval(method, params, chainId);

    case 'personal_sign':
      console.log('📝 personal_sign - Solicitar aprobación y firmar EIP-191');
      return await signWithApproval(method, params, chainId);

    case 'eth_call': {
      // Lectura de contrato: la usan los paneles de la plataforma para mostrar
      // saldos y estado on-chain (p. ej. BalanceDebug de TrueKeate).
      const rpcUrl = await resolveRpcUrl(chainId);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const transaccion = params[0] as { to?: string; data?: string; from?: string; value?: string };
      const bloque = (params[1] as string) || 'latest';
      return await provider.call({ ...transaccion, blockTag: bloque });
    }

    case 'eth_blockNumber': {
      const rpcUrl = await resolveRpcUrl(chainId);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      return '0x' + (await provider.getBlockNumber()).toString(16);
    }

    case 'eth_getLogs': {
      // Lectura de logs (solo lectura): la usa la pestaña Actividad del popup
      // para listar transferencias ERC-20 de la cuenta. Se devuelven objetos
      // planos (los Log de ethers llevan una referencia al provider que no es
      // serializable por chrome.runtime.sendMessage).
      const rpcUrl = await resolveRpcUrl(chainId);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const logs = await provider.getLogs(params[0] as ethers.Filter);
      return logs.map((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        blockNumber: l.blockNumber,
        transactionHash: l.transactionHash,
        index: l.index,
        removed: l.removed
      }));
    }

    case 'eth_estimateGas': {
      const rpcUrl = await resolveRpcUrl(chainId);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const estimacion = await provider.estimateGas(params[0] as ethers.TransactionRequest);
      return '0x' + estimacion.toString(16);
    }

    case 'wallet_revokePermissions': {
      // TrueKeate lo llama al desconectar. Sin este método, la autorización del
      // sitio persiste en la wallet aunque la dApp olvide su sesión local.
      const origen = sender.tab?.url || sender.url || 'unknown';
      const dominio = normalizeOrigin(origen);
      const sitios = await loadConnectedSites();
      if (sitios[dominio]) {
        delete sitios[dominio];
        await saveConnectedSites(sitios);
        console.log('🔓 Permiso revocado para:', dominio);
      }
      return null;
    }

    case 'eth_signTypedData_v4':
      console.log('📝 eth_signTypedData_v4 - Solicitar aprobación y firmar EIP-712');
      return await signWithApproval(method, params, chainId);

    case 'wallet_switchEthereumChain': {
      console.log('📝 wallet_switchEthereumChain');
      const requested = (params[0] as { chainId?: string })?.chainId;
      if (!requested) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'Invalid chainId');
      }

      const targetChainId = normalizeChainId(requested);
      const chains = await loadAllChains();
      const chain = findChain(chains, targetChainId);
      if (!chain) {
        // EIP-3326: la dApp debe añadir la red antes de poder cambiar a ella
        throw new AppError(
          RPC_ERROR_CODES.unrecognizedChain,
          `Unrecognized chain ID ${requested}. Try adding the chain first with wallet_addEthereumChain.`
        );
      }

      // D3: el cambio de red que pide una dApp se confirma en la wallet (misma
      // página de aprobación), para que no cambie en silencio.
      const guardado = await chrome.storage.local.get('codecrypto_chain_id');
      const chainIdActual = (guardado.codecrypto_chain_id as string) || targetChainId;
      await requestUserApprovalAndSign('wallet_switchEthereumChain', params, chainIdActual);

      // El cambio de storage dispara el evento chainChanged hacia todas las
      // pestañas (ver chrome.storage.onChanged al final del archivo).
      await chrome.storage.local.set({ codecrypto_chain_id: targetChainId });
      logActivity('event', `Red cambiada a ${chain.name}`, 'wallet');

      return null;
    }

    case 'wallet_vaultStatus':
      return await estadoBoveda();

    case 'wallet_createVault': {
      const [mnemonicNuevo, password] = params as [string, string];
      if (!mnemonicNuevo || !password) {
        throw new AppError(
          RPC_ERROR_CODES.invalidParams,
          'wallet_createVault: faltan el mnemonic o la contraseña'
        );
      }
      if (String(password).length < 8) {
        throw new AppError(
          RPC_ERROR_CODES.invalidParams,
          'La contraseña de la bóveda debe tener al menos 8 caracteres'
        );
      }
      const boveda = await crearBoveda(mnemonicNuevo, password);
      await guardarBoveda(boveda); // guarda cifrado y borra el mnemonic en claro
      await desbloquear(password); // deja la wallet lista para usar
      logActivity('event', 'Bóveda cifrada creada (mnemonic protegido con contraseña)', 'wallet');
      return { ok: true, cifrada: true };
    }

    case 'wallet_unlock': {
      const password = params?.[0] as string | undefined;
      if (!password) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'wallet_unlock: falta la contraseña');
      }
      const mnemonic = await desbloquear(password);
      if (!mnemonic) {
        throw new AppError(RPC_ERROR_CODES.unauthorized, 'Contraseña incorrecta');
      }
      logActivity('event', 'Wallet desbloqueada', 'wallet');
      return { ok: true };
    }

    case 'wallet_lock':
      await bloquear();
      logActivity('event', 'Wallet bloqueada', 'wallet');
      return { ok: true };

    case 'wallet_revealMnemonic': {
      // Solo el popup (M6 · RF-WN-25): respaldo de la frase. Requiere la bóveda
      // DESBLOQUEADA; nunca se expone si está bloqueada.
      const frase = await mnemonicDesbloqueado();
      if (!frase) {
        throw new AppError(
          RPC_ERROR_CODES.unauthorized,
          'La bóveda está bloqueada: desbloquéala para ver la frase de recuperación.'
        );
      }
      logActivity('event', 'Frase de recuperación mostrada (respaldo)', 'wallet');
      return frase;
    }

    case 'wallet_changeVaultPassword': {
      // Solo el popup (M6): re-cifra la bóveda con una clave nueva. Exige la
      // clave ACTUAL correcta y deja la sesión desbloqueada con la nueva.
      const actual = String(params[0] ?? '');
      const nueva = String(params[1] ?? '');
      if (nueva.length < 8) {
        throw new AppError(
          RPC_ERROR_CODES.invalidParams,
          'La nueva contraseña debe tener al menos 8 caracteres'
        );
      }
      const boveda = await leerBoveda();
      if (!boveda) {
        throw new AppError(RPC_ERROR_CODES.unauthorized, 'No hay bóveda que actualizar');
      }
      let mnemonic: string;
      try {
        mnemonic = await descifrarBoveda(boveda, actual);
      } catch {
        throw new AppError(RPC_ERROR_CODES.unauthorized, 'La contraseña actual no es correcta');
      }
      await guardarBoveda(await crearBoveda(mnemonic, nueva));
      await desbloquear(nueva);
      logActivity('event', 'Clave de bloqueo actualizada', 'wallet');
      return { ok: true };
    }

    case 'wallet_exportVault': {
      // Solo el popup (M6): devuelve la bóveda CIFRADA para respaldarla.
      const boveda = await leerBoveda();
      if (!boveda) {
        throw new AppError(RPC_ERROR_CODES.internal, 'No hay bóveda que exportar');
      }
      logActivity('event', 'Backup de la bóveda exportado', 'wallet');
      return boveda;
    }

    case 'wallet_importVault': {
      // Solo el popup (M6): restaura una bóveda desde un backup, validando que
      // la contraseña la descifra antes de sustituir la actual.
      const backup = params[0] as Boveda;
      const password = String(params[1] ?? '');
      if (!backup || typeof backup !== 'object' || !backup.cifrado || !backup.salt) {
        throw new AppError(RPC_ERROR_CODES.invalidParams, 'Backup inválido');
      }
      try {
        await descifrarBoveda(backup, password);
      } catch {
        throw new AppError(RPC_ERROR_CODES.unauthorized, 'La contraseña no descifra este backup');
      }
      await guardarBoveda(backup);
      await desbloquear(password);
      logActivity('event', 'Bóveda restaurada desde backup', 'wallet');
      return { ok: true };
    }

    case 'wallet_getConnectedSites':
      // Solo el popup (M2.1.7): lista las dApp autorizadas (origen → cuenta).
      return await loadConnectedSites();

    case 'wallet_disconnectSite': {
      // Solo el popup (M2.1.7): revoca la autorización de UNA dApp concreta y
      // avisa a sus pestañas (accountsChanged vacío). No afecta a las demás.
      const dominio = String(params[0] ?? '');
      const sitios = await loadConnectedSites();
      if (dominio && sitios[dominio]) {
        delete sitios[dominio];
        await saveConnectedSites(sitios);
        const tabs = await chrome.tabs.query({});
        tabs.forEach((tab: chrome.tabs.Tab) => {
          if (!tab.id || !tab.url) return;
          if (normalizeOrigin(tab.url) !== dominio) return;
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'CODECRYPTO_EVENT',
              eventName: 'accountsChanged',
              data: []
            })
            .catch(() => {
              // Pestaña sin content script: se ignora
            });
        });
        logActivity('event', `Desconectada dApp ${dominio}`, 'wallet');
      }
      return sitios;
    }

    default: {
      const err = new AppError(RPC_ERROR_CODES.unsupportedMethod, `Method not implemented: ${method}`);
      console.warn('⚠️', err.message);
      throw err;
    }
  }
}

// Escuchar cambios en storage para sincronizar estado
chrome.storage.onChanged.addListener(async (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
  if (areaName !== 'local') return;

  console.log('💾 Storage cambió:', changes);

  // Si cambió la cuenta actual, emitir accountsChanged
  if (changes.codecrypto_current_account) {
    const storageData = await chrome.storage.local.get('codecrypto_accounts');
    const accountIndex = parseInt(changes.codecrypto_current_account.newValue || '0');
    const accountsList = (storageData.codecrypto_accounts as string[]) || [];
    // Lectura con migración al formato por origen
    const connectedSites = await loadConnectedSites();
    
    if (accountsList.length > accountIndex) {
      const newAccount = accountsList[accountIndex];
      
      // Actualizar la cuenta para todos los sitios conectados (misma clave de origen)
      const updatedSites: Record<string, string> = {};
      Object.keys(connectedSites).forEach(site => {
        updatedSites[site] = newAccount;
      });
      
      // Guardar sitios actualizados
      if (Object.keys(updatedSites).length > 0) {
        await saveConnectedSites(updatedSites);
        console.log('💾 Sitios conectados actualizados con nueva cuenta:', newAccount);
      }
      
      // Emitir a todas las pestañas (y registrarlo en el bus de logs)
      await emitEventToTabs('accountsChanged', [newAccount], 'wallet');
    }
  }

  // Si cambió el chain ID, emitir chainChanged
  if (changes.codecrypto_chain_id) {
    const newChainId = changes.codecrypto_chain_id.newValue;
    
    // Emitir a todas las pestañas (y registrarlo en el bus de logs)
    await emitEventToTabs('chainChanged', newChainId, 'wallet');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// B9: cierre manual de las ventanas de aprobación / conexión
// ─────────────────────────────────────────────────────────────────────────
// Si el usuario cierra la ventana con la X, la solicitud se rechaza de
// inmediato (antes quedaba viva hasta agotar el timeout y el badge seguía
// encendido). Se espera un instante porque, al aprobar, la propia página cierra
// la ventana justo después de enviar su respuesta.
chrome.windows.onRemoved.addListener(async (windowId: number) => {
  await new Promise(resolve => setTimeout(resolve, WINDOW_CLOSE_GRACE_MS));

  for (const [approvalId, pending] of Array.from(pendingApprovals.entries())) {
    if (pending.windowId !== windowId) continue;
    console.log('🚪 Ventana de aprobación cerrada sin respuesta. Rechazando:', approvalId);
    pendingApprovals.delete(approvalId);
    pending.reject?.(new AppError(RPC_ERROR_CODES.userRejected, 'User closed the confirmation window'));
    await chrome.storage.local.remove('codecrypto_pending_request');
  }

  for (const [requestId, pending] of Array.from(pendingConnections.entries())) {
    if (pending.windowId !== windowId) continue;
    console.log('🚪 Ventana de conexión cerrada sin respuesta. Rechazando:', requestId);
    pendingConnections.delete(requestId);
    pending.reject?.(new AppError(RPC_ERROR_CODES.userRejected, 'User closed the connection window'));
    await chrome.storage.local.remove('codecrypto_connect_request');
  }

  updateBadge();
  await persistPendingRequests();
});

// Al arrancar (o despertar) el service worker se recuperan las solicitudes que
// quedaron pendientes antes de que Chrome lo durmiera (MV3).
void restorePendingRequests();

console.log('✅ Background service worker listo');

