/**
 * Pestaña "NFT" (M2.1.6 · C2): colección que posee la billetera.
 *
 * Sin un indexador externo, la wallet descubre los NFTs de las colecciones que
 * el usuario añade: lee `balanceOf`, enumera con `tokenOfOwnerByIndex`
 * (ERC-721 Enumerable) y resuelve `tokenURI` + metadata (JSON) de cada token.
 * Todo con `eth_call` (método ya existente). Colecciones sin la extensión
 * Enumerable muestran su balance pero no pueden listar los tokens.
 *
 * Solo lectura; no toca firma/RPC de escritura ni bóveda.
 */
import { useCallback, useEffect, useState } from 'react'
import { Interface } from 'ethers'
import { sendRPCToBackground } from '../utils/rpc'

const ERC721 = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
])

const CLAVE = 'codecrypto_nft_collections'
const RE_DIRECCION = /^0x[a-fA-F0-9]{40}$/

interface ColeccionGuardada {
  address: string
  chainId: string
}

interface NftVista {
  tokenId: string
  uri: string
  nombre: string
  imagen: string | null
}

interface ColeccionVista extends ColeccionGuardada {
  nombre: string
  balance: number
  nfts: NftVista[]
  error?: string
  enumerable: boolean
}

/** Convierte `ipfs://…` en una URL de pasarela pública. */
function aGateway(uri: string): string {
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`
  return uri
}

const acortar = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

export function NFT({ account, chainId }: { account: string; chainId: string }) {
  const [colecciones, setColecciones] = useState<ColeccionGuardada[]>([])
  const [vistas, setVistas] = useState<ColeccionVista[]>([])
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    void chrome.storage.local.get(CLAVE).then((s) => {
      setColecciones((s[CLAVE] as ColeccionGuardada[]) || [])
    })
  }, [])

  const guardar = useCallback(async (lista: ColeccionGuardada[]) => {
    setColecciones(lista)
    await chrome.storage.local.set({ [CLAVE]: lista })
  }, [])

  const llamar = useCallback(
    (to: string, fn: string, args: unknown[]) =>
      sendRPCToBackground<string>('eth_call', [
        { to, data: ERC721.encodeFunctionData(fn, args) },
        'latest',
      ]),
    []
  )

  const leerColeccion = useCallback(
    async (c: ColeccionGuardada): Promise<ColeccionVista> => {
      const base: ColeccionVista = { ...c, nombre: acortar(c.address), balance: 0, nfts: [], enumerable: true }
      try {
        const [nomHex, balHex] = await Promise.all([
          llamar(c.address, 'name', []).catch(() => null),
          llamar(c.address, 'balanceOf', [account]),
        ])
        if (nomHex) base.nombre = String(ERC721.decodeFunctionResult('name', nomHex)[0])
        const balance = Number(ERC721.decodeFunctionResult('balanceOf', balHex)[0])
        base.balance = balance
        if (balance === 0) return base

        // Enumerar los tokens del propietario (ERC-721 Enumerable).
        const indices = Array.from({ length: Math.min(balance, 50) }, (_, i) => i)
        let ids: bigint[]
        try {
          ids = await Promise.all(
            indices.map(async (i) => {
              const idHex = await llamar(c.address, 'tokenOfOwnerByIndex', [account, i])
              return ERC721.decodeFunctionResult('tokenOfOwnerByIndex', idHex)[0] as bigint
            })
          )
        } catch {
          base.enumerable = false
          return base
        }

        const nfts = await Promise.all(
          ids.map(async (id) => {
            const tokenId = id.toString()
            const nft: NftVista = { tokenId, uri: '', nombre: `#${tokenId}`, imagen: null }
            try {
              const uriHex = await llamar(c.address, 'tokenURI', [id])
              nft.uri = String(ERC721.decodeFunctionResult('tokenURI', uriHex)[0])
              if (nft.uri) {
                const meta = await fetch(aGateway(nft.uri))
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
                if (meta) {
                  if (meta.name) nft.nombre = String(meta.name)
                  if (meta.image) nft.imagen = aGateway(String(meta.image))
                }
              }
            } catch {
              /* token sin tokenURI legible */
            }
            return nft
          })
        )
        base.nfts = nfts
        return base
      } catch {
        return { ...base, error: 'No se pudo leer la colección (¿es ERC-721?)' }
      }
    },
    [account, llamar]
  )

  useEffect(() => {
    let cancelado = false
    if (!account || colecciones.length === 0) {
      setVistas([])
      return
    }
    setCargando(true)
    const deLaRed = colecciones.filter((c) => c.chainId === chainId)
    void Promise.all(deLaRed.map((c) => leerColeccion(c))).then((res) => {
      if (!cancelado) {
        setVistas(res)
        setCargando(false)
      }
    })
    return () => {
      cancelado = true
    }
  }, [account, chainId, colecciones, leerColeccion])

  const agregar = () => {
    const dir = nueva.trim()
    if (!RE_DIRECCION.test(dir)) {
      setError('Dirección de colección inválida (0x + 40 hex).')
      return
    }
    const address = dir.toLowerCase()
    if (colecciones.some((c) => c.address === address && c.chainId === chainId)) {
      setError('Esa colección ya está en la lista para esta red.')
      return
    }
    void guardar([...colecciones, { address, chainId }])
    setNueva('')
    setError(null)
  }

  return (
    <div className="tk-nft">
      <div className="tk-tokens__form">
        <input
          className="tk-input tk-mono"
          placeholder="Colección NFT (0x…)"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <button className="tk-btn" onClick={agregar}>
          ➕ Añadir
        </button>
      </div>
      {error && (
        <p className="tk-contactos__error" role="alert">
          {error}
        </p>
      )}
      {cargando && (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Leyendo colecciones…
        </p>
      )}

      {vistas.length === 0 && !cargando ? (
        <p className="tk-muted" style={{ fontSize: 11 }}>
          Añade una colección ERC-721 para ver tus NFTs.
        </p>
      ) : (
        vistas.map((c) => (
          <div key={`${c.chainId}:${c.address}`} className="tk-coleccion">
            <div className="tk-coleccion__cabecera">
              <div className="tk-sitio__info">
                <span className="tk-sitio__origen">{c.nombre}</span>
                <span className="tk-sitio__cuenta">
                  {c.error ? c.error : `${c.balance} NFT`}
                </span>
              </div>
              <button
                className="tk-sitio__desconectar"
                title="Quitar colección"
                onClick={() =>
                  void guardar(
                    colecciones.filter((x) => !(x.address === c.address && x.chainId === c.chainId))
                  )
                }
              >
                🗑️
              </button>
            </div>

            {!c.error && c.balance > 0 && !c.enumerable && (
              <p className="tk-muted" style={{ fontSize: 10 }}>
                Colección ERC-721 sin extensión Enumerable: no se pueden listar los tokens.
              </p>
            )}

            {c.nfts.length > 0 && (
              <div className="tk-nft__grid">
                {c.nfts.map((n) => (
                  <div key={n.tokenId} className="tk-nft__tarjeta">
                    <div className="tk-nft__imagen">
                      {n.imagen ? (
                        <img src={n.imagen} alt={n.nombre} loading="lazy" />
                      ) : (
                        <span aria-hidden>🖼️</span>
                      )}
                    </div>
                    <span className="tk-nft__nombre">{n.nombre}</span>
                    <span className="tk-nft__id">#{n.tokenId}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
