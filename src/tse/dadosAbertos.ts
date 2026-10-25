import type { Apuracao, Candidato, LiderUf, ResumoCargo } from '../types.ts'
import { registrosCsv } from './zipRemoto.ts'

// Eleições anteriores: o portal de resultados só mantém o ciclo atual, então o
// resultado final vem dos dados abertos do TSE (cdn.tse.jus.br/estatistica).
// O CDN dos dados abertos manda o cabeçalho CORS duplicado e o navegador recusa,
// então isto roda no deploy (scripts/gerar-anos.ts): cada ano vira um JSON
// publicado junto com o site, sem passar pelo repositório.
//   votacao_candidato_munzona_<ano>.zip → votos por candidato, município e zona
//   detalhe_votacao_munzona_<ano>.zip   → eleitorado, comparecimento, brancos e nulos
export const ANOS_DADOS_ABERTOS = [2022, 2018, 2014]

const BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele'
export const urlCandidatos = (ano: number) =>
  `${BASE}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`
const urlDetalhe = (ano: number) => `${BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_${ano}.zip`

// Estado baixado primeiro (o padrão da página); os demais vêm em seguida.
const UF_PRIORITARIA = 'RN'
const CARGOS_RESUMO: Record<string, string> = {
  '3': 'Governador',
  '5': 'Senador',
  '6': 'Deputado Federal',
  '7': 'Deputado Estadual',
}
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ')
const PARALELO = 4
const COLUNAS_CANDIDATO = [
  'NR_TURNO',
  'CD_CARGO',
  'SG_UF',
  'DT_ELEICAO',
  'SQ_CANDIDATO',
  'NR_CANDIDATO',
  'NM_CANDIDATO',
  'NM_URNA_CANDIDATO',
  'SG_PARTIDO',
  'DS_SIT_TOT_TURNO',
  'QT_VOTOS_NOMINAIS',
  'QT_VOTOS_NOMINAIS_VALIDOS',
]

export interface ResultadoTurno {
  atual: Apuracao | null
  // Resumo por UF (sigla minúscula): cargos estaduais e de deputado.
  estados: Record<string, ResumoCargo[]>
  mapas: { presidente: Record<string, LiderUf>; governador: Record<string, LiderUf> }
}

export interface ResultadoAno {
  turnos: Record<1 | 2, ResultadoTurno>
  data: Record<1 | 2, string>
}

type Base = Omit<Candidato, 'votos' | 'pct'>
type Soma = Map<string, { c: Base; votos: number }>

interface Detalhe {
  aptos: number
  secoes: number
  comparecimento: number
  abstencoes: number
  votos: number
  validos: number
  brancos: number
  nulos: number
  atualizadoEm: string
}

const n = (s: string) => Number(s) || 0
// 2014 não tem a coluna de votos nominais válidos, só a de votos nominais.
const votosDe = (r: Record<string, string>) => n(r.QT_VOTOS_NOMINAIS_VALIDOS ?? r.QT_VOTOS_NOMINAIS)
const SITUACAO: Record<string, string> = { 'NÃO ELEITO': 'Não eleito', '2º TURNO': '2º turno', SUPLENTE: 'Suplente' }
const dataIso = (d: string) => d.split('/').reverse().join('-')

function somar(mapa: Map<string, Soma>, chave: string, r: Record<string, string>) {
  let soma = mapa.get(chave)
  if (!soma) mapa.set(chave, (soma = new Map()))
  const atual = soma.get(r.SQ_CANDIDATO)
  if (atual) {
    atual.votos += votosDe(r)
    return
  }
  const sit = r.DS_SIT_TOT_TURNO
  soma.set(r.SQ_CANDIDATO, {
    votos: votosDe(r),
    c: {
      numero: r.NR_CANDIDATO,
      nome: r.NM_URNA_CANDIDATO,
      nomeCompleto: r.NM_CANDIDATO,
      partido: r.SG_PARTIDO,
      vice: '',
      eleito: sit.startsWith('ELEITO'),
      situacao: sit.startsWith('ELEITO') ? 'Eleito' : (SITUACAO[sit] ?? ''),
      foto: '',
    },
  })
}

function ordenar(soma: Soma | undefined, validos?: number): Candidato[] {
  if (!soma) return []
  const lista = [...soma.values()]
  const total = validos || lista.reduce((s, x) => s + x.votos, 0) || 1
  return lista
    .filter((x) => x.votos > 0)
    .map((x) => ({ ...x.c, votos: x.votos, pct: (x.votos / total) * 100 }))
    .sort((a, b) => b.votos - a.votos)
}

function lider(uf: string, soma: Soma | undefined): LiderUf {
  const [primeiro, segundo] = ordenar(soma)
  const resumo = (c?: Candidato) => (c ? { nome: c.nome, partido: c.partido, pct: c.pct, votos: c.votos } : null)
  return { uf: uf.toLowerCase(), pctSecoes: 100, lider: resumo(primeiro), segundo: resumo(segundo) }
}

// Chave: turno|cargo|UF (UF = "BR" no arquivo nacional de Presidente).
async function lerDetalhe(ano: number, arquivo: string, porUf: boolean) {
  const detalhes = new Map<string, Detalhe>()
  for await (const r of registrosCsv(urlDetalhe(ano), arquivo)) {
    const chave = `${r.NR_TURNO}|${r.CD_CARGO}|${porUf ? r.SG_UF : 'BR'}`
    let d = detalhes.get(chave)
    if (!d) {
      d = { aptos: 0, secoes: 0, comparecimento: 0, abstencoes: 0, votos: 0, validos: 0, brancos: 0, nulos: 0, atualizadoEm: '' }
      detalhes.set(chave, d)
    }
    d.aptos += n(r.QT_APTOS)
    d.secoes += n(r.QT_TOTAL_SECOES)
    d.comparecimento += n(r.QT_COMPARECIMENTO)
    d.abstencoes += n(r.QT_ABSTENCOES)
    d.votos += n(r.QT_VOTOS)
    d.validos += n(r.QT_TOTAL_VOTOS_VALIDOS)
    d.brancos += n(r.QT_VOTOS_BRANCOS)
    d.nulos += n(r.QT_TOTAL_VOTOS_NULOS)
    const quando = `${dataIso(r.DT_ULTIMA_TOTALIZACAO)}T${r.HH_ULTIMA_TOTALIZACAO}-03:00`
    if (quando > d.atualizadoEm) d.atualizadoEm = quando
  }
  return detalhes
}

// Monta o resultado final do ano. `progresso` recebe mensagens de andamento.
export async function montarAno(ano: number, progresso: (msg: string) => void = () => {}): Promise<ResultadoAno> {
  const vazio = (): ResultadoTurno => ({ atual: null, estados: {}, mapas: { presidente: {}, governador: {} } })
  const r: ResultadoAno = { turnos: { 1: vazio(), 2: vazio() }, data: { 1: '', 2: '' } }
  const urlCand = urlCandidatos(ano)
  const presidente = new Map<string, Soma>()
  const cargos = new Map<string, Soma>()

  // Votos de um estado nos cargos do resumo (governador, senador, deputados).
  async function lerUf(uf: string) {
    for await (const c of registrosCsv(urlCand, `votacao_candidato_munzona_${ano}_${uf}.csv`, {
      colunas: COLUNAS_CANDIDATO,
    })) {
      if (CARGOS_RESUMO[c.CD_CARGO]) somar(cargos, `${c.NR_TURNO}|${c.CD_CARGO}|${uf}`, c)
    }
  }

  // 1ª etapa (poucos MB): Presidente no Brasil e por UF, comparecimento e o estado prioritário.
  const [detBr, detUf] = await Promise.all([
    lerDetalhe(ano, `detalhe_votacao_munzona_${ano}_BR.csv`, false),
    lerDetalhe(ano, `detalhe_votacao_munzona_${ano}_BRASIL.csv`, true),
    (async () => {
      for await (const c of registrosCsv(urlCand, `votacao_candidato_munzona_${ano}_BR.csv`, {
        colunas: COLUNAS_CANDIDATO,
      })) {
        if (c.CD_CARGO !== '1') continue
        r.data[n(c.NR_TURNO) as 1 | 2] = dataIso(c.DT_ELEICAO)
        somar(presidente, c.NR_TURNO, c)
        if (c.SG_UF !== 'ZZ') somar(presidente, `${c.NR_TURNO}|${c.SG_UF}`, c)
      }
    })(),
    lerUf(UF_PRIORITARIA),
  ])

  const publicar = (uf: string) => {
    for (const turno of [1, 2] as const) {
      const t = r.turnos[turno]
      const resumo = Object.entries(CARGOS_RESUMO).flatMap(([cod, cargo]) => {
        const det = detUf.get(`${turno}|${cod}|${uf}`)
        const candidatos = ordenar(cargos.get(`${turno}|${cod}|${uf}`), det?.validos).slice(0, 2)
        if (!candidatos.length) return []
        return [{ cargo, atualizadoEm: det?.atualizadoEm ?? '', pctSecoes: 100, candidatos }]
      })
      if (resumo.length) t.estados[uf.toLowerCase()] = resumo
      const governador = cargos.get(`${turno}|3|${uf}`)
      if (governador) t.mapas.governador[uf.toLowerCase()] = lider(uf, governador)
    }
  }

  for (const turno of [1, 2] as const) {
    const t = r.turnos[turno]
    const d = detBr.get(`${turno}|1|BR`)
    if (d) t.atual = apuracao(d, ordenar(presidente.get(String(turno)), d.validos))
    for (const uf of UFS) {
      const soma = presidente.get(`${turno}|${uf}`)
      if (soma) t.mapas.presidente[uf.toLowerCase()] = lider(uf, soma)
    }
  }
  publicar(UF_PRIORITARIA)

  // 2ª etapa (centenas de MB): os demais estados, um arquivo por UF.
  const restantes = UFS.filter((uf) => uf !== UF_PRIORITARIA)
  let feitos = 0
  const fila = [...restantes]
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      for (let uf = fila.shift(); uf; uf = fila.shift()) {
        await lerUf(uf)
        publicar(uf)
        feitos++
        progresso(`${ano}: ${feitos} de ${restantes.length} estados`)
      }
    }),
  )
  return r
}

function apuracao(d: Detalhe, candidatos: Candidato[]): Apuracao {
  return {
    atualizadoEm: d.atualizadoEm,
    secoesTotal: d.secoes,
    secoesTotalizadas: d.secoes,
    pctSecoes: 100,
    eleitorado: d.aptos,
    eleitoradoNaoApurado: 0,
    comparecimento: d.comparecimento,
    abstencao: d.abstencoes,
    pctComparecimento: d.aptos ? (d.comparecimento / d.aptos) * 100 : 0,
    totalVotos: d.votos,
    votosValidos: d.validos,
    brancos: d.brancos,
    nulos: d.nulos,
    totalizacaoFinal: true,
    andamento: 'final',
    matematicamenteDefinida: true,
    candidatos,
  }
}
