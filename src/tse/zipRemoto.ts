// Lê arquivos de dentro de um .zip remoto sem baixá-lo inteiro: busca o
// diretório central no fim do arquivo e depois só o trecho comprimido da
// entrada desejada (HTTP Range). Os zips de dados abertos do TSE têm centenas
// de MB, mas cada CSV é bem menor. Roda no navegador (o CDN do TSE libera CORS).

interface Entrada {
  nome: string
  tamanhoComprimido: number
  offset: number
  metodo: number
}

async function intervalo(url: string, inicio: number, fim: number) {
  const res = await fetch(url, { headers: { range: `bytes=${inicio}-${fim}` } })
  if (res.status !== 206) throw new Error(`${url}: HTTP ${res.status} ao pedir intervalo`)
  return new DataView(await res.arrayBuffer())
}

function ultimaAssinatura(v: DataView, assinatura: number) {
  for (let i = v.byteLength - 4; i >= 0; i--) if (v.getUint32(i, true) === assinatura) return i
  return -1
}

const diretorios = new Map<string, Promise<Map<string, Entrada>>>()

export function listarZip(url: string) {
  let p = diretorios.get(url)
  if (!p) {
    p = lerDiretorio(url)
    p.catch(() => diretorios.delete(url))
    diretorios.set(url, p)
  }
  return p
}

async function lerDiretorio(url: string) {
  const head = await fetch(url, { method: 'HEAD' })
  if (!head.ok) throw new Error(`${url}: HTTP ${head.status}`)
  const tamanho = Number(head.headers.get('content-length'))
  const fim = await intervalo(url, Math.max(0, tamanho - 65_536), tamanho - 1)

  const eocd = ultimaAssinatura(fim, 0x06054b50)
  if (eocd < 0) throw new Error(`${url}: não é um zip`)
  let cdTamanho = fim.getUint32(eocd + 12, true)
  let cdOffset = fim.getUint32(eocd + 16, true)
  if (cdOffset === 0xffffffff) {
    const eocd64 = ultimaAssinatura(fim, 0x06064b50)
    cdTamanho = Number(fim.getBigUint64(eocd64 + 40, true))
    cdOffset = Number(fim.getBigUint64(eocd64 + 48, true))
  }

  const cd = await intervalo(url, cdOffset, cdOffset + cdTamanho - 1)
  const latin1 = new TextDecoder('latin1')
  const entradas = new Map<string, Entrada>()
  let p = 0
  while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
    const metodo = cd.getUint16(p + 10, true)
    let comprimido = cd.getUint32(p + 20, true)
    const descomprimido = cd.getUint32(p + 24, true)
    let offset = cd.getUint32(p + 42, true)
    const nNome = cd.getUint16(p + 28, true)
    const nExtra = cd.getUint16(p + 30, true)
    const nComentario = cd.getUint16(p + 32, true)
    const nome = latin1.decode(new Uint8Array(cd.buffer, p + 46, nNome))

    // Campo extra Zip64: os valores aparecem na ordem descomprimido, comprimido, offset.
    let e = p + 46 + nNome
    const fimExtra = e + nExtra
    while (e + 4 <= fimExtra) {
      const id = cd.getUint16(e, true)
      const tam = cd.getUint16(e + 2, true)
      if (id === 1) {
        let q = e + 4
        if (descomprimido === 0xffffffff) q += 8
        if (comprimido === 0xffffffff) {
          comprimido = Number(cd.getBigUint64(q, true))
          q += 8
        }
        if (offset === 0xffffffff) offset = Number(cd.getBigUint64(q, true))
      }
      e += 4 + tam
    }

    entradas.set(nome, { nome, tamanhoComprimido: comprimido, offset, metodo })
    p = fimExtra + nComentario
  }
  return entradas
}

// Linhas (latin1) de uma entrada do zip, descomprimidas em streaming.
export async function* linhasDoZip(url: string, nome: string): AsyncGenerator<string> {
  const entrada = (await listarZip(url)).get(nome)
  if (!entrada) throw new Error(`${nome} não encontrado em ${url}`)
  if (entrada.metodo !== 8) throw new Error(`${nome}: compressão ${entrada.metodo} não suportada`)

  const local = await intervalo(url, entrada.offset, entrada.offset + 29)
  const inicio = entrada.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
  const res = await fetch(url, {
    headers: { range: `bytes=${inicio}-${inicio + entrada.tamanhoComprimido - 1}` },
  })
  if (res.status !== 206 || !res.body) throw new Error(`${nome}: HTTP ${res.status}`)

  const leitor = res.body
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .pipeThrough(new TextDecoderStream('latin1'))
    .getReader()
  let resto = ''
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    const linhas = (resto + value).split('\n')
    resto = linhas.pop()!
    for (const l of linhas) yield l.endsWith('\r') ? l.slice(0, -1) : l
  }
  if (resto) yield resto
}

// CSV do TSE: separador ";", valores entre aspas, sem ";" dentro dos campos.
// `colunas` limita o registro às colunas pedidas (bem mais rápido em arquivos grandes).
export async function* registrosCsv(
  url: string,
  nome: string,
  { colunas }: { colunas?: string[] } = {},
): AsyncGenerator<Record<string, string>> {
  let indices: [string, number][] | null = null
  for await (const linha of linhasDoZip(url, nome)) {
    if (!linha) continue
    if (!indices) {
      const cabecalho = linha.split(';').map((c) => c.replace(/^"|"$/g, ''))
      indices = cabecalho.map((c, i) => [c, i] as [string, number]).filter(([c]) => !colunas || colunas.includes(c))
      continue
    }
    const valores = linha.split(';')
    const r: Record<string, string> = {}
    for (const [c, i] of indices) r[c] = valores[i]?.replace(/^"|"$/g, '') ?? ''
    yield r
  }
}
