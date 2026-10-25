import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { createInflateRaw } from 'node:zlib'

// Lê arquivos de dentro de um .zip remoto sem baixá-lo inteiro: busca o
// diretório central no fim do arquivo e depois só o trecho comprimido da
// entrada desejada (HTTP Range). Os zips de dados abertos do TSE têm centenas
// de MB, mas os CSVs que interessam têm poucos MB.

interface Entrada {
  nome: string
  tamanhoComprimido: number
  offset: number
  metodo: number
}

async function intervalo(url: string, inicio: number, fim: number) {
  const res = await fetch(url, { headers: { range: `bytes=${inicio}-${fim}` } })
  if (res.status !== 206) throw new Error(`${url}: HTTP ${res.status} ao pedir intervalo`)
  return Buffer.from(await res.arrayBuffer())
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

  const eocd = fim.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error(`${url}: não é um zip`)
  let cdTamanho = fim.readUInt32LE(eocd + 12)
  let cdOffset = fim.readUInt32LE(eocd + 16)
  if (cdOffset === 0xffffffff) {
    const eocd64 = fim.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]))
    cdTamanho = Number(fim.readBigUInt64LE(eocd64 + 40))
    cdOffset = Number(fim.readBigUInt64LE(eocd64 + 48))
  }

  const cd = await intervalo(url, cdOffset, cdOffset + cdTamanho - 1)
  const entradas = new Map<string, Entrada>()
  let p = 0
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const metodo = cd.readUInt16LE(p + 10)
    let comprimido = cd.readUInt32LE(p + 20)
    const descomprimido = cd.readUInt32LE(p + 24)
    let offset = cd.readUInt32LE(p + 42)
    const nNome = cd.readUInt16LE(p + 28)
    const nExtra = cd.readUInt16LE(p + 30)
    const nComentario = cd.readUInt16LE(p + 32)
    const nome = cd.toString('latin1', p + 46, p + 46 + nNome)

    // Campo extra Zip64: os valores aparecem na ordem descomprimido, comprimido, offset.
    let e = p + 46 + nNome
    const fimExtra = e + nExtra
    while (e + 4 <= fimExtra) {
      const id = cd.readUInt16LE(e)
      const tam = cd.readUInt16LE(e + 2)
      if (id === 1) {
        let q = e + 4
        if (descomprimido === 0xffffffff) q += 8
        if (comprimido === 0xffffffff) {
          comprimido = Number(cd.readBigUInt64LE(q))
          q += 8
        }
        if (offset === 0xffffffff) offset = Number(cd.readBigUInt64LE(q))
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
  const inicio = entrada.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
  const res = await fetch(url, {
    headers: { range: `bytes=${inicio}-${inicio + entrada.tamanhoComprimido - 1}` },
  })
  if (res.status !== 206 || !res.body) throw new Error(`${nome}: HTTP ${res.status}`)

  const fluxo = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(createInflateRaw())
  fluxo.setEncoding('latin1')
  yield* createInterface({ input: fluxo, crlfDelay: Infinity })
}

// CSV do TSE: separador ";", valores entre aspas, sem ";" dentro dos campos.
// `colunas` limita o registro às colunas pedidas (bem mais rápido em arquivos grandes).
export async function* registrosCsv(
  url: string,
  nome: string,
  { filtro, colunas }: { filtro?: (linha: string) => boolean; colunas?: string[] } = {},
): AsyncGenerator<Record<string, string>> {
  let indices: [string, number][] | null = null
  for await (const linha of linhasDoZip(url, nome)) {
    if (!linha) continue
    if (!indices) {
      const cabecalho = linha.split(';').map((c) => c.replace(/^"|"$/g, ''))
      indices = cabecalho.map((c, i) => [c, i] as [string, number]).filter(([c]) => !colunas || colunas.includes(c))
      continue
    }
    if (filtro && !filtro(linha)) continue
    const valores = linha.split(';')
    const r: Record<string, string> = {}
    for (const [c, i] of indices) r[c] = valores[i]?.replace(/^"|"$/g, '') ?? ''
    yield r
  }
}
