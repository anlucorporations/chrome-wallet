/**
 * Manifest V3 de la extensión, tipado y escrito en TypeScript.
 *
 * El plugin `manifest-generator` de `vite.config.ts` lo exporta como
 * `dist/manifest.json` al terminar el build, de modo que el manifest y el código
 * no pueden desincronizarse.
 *
 * Permisos: `host_permissions` cubre los RPC por defecto (anvil y Sepolia);
 * los RPC de redes personalizadas se piden en tiempo de ejecución mediante
 * `optional_host_permissions`.
 */
interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  host_permissions: string[];
  /**
   * Permisos de host que la extensión pide en tiempo de ejecución: al añadir una
   * red personalizada se solicita acceso solo al RPC indicado.
   */
  optional_host_permissions: string[];
  action: {
    default_popup: string;
    default_title: string;
    default_icon: {
      [key: string]: string;
    };
  };
  background: {
    service_worker: string;
    type: string;
  };
  /** Panel lateral (M5): la misma UI del popup, abierta junto a la dApp. */
  side_panel: {
    default_path: string;
  };
  icons: {
    [key: string]: string;
  };
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: string;
    all_frames: boolean;
  }>;
  web_accessible_resources: Array<{
    resources: string[];
    matches: string[];
  }>;
}

const manifest: ManifestV3 = {
  manifest_version: 3,
  name: 'TrueKeate Wallet',
  version: '1.1.0',
  description: 'Wallet extension para Ethereum con soporte EIP-1193, EIP-712 y EIP-6963',
  permissions: [
    'storage',
    'activeTab',
    'tabs',
    'notifications',
    // M5: panel lateral (chrome.sidePanel)
    'sidePanel'
  ],
  host_permissions: [
    'http://localhost:8545/*',
    'http://127.0.0.1:8545/*',
    'https://rpc.sepolia.org/*'
  ],
  // Los RPC de redes personalizadas se solicitan al añadirlas (chrome.permissions.request)
  optional_host_permissions: [
    'http://*/*',
    'https://*/*'
  ],
  action: {
    default_popup: 'index.html',
    default_title: 'TrueKeate Wallet',
    default_icon: {
      '16': 'icon-16.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png'
    }
  },
  background: {
    service_worker: 'background.js',
    type: 'module'
  },
  // M5: ver la wallet como panel lateral (misma UI que el popup).
  side_panel: {
    default_path: 'index.html'
  },
  icons: {
    '16': 'icon-16.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content-script.js'],
      run_at: 'document_start',
      all_frames: true
    },
    {
      // M5: overlay flotante (solo se muestra si el modo elegido es "flotante").
      matches: ['<all_urls>'],
      js: ['floating.js'],
      run_at: 'document_idle',
      all_frames: false
    }
  ],
  web_accessible_resources: [
    {
      resources: ['inject.js'],
      matches: ['<all_urls>']
    },
    {
      // Recursos del panel flotante (iframe con la UI de la wallet).
      resources: ['index.html', 'assets/*', 'brand/*', 'vite.svg'],
      matches: ['<all_urls>']
    }
  ]
};

export default manifest;

