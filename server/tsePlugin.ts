import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'
import type { Apuracao, Candidato, LiderUf, PontoHistorico, RespostaApi, ResumoCargo } from '../src/types.ts'

// Eleição Ordinária Federal 2026 – 1º turno (código 6257), cargo Presidente (0001).
// Os códigos vêm de https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
const CICLO = process.env.TSE_CICLO ?? 'ele2026'
const ELEICAO = process.env.TSE_ELEICAO ?? '6257'
const BASE = `https://resultados.tse.jus.br/oficial/${CICLO}/${ELEICAO}`
const ELE_PAD = ELEICAO.padStart(6, '0')
const URL_RESULTADO = `${BASE}/dados/br/br-c0001-e${ELE_PAD}-u.json`
const INTERVALO_MS = 20_000
const ARQ_HISTORICO = resolve(process.cwd(), `data/historico-${CICLO}-${ELEICAO}.json`)

// Resumo do Rio Grande do Norte: 2 primeiros colocados de cada cargo.
// Cargos da eleição estadual (6259).
const UF = 'rn'
const CARGOS_UF = [
  { cargo: 'Governador', eleicao: '6259', codigo: 3 },
  { cargo: 'Senador', eleicao: '6259', codigo: 5 },
  { cargo: 'Deputado Federal', eleicao: '6259', codigo: 6 },
  { cargo: 'Deputado Estadual', eleicao: '6259', codigo: 7 },
].map((c) => {
  const base = `https://resultados.tse.jus.br/oficial/${CICLO}/${c.eleicao}`
  const cod = String(c.codigo).padStart(4, '0')
  return {
    cargo: c.cargo,
    url: `${base}/dados/${UF}/${UF}-c${cod}-e${c.eleicao.padStart(6, '0')}-u.json`,
    fotos: `${base}/fotos/${UF}`,
  }
})

// Mapas: líder de Presidente e de Governador em cada UF. São 54 arquivos,
// então são buscados com intervalo maior que o resultado nacional.
const MAPA_INTERVALO_MS = 60_000
const UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split(' ')
const MAPAS = {
  presidente: { eleicao: ELEICAO, codigo: '0001' },
  governador: { eleicao: '6259', codigo: '0003' },
} as const
type NomeMapa = keyof typeof MAPAS

const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)

function converter(raw: any, fotos = `${BASE}/fotos/br`): Apuracao {
  const cargo = raw.carg[0]
  const candidatos: Candidato[] = []
  for (const agr of cargo.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        candidatos.push({
          numero: c.n,
          nome: c.nmu,
          nomeCompleto: c.nm,
          partido: par.sg,
          vice: c.vs?.[0]?.nmu ?? '',
          votos: num(c.vap),
          pct: num(c.pvapn),
          eleito: c.e === 's',
          situacao: c.st ?? '',
          foto: `${fotos}/${c.sqcand}.jpeg`,
        })
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos)
  const [d, m, a] = raw.dg.split('/')
  return {
    atualizadoEm: `${a}-${m}-${d}T${raw.hg}-03:00`,
    secoesTotal: num(raw.s.ts),
    secoesTotalizadas: num(raw.s.st),
    pctSecoes: num(raw.s.pstn),
    eleitorado: num(raw.e.te),
    comparecimento: num(raw.e.c),
    abstencao: num(raw.e.a),
    pctComparecimento: num(raw.e.pcn),
    totalVotos: num(raw.v.tv),
    votosValidos: num(raw.v.vv),
    brancos: num(raw.v.vb),
    nulos: num(raw.v.tvn),
    totalizacaoFinal: raw.tf === 's',
    matematicamenteDefinida: raw.md === 's',
    candidatos,
  }
}

const resumir = (c: Candidato) => ({ nome: c.nome, partido: c.partido, pct: c.pct, votos: c.votos })

export function tsePlugin(): Plugin {
  let historico: PontoHistorico[] = []
  let atual: Apuracao | null = null
  let ultimaBusca: string | null = null
  let erro: string | null = null
  let uf: ResumoCargo[] = []
  const mapas: Record<NomeMapa, Record<string, LiderUf>> = { presidente: {}, governador: {} }
  let timerMapa: NodeJS.Timeout | undefined
  let timer: NodeJS.Timeout | undefined

  if (existsSync(ARQ_HISTORICO)) {
    try {
      historico = JSON.parse(readFileSync(ARQ_HISTORICO, 'utf8'))
    } catch {
      historico = []
    }
  }

  async function buscar() {
    try {
      const res = await fetch(URL_RESULTADO, { headers: { 'cache-control': 'no-cache' } })
      if (!res.ok) throw new Error(`TSE respondeu HTTP ${res.status}`)
      atual = converter(await res.json())
      erro = null
      const ultimo = historico[historico.length - 1]
      if (!ultimo || ultimo.atualizadoEm !== atual.atualizadoEm) {
        historico.push({
          atualizadoEm: atual.atualizadoEm,
          pctSecoes: atual.pctSecoes,
          votosValidos: atual.votosValidos,
          votos: Object.fromEntries(atual.candidatos.map((c) => [c.numero, c.votos])),
        })
        mkdirSync(dirname(ARQ_HISTORICO), { recursive: true })
        writeFileSync(ARQ_HISTORICO, JSON.stringify(historico))
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
      console.error('[tse] falha ao buscar resultados:', erro)
    } finally {
      ultimaBusca = new Date().toISOString()
    }
  }

  async function buscarUf() {
    const resultados = await Promise.all(
      CARGOS_UF.map(async (c): Promise<ResumoCargo | null> => {
        try {
          const res = await fetch(c.url, { headers: { 'cache-control': 'no-cache' } })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const a = converter(await res.json(), c.fotos)
          return {
            cargo: c.cargo,
            atualizadoEm: a.atualizadoEm,
            pctSecoes: a.pctSecoes,
            candidatos: a.candidatos.slice(0, 2),
          }
        } catch (e) {
          console.error(`[tse] falha ao buscar ${c.cargo} (${UF}):`, e instanceof Error ? e.message : e)
          return uf.find((r) => r.cargo === c.cargo) ?? null
        }
      }),
    )
    uf = resultados.filter((r): r is ResumoCargo => r !== null)
  }

  async function buscarMapas() {
    const tarefas = (Object.keys(MAPAS) as NomeMapa[]).flatMap((nome) =>
      UFS.map(async (sigla) => {
        const { eleicao, codigo } = MAPAS[nome]
        const url = `https://resultados.tse.jus.br/oficial/${CICLO}/${eleicao}/dados/${sigla}/${sigla}-c${codigo}-e${eleicao.padStart(6, '0')}-u.json`
        try {
          const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const a = converter(await res.json())
          const [primeiro, segundo] = a.candidatos
          mapas[nome][sigla] = {
            uf: sigla,
            pctSecoes: a.pctSecoes,
            lider: primeiro && primeiro.votos > 0 ? resumir(primeiro) : null,
            segundo: segundo && segundo.votos > 0 ? resumir(segundo) : null,
          }
        } catch (e) {
          console.error(`[tse] falha ao buscar mapa ${nome} (${sigla}):`, e instanceof Error ? e.message : e)
        }
      }),
    )
    await Promise.all(tarefas)
  }

  function ciclo() {
    buscar()
    buscarUf()
  }

  function iniciar() {
    if (timer) return
    ciclo()
    timer = setInterval(ciclo, INTERVALO_MS)
    buscarMapas()
    timerMapa = setInterval(buscarMapas, MAPA_INTERVALO_MS)
  }

  function parar() {
    clearInterval(timer)
    clearInterval(timerMapa)
    timer = timerMapa = undefined
  }

  function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url?.split('?')[0] !== '/api/apuracao') return next()
    const corpo: RespostaApi = {
      atual,
      historico,
      ultimaBusca,
      erro,
      uf: { sigla: UF.toUpperCase(), cargos: uf },
      mapas,
      fonte: URL_RESULTADO,
      intervaloMs: INTERVALO_MS,
    }
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(corpo))
  }

  return {
    name: 'tse-apuracao',
    configureServer(server) {
      iniciar()
      server.middlewares.use(handler)
      server.httpServer?.on('close', parar)
    },
    configurePreviewServer(server) {
      iniciar()
      server.middlewares.use(handler)
      server.httpServer?.on('close', parar)
    },
  }
}
