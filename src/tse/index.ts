import type {
  Apuracao,
  Candidato,
  LiderUf,
  OpcaoEleicao,
  PontoHistorico,
  RespostaApi,
  ResumoCargo,
} from '../types'
import { ANOS_DADOS_ABERTOS, type ResultadoAno, urlCandidatos } from './dadosAbertos.ts'

// A página é estática (GitHub Pages). O ciclo atual vem direto do portal de
// resultados do TSE, que libera CORS. Os anos anteriores são JSONs gerados no
// deploy a partir dos dados abertos do TSE (ver scripts/gerar-anos.ts).
// Eleições do ciclo atual vêm do portal de resultados (ao vivo). A lista de
// eleições e seus códigos sai de ele-c.json: a federal (tipo 8) tem o cargo
// Presidente e a estadual (tipo 1) do mesmo ciclo e turno tem os demais.
const PORTAL = 'https://resultados.tse.jus.br/oficial'
const URL_CONFIG = `${PORTAL}/comum/config/ele-c.json`
const INTERVALO_MS = 20_000
const MAPA_INTERVALO_MS = 60_000
// Passados estes dias da votação, uma captura completa basta: não há mais o que atualizar.
const DIAS_ENCERRAMENTO = 3

// Resumo por estado: 2 primeiros colocados de cada cargo. Só os estados que
// estão na tela são buscados.
const CARGOS_UF = [
  { cargo: 'Governador', codigo: 3, segundoTurno: true },
  { cargo: 'Senador', codigo: 5, segundoTurno: false },
  { cargo: 'Deputado Federal', codigo: 6, segundoTurno: false },
  { cargo: 'Deputado Estadual', codigo: 7, segundoTurno: false },
]

// Mapas: líder de Presidente e de Governador em cada UF. São 54 arquivos,
// então são buscados com intervalo maior que o resultado nacional.
export const UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split(' ')
type NomeMapa = 'presidente' | 'governador'

interface ConfigAoVivo {
  opcao: OpcaoEleicao
  ciclo: string
  federal: string
  estadual: string | null
}

// Usada se ele-c.json não responder: Eleição Ordinária Federal 2026.
const PADRAO: ConfigAoVivo[] = [
  { opcao: { ano: 2026, turno: 1, data: '2026-10-04', aoVivo: true }, ciclo: 'ele2026', federal: '6257', estadual: '6259' },
  { opcao: { ano: 2026, turno: 2, data: '2026-10-25', aoVivo: true }, ciclo: 'ele2026', federal: '6258', estadual: '6260' },
]

const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)
const pad = (eleicao: string) => eleicao.padStart(6, '0')
const urlDados = (ciclo: string, eleicao: string, uf: string, cargo: number | string) =>
  `${PORTAL}/${ciclo}/${eleicao}/dados/${uf}/${uf}-c${String(cargo).padStart(4, '0')}-e${pad(eleicao)}-u.json`
const ANDAMENTO = { n: 'nao-iniciada', p: 'parcial', f: 'final' } as const

function converter(raw: any, fotos: string): Apuracao {
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
    eleitoradoNaoApurado: num(raw.e.esnt),
    comparecimento: num(raw.e.c),
    abstencao: num(raw.e.a),
    pctComparecimento: num(raw.e.pcn),
    totalVotos: num(raw.v.tv),
    votosValidos: num(raw.v.vv),
    brancos: num(raw.v.vb),
    nulos: num(raw.v.tvn),
    totalizacaoFinal: raw.tf === 's',
    andamento: ANDAMENTO[raw.and as keyof typeof ANDAMENTO] ?? 'parcial',
    matematicamenteDefinida: raw.md === 's',
    candidatos,
  }
}

const resumir = (c: Candidato) => ({ nome: c.nome, partido: c.partido, pct: c.pct, votos: c.votos })

class SemArquivo extends Error {}

async function baixar(url: string, fotos: string) {
  const res = await fetch(url, { cache: 'no-store' })
  // O TSE responde 404 para cargos sem disputa (ex.: governador sem 2º turno).
  if (res.status === 404 || res.status === 403) throw new SemArquivo(`HTTP ${res.status}`)
  if (!res.ok) throw new Error(`TSE respondeu HTTP ${res.status}`)
  return converter(await res.json(), fotos)
}

async function lerConfig(): Promise<ConfigAoVivo[]> {
  const res = await fetch(URL_CONFIG, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const cfg: any = await res.json()
  const eleicoes = (cfg.pl as any[]).flatMap((p) => (p.e as any[]).map((e) => ({ ...e, ciclo: p.c, dt: p.dt })))
  return eleicoes
    .filter((e) => e.tp === '8')
    .map((e) => {
      const estadual = eleicoes.find((x) => x.tp === '1' && x.ciclo === e.ciclo && x.t === e.t)
      return {
        opcao: {
          ano: Number(e.ciclo.replace('ele', '')),
          turno: Number(e.t) as 1 | 2,
          data: e.dt.split('/').reverse().join('-'),
          aoVivo: true,
        },
        ciclo: e.ciclo,
        federal: e.cd,
        estadual: estadual?.cd ?? null,
      }
    })
}

type Situacao = 'final' | 'parcial' | 'ausente' | 'erro'

// Avisos para a página: algum dado novo chegou.
const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((fn) => fn())
export function aoAtualizar(fn: () => void) {
  ouvintes.add(fn)
  return () => {
    ouvintes.delete(fn)
  }
}

function lerHistorico(chave: string): PontoHistorico[] {
  try {
    const salvo = localStorage.getItem(chave)
    return salvo ? JSON.parse(salvo) : []
  } catch {
    return []
  }
}

function gravarHistorico(chave: string, historico: PontoHistorico[]) {
  try {
    localStorage.setItem(chave, JSON.stringify(historico))
  } catch {
    // Sem armazenamento (aba anônima, cota cheia): o gráfico vale só para esta visita.
  }
}

function criarAoVivo(cfg: ConfigAoVivo) {
  const { ciclo, federal, estadual, opcao } = cfg
  const urlPresidente = urlDados(ciclo, federal, 'br', 1)
  // O histórico da evolução fica no navegador de quem acompanha.
  const chaveHistorico = `historico-${ciclo}-${federal}`
  const cargosUf = CARGOS_UF.filter((c) => opcao.turno === 1 || c.segundoTurno)
  const mapasCfg: Record<NomeMapa, { eleicao: string | null; codigo: number }> = {
    presidente: { eleicao: federal, codigo: 1 },
    governador: { eleicao: estadual, codigo: 3 },
  }

  const historico = lerHistorico(chaveHistorico)
  let atual: Apuracao | null = null
  let ultimaBusca: string | null = null
  let erro: string | null = null
  const resumos = new Map<string, ResumoCargo[]>()
  const buscandoUf = new Set<string>()
  const mapas: Record<NomeMapa, Record<string, LiderUf>> = { presidente: {}, governador: {} }
  const situacao = new Map<string, Situacao>()
  let mapasCompletos = false
  let encerrada = false
  let siglasNaTela: string[] = []
  // Instante da última rodada iniciada (0 = nunca); null enquanto uma rodada está em andamento.
  let rodadaEm: number | null = 0
  let mapasEm: number | null = 0

  const situacaoDe = (a: Apuracao): Situacao => (a.totalizacaoFinal ? 'final' : 'parcial')
  const falha = (chave: string, e: unknown): null => {
    const ausente = e instanceof SemArquivo
    situacao.set(chave, ausente ? 'ausente' : 'erro')
    if (!ausente) console.error(`[tse] falha ao buscar ${chave}:`, e instanceof Error ? e.message : e)
    return null
  }

  async function buscar() {
    try {
      atual = await baixar(urlPresidente, `${PORTAL}/${ciclo}/${federal}/fotos/br`)
      situacao.set('presidente', situacaoDe(atual))
      erro = null
      const ultimo = historico[historico.length - 1]
      if (atual.andamento !== 'nao-iniciada' && (!ultimo || ultimo.atualizadoEm !== atual.atualizadoEm)) {
        historico.push({
          atualizadoEm: atual.atualizadoEm,
          pctSecoes: atual.pctSecoes,
          votosValidos: atual.votosValidos,
          votos: Object.fromEntries(atual.candidatos.map((c) => [c.numero, c.votos])),
        })
        gravarHistorico(chaveHistorico, historico)
      }
    } catch (e) {
      situacao.set('presidente', 'erro')
      erro = e instanceof Error ? e.message : String(e)
      console.error('[tse] falha ao buscar resultados:', erro)
    } finally {
      ultimaBusca = new Date().toISOString()
    }
  }

  async function buscarUf(sigla: string) {
    if (!estadual || buscandoUf.has(sigla)) return
    buscandoUf.add(sigla)
    const anterior = resumos.get(sigla) ?? []
    const resultados = await Promise.all(
      cargosUf.map(async (c): Promise<ResumoCargo | null> => {
        const chave = `uf:${sigla}:${c.cargo}`
        try {
          const a = await baixar(urlDados(ciclo, estadual, sigla, c.codigo), `${PORTAL}/${ciclo}/${estadual}/fotos/${sigla}`)
          situacao.set(chave, situacaoDe(a))
          return { cargo: c.cargo, atualizadoEm: a.atualizadoEm, pctSecoes: a.pctSecoes, candidatos: a.candidatos.slice(0, 2) }
        } catch (e) {
          falha(chave, e)
          return e instanceof SemArquivo ? null : (anterior.find((r) => r.cargo === c.cargo) ?? null)
        }
      }),
    )
    resumos.set(sigla, resultados.filter((r): r is ResumoCargo => r !== null))
    buscandoUf.delete(sigla)
    emitir()
  }

  async function buscarMapas() {
    const tarefas = (Object.keys(mapasCfg) as NomeMapa[]).flatMap((nome) =>
      UFS.map(async (sigla) => {
        const { eleicao, codigo } = mapasCfg[nome]
        if (!eleicao) return
        const chave = `mapa:${nome}:${sigla}`
        try {
          const a = await baixar(urlDados(ciclo, eleicao, sigla, codigo), '')
          situacao.set(chave, situacaoDe(a))
          const [primeiro, segundo] = a.candidatos
          mapas[nome][sigla] = {
            uf: sigla,
            pctSecoes: a.pctSecoes,
            lider: primeiro && primeiro.votos > 0 ? resumir(primeiro) : null,
            segundo: segundo && segundo.votos > 0 ? resumir(segundo) : null,
          }
        } catch (e) {
          falha(chave, e)
        }
      }),
    )
    await Promise.all(tarefas)
    mapasCompletos = true
  }

  // Encerra quando tudo foi totalizado, ou quando a votação já passou faz dias
  // (algum arquivo pode nunca chegar a "final", ex.: seções sub judice).
  function avaliar() {
    if (!atual || !mapasCompletos) return
    const estados = [...situacao.values()]
    const tudoFinal = estados.every((s) => s === 'final' || s === 'ausente')
    const passou = Date.now() - Date.parse(`${opcao.data}T00:00:00-03:00`) > DIAS_ENCERRAMENTO * 86_400_000
    if (tudoFinal || (passou && !estados.includes('erro'))) encerrada = true
  }

  async function rodada() {
    rodadaEm = null
    await Promise.all([buscar(), ...siglasNaTela.map(buscarUf)])
    rodadaEm = Date.now()
    avaliar()
    emitir()
  }

  async function rodadaMapas() {
    mapasEm = null
    await buscarMapas()
    mapasEm = Date.now()
    avaliar()
    emitir()
  }

  // Chamada a cada consulta da página: dispara as buscas vencidas e devolve o estado atual.
  function resposta(siglas: string[]): RespostaApi {
    const agora = Date.now()
    siglasNaTela = siglas
    if (!encerrada) {
      if (rodadaEm !== null && agora - rodadaEm >= INTERVALO_MS) rodada()
      if (mapasEm !== null && agora - mapasEm >= MAPA_INTERVALO_MS) rodadaMapas()
    }
    // Estado novo na tela: busca já, sem esperar a próxima rodada (também depois de encerrada).
    for (const sigla of siglas) if (!resumos.has(sigla)) buscarUf(sigla)
    const faltam = siglas.filter((sigla) => !resumos.has(sigla)).length
    return {
      eleicao: opcao,
      atual,
      historico: [...historico],
      ultimaBusca,
      erro,
      estados: siglas.flatMap((sigla) => {
        const cargos = resumos.get(sigla)
        return cargos?.length ? [{ sigla, cargos }] : []
      }),
      mapas: { presidente: { ...mapas.presidente }, governador: { ...mapas.governador } },
      carregando: !mapasCompletos
        ? 'Carregando mapas dos estados…'
        : faltam && estadual
          ? `Carregando ${faltam === 1 ? 'resultados do estado' : `${faltam} estados`}…`
          : null,
      encerrada,
      fonte: urlPresidente,
      intervaloMs: encerrada ? null : INTERVALO_MS,
    }
  }

  return { opcao, resposta }
}

// Anos anteriores: um JSON por ano, publicado junto com o site.
const anos = new Map<number, ResultadoAno>()
const errosAno = new Map<number, string>()
const pedidos = new Set<number>()

function pedirAno(ano: number) {
  if (pedidos.has(ano)) return
  pedidos.add(ano)
  fetch(`${import.meta.env.BASE_URL}anos/${ano}.json`)
    .then((res) => {
      if (res.status === 404) throw new Error(`resultado de ${ano} não foi gerado (rode \`yarn anos\`)`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((r: ResultadoAno) => anos.set(ano, r))
    .catch((e) => errosAno.set(ano, e instanceof Error ? e.message : String(e)))
    .finally(emitir)
}

function respostaDadosAbertos(opcao: OpcaoEleicao, siglas: string[]): RespostaApi {
  pedirAno(opcao.ano)
  const r = anos.get(opcao.ano)
  const t = r?.turnos[opcao.turno]
  const erroAno = errosAno.get(opcao.ano) ?? null
  const pronto = r != null || erroAno != null
  return {
    eleicao: { ...opcao, data: r?.data[opcao.turno] || opcao.data },
    atual: t?.atual ?? null,
    historico: [],
    ultimaBusca: null,
    erro: erroAno ?? (pronto && !t?.atual ? `Não houve ${opcao.turno}º turno em ${opcao.ano}` : null),
    estados: siglas.flatMap((sigla) => (t?.estados[sigla] ? [{ sigla, cargos: t.estados[sigla] }] : [])),
    mapas: t?.mapas ?? { presidente: {}, governador: {} },
    carregando: pronto ? null : 'Carregando resultados…',
    encerrada: pronto,
    fonte: urlCandidatos(opcao.ano),
    intervaloMs: null,
  }
}

let aoVivo: ReturnType<typeof criarAoVivo>[] = []
let configurado: Promise<void> | null = null

function configurar() {
  configurado ??= lerConfig()
    .catch((e) => {
      console.error('[tse] falha ao ler a lista de eleições, usando a padrão:', e instanceof Error ? e.message : e)
      return PADRAO
    })
    .then((cfgs) => {
      aoVivo = cfgs.map(criarAoVivo)
    })
  return configurado
}

function opcoes(): OpcaoEleicao[] {
  const anosAoVivo = new Set(aoVivo.map((e) => e.opcao.ano))
  const anteriores = ANOS_DADOS_ABERTOS.filter((a) => !anosAoVivo.has(a)).flatMap((ano) =>
    ([1, 2] as const).map((turno) => ({ ano, turno, data: '', aoVivo: false })),
  )
  return [...aoVivo.map((e) => e.opcao), ...anteriores].sort((a, b) => b.ano - a.ano || b.turno - a.turno)
}

export async function listarEleicoes() {
  await configurar()
  return opcoes()
}

// Estado atual da eleição escolhida (a mais recente se `selecao` for null) para
// os estados pedidos ("todos" ou uma sigla). Dispara as buscas necessárias; a
// chegada de dados novos é avisada por aoAtualizar.
export async function consultar(selecao: { ano: number; turno: number } | null, uf: string): Promise<RespostaApi> {
  await configurar()
  const lista = opcoes()
  const opcao = lista.find((o) => o.ano === selecao?.ano && o.turno === selecao?.turno) ?? lista[0]
  const siglas = uf === 'todos' ? UFS : UFS.includes(uf) ? [uf] : ['rn']
  const vivo = aoVivo.find((e) => e.opcao === opcao)
  return vivo ? vivo.resposta(siglas) : respostaDadosAbertos(opcao, siglas)
}
