/**
 * 🔧 UTILIDAD DE DEBUGGING - Gestión de Sitios Conectados
 * 
 * Copia y pega estas funciones en la consola del service worker:
 * chrome://extensions/ → CodeCrypto Wallet → Service worker → Console
 */

// 📊 Ver todos los sitios conectados
function viewConnectedSites() {
  chrome.storage.local.get('codecrypto_connected_sites', (result) => {
    const sites = result.codecrypto_connected_sites || {};
    const count = Object.keys(sites).length;
    
    console.log('📊 SITIOS CONECTADOS (' + count + '):');
    console.log('════════════════════════════════════════════════════════════');
    
    if (count === 0) {
      console.log('   (ninguno)');
    } else {
      console.table(sites);
      
      Object.entries(sites).forEach(([site, account]) => {
        console.log(`   🌐 ${site}`);
        console.log(`      → ${account}`);
        console.log('');
      });
    }
    
    console.log('════════════════════════════════════════════════════════════');
  });
}

// 🗑️ Desconectar un sitio específico
function disconnectSite(siteUrl) {
  chrome.storage.local.get('codecrypto_connected_sites', (result) => {
    const sites = result.codecrypto_connected_sites || {};
    
    if (sites[siteUrl]) {
      const account = sites[siteUrl];
      delete sites[siteUrl];
      
      chrome.storage.local.set({ codecrypto_connected_sites: sites }, () => {
        console.log('✅ Sitio desconectado:');
        console.log('   🌐 ' + siteUrl);
        console.log('   👤 ' + account);
        console.log('');
        console.log('💡 El sitio tendrá que solicitar autorización de nuevo');
      });
    } else {
      console.log('⚠️ Sitio no encontrado en la lista de conectados');
      console.log('   Buscado: ' + siteUrl);
      console.log('');
      console.log('💡 Usa viewConnectedSites() para ver la lista completa');
    }
  });
}

// 🗑️ Desconectar TODOS los sitios
function disconnectAllSites() {
  chrome.storage.local.get('codecrypto_connected_sites', (result) => {
    const sites = result.codecrypto_connected_sites || {};
    const count = Object.keys(sites).length;
    
    chrome.storage.local.set({ codecrypto_connected_sites: {} }, () => {
      console.log('✅ TODOS los sitios desconectados (' + count + ')');
      console.log('');
      console.log('💡 Los sitios tendrán que solicitar autorización de nuevo');
    });
  });
}

// 🔍 Verificar si un sitio está conectado
function checkSite(siteUrl) {
  chrome.storage.local.get('codecrypto_connected_sites', (result) => {
    const sites = result.codecrypto_connected_sites || {};
    
    if (sites[siteUrl]) {
      console.log('✅ SITIO CONECTADO:');
      console.log('   🌐 ' + siteUrl);
      console.log('   👤 ' + sites[siteUrl]);
    } else {
      console.log('❌ SITIO NO CONECTADO:');
      console.log('   🌐 ' + siteUrl);
      console.log('');
      console.log('💡 El sitio necesita llamar eth_requestAccounts');
    }
  });
}

// 🔧 Ver TODA la configuración de la wallet
function viewFullConfig() {
  chrome.storage.local.get(null, (result) => {
    console.log('⚙️ CONFIGURACIÓN COMPLETA DE LA WALLET:');
    console.log('════════════════════════════════════════════════════════════');
    
    console.log('🔑 Mnemonic:', result.codecrypto_mnemonic ? '(configurado)' : '❌ NO configurado');
    console.log('👥 Cuentas:', (result.codecrypto_accounts || []).length);
    console.log('👤 Cuenta actual:', result.codecrypto_current_account || '0');
    console.log('🌐 Chain ID:', result.codecrypto_chain_id || '0x7a69');
    
    const sites = result.codecrypto_connected_sites || {};
    console.log('🔌 Sitios conectados:', Object.keys(sites).length);
    
    console.log('');
    console.log('📦 Storage completo:');
    console.table(result);
    
    console.log('════════════════════════════════════════════════════════════');
  });
}

// 🧹 Limpiar COMPLETAMENTE (excepto logs)
function resetWallet() {
  const confirm = prompt('⚠️ ADVERTENCIA: Esto eliminará TODA la configuración de la wallet.\n\nEscribe "CONFIRMAR" para continuar:');
  
  if (confirm === 'CONFIRMAR') {
    chrome.storage.local.clear(() => {
      console.log('✅ WALLET COMPLETAMENTE RESETEADA');
      console.log('');
      console.log('📝 Configuración eliminada:');
      console.log('   - Mnemonic');
      console.log('   - Cuentas');
      console.log('   - Sitios conectados');
      console.log('   - Preferencias');
      console.log('');
      console.log('💡 Recarga la extensión para empezar de nuevo');
    });
  } else {
    console.log('❌ Operación cancelada');
  }
}

// 📋 Exportar configuración de sitios
function exportConnectedSites() {
  chrome.storage.local.get('codecrypto_connected_sites', (result) => {
    const sites = result.codecrypto_connected_sites || {};
    const json = JSON.stringify(sites, null, 2);
    
    console.log('📋 CONFIGURACIÓN DE SITIOS (JSON):');
    console.log('════════════════════════════════════════════════════════════');
    console.log(json);
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log('💡 Copia el JSON de arriba para respaldarlo');
  });
}

// 📥 Importar configuración de sitios
function importConnectedSites(jsonString) {
  try {
    const sites = JSON.parse(jsonString);
    
    chrome.storage.local.set({ codecrypto_connected_sites: sites }, () => {
      console.log('✅ Configuración de sitios importada:');
      console.log('   ' + Object.keys(sites).length + ' sitios');
      console.table(sites);
    });
  } catch (error) {
    console.error('❌ Error importando configuración:', error.message);
    console.log('');
    console.log('💡 Asegúrate de pasar un JSON válido');
  }
}

// 📖 Ayuda - Mostrar todos los comandos disponibles
function help() {
  console.log('🔧 COMANDOS DISPONIBLES:');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 VISUALIZACIÓN:');
  console.log('   viewConnectedSites()           - Ver sitios conectados');
  console.log('   viewFullConfig()               - Ver configuración completa');
  console.log('   checkSite("http://...")        - Verificar si un sitio está conectado');
  console.log('');
  console.log('🔌 GESTIÓN DE CONEXIONES:');
  console.log('   disconnectSite("http://...")   - Desconectar un sitio');
  console.log('   disconnectAllSites()           - Desconectar todos los sitios');
  console.log('');
  console.log('💾 BACKUP:');
  console.log('   exportConnectedSites()         - Exportar configuración a JSON');
  console.log('   importConnectedSites(json)     - Importar desde JSON');
  console.log('');
  console.log('🧹 LIMPIEZA:');
  console.log('   resetWallet()                  - Resetear TODA la wallet');
  console.log('');
  console.log('📖 AYUDA:');
  console.log('   help()                         - Mostrar esta ayuda');
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('💡 Ejemplos:');
  console.log('   viewConnectedSites()');
  console.log('   disconnectSite("http://localhost:5174")');
  console.log('   checkSite("https://app.uniswap.org")');
  console.log('');
}

// 🎬 Mensaje de bienvenida
console.log('🔧 CodeCrypto Wallet - Utilidades de Debugging');
console.log('════════════════════════════════════════════════════════════');
console.log('');
console.log('✅ Funciones cargadas exitosamente');
console.log('');
console.log('📖 Escribe help() para ver todos los comandos disponibles');
console.log('📊 Escribe viewConnectedSites() para empezar');
console.log('');

// Auto-ejecutar viewConnectedSites al cargar
viewConnectedSites();

