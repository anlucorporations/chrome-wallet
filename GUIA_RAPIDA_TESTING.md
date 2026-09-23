# 🚀 Guía Rápida de Testing

## ⏱️ Test Rápido (5 minutos)

### 1. Compilar y Cargar (1 min)

```bash
# En la terminal
npm run build
```

Luego en Chrome:
1. `chrome://extensions/`
2. Reload en "CodeCrypto Wallet"

### 2. Probar Conexión Persistente (2 min)

1. **Abrir la página de pruebas** (`test.html`): con `npm run dev` en
   http://localhost:5173/test.html, o desde el paquete (`dist/test.html`).

2. **Conectar wallet:**
   ```javascript
   // En consola de test.html:
   await window.codecrypto.request({ method: 'eth_requestAccounts' });
   ```
   - ✅ Debería abrir ventana de conexión
   - ✅ Seleccionar cuenta y conectar

3. **Verificar almacenamiento:**
   - Abrir consola del service worker: `chrome://extensions/` → Service worker
   - Ejecutar:
   ```javascript
   chrome.storage.local.get('codecrypto_connected_sites', console.log);
   ```
   - ✅ Debería mostrar: `{ "http://localhost:...": "0xf39..." }`

4. **Esperar 1 minuto y recargar test.html**

5. **Verificar conexión persistente:**
   ```javascript
   const accounts = await window.codecrypto.request({ method: 'eth_accounts' });
   console.log('Cuentas:', accounts);
   ```
   - ✅ Debería devolver la cuenta SIN pedir autorización de nuevo

### 3. Probar EIP-1559 (2 min)

1. **Asegurar el nodo local (anvil) corriendo:**
   ```bash
   npm run chain        # equivale a: anvil --host 127.0.0.1 --port 8545 --chain-id 31337
   ```

2. **Enviar transacción desde test.html:**
   - Click en botón "Enviar Transacción"
   - Aprobar en la ventana de confirmación

3. **Verificar logs del service worker:**
   - `chrome://extensions/` → Service worker → Console
   - Buscar:
   ```
   📊 Fee Data (EIP-1559)
   📊 TX Type: 2 (2 = EIP-1559)
   ```
   - ✅ Debería aparecer

---

## 🔧 Debugging Rápido

### Ver sitios conectados

En consola del service worker:

```javascript
chrome.storage.local.get('codecrypto_connected_sites', (result) => {
  console.table(result.codecrypto_connected_sites);
});
```

### Desconectar un sitio

```javascript
chrome.storage.local.get('codecrypto_connected_sites', (result) => {
  const sites = result.codecrypto_connected_sites || {};
  delete sites['http://localhost:5174'];
  chrome.storage.local.set({ codecrypto_connected_sites: sites });
  console.log('✅ Sitio desconectado');
});
```

### Desconectar todos

```javascript
chrome.storage.local.set({ codecrypto_connected_sites: {} });
console.log('✅ Todos desconectados');
```

---

## 📋 Checklist de Verificación

### ✅ EIP-1559
- [ ] Transacción enviada con éxito
- [ ] Log muestra "TX Type: 2"
- [ ] Log muestra "maxFeePerGas" y "maxPriorityFeePerGas"
- [ ] anvil muestra la transacción

### ✅ Persistencia de Conexión
- [ ] Primera conexión pide autorización
- [ ] Sitio guardado en storage
- [ ] Después de 1 minuto, `eth_accounts` devuelve cuenta
- [ ] Recarga de página NO pide autorización de nuevo
- [ ] Service worker reiniciado NO pierde conexión

### ✅ Seguridad
- [ ] Sitio no autorizado recibe `[]` en `eth_accounts`
- [ ] Sitio no autorizado necesita llamar `eth_requestAccounts`
- [ ] Usuario puede aprobar o rechazar

### ✅ Cambio de Cuenta
- [ ] Cambiar cuenta en popup actualiza sitios conectados
- [ ] dApp recibe evento `accountsChanged`
- [ ] Nueva cuenta persiste en storage

---

## 🐛 Problemas Comunes

### "No accounts available"
**Solución:** Cargar wallet primero en el popup con el mnemonic

### "Service worker not found"
**Solución:** Recargar extensión en `chrome://extensions/`

### "eth_accounts devuelve []"
**Solución:** El sitio debe llamar `eth_requestAccounts` primero

### "Connection lost after reload"
**Verificar:**
```javascript
// En service worker:
chrome.storage.local.get('codecrypto_connected_sites', console.log);
```

---

## 🎯 Test Completo (15 minutos)

Para un test exhaustivo, consulta el apartado **"Verificación: los 11 casos de prueba"** de
`INSTRUCCIONES.md`, y el análisis original del problema de conexión en
`documentacion/historial/FIX_DESCONEXION_SITIOS.md`.

---

**¡Todo listo para probar!** 🚀

