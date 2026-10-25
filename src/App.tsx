import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ESTADOS, nomeUf } from './estados'
import { coresDosCandidatos } from './cores'
import MapaBrasil from './MapaBrasil'
import { aoAtualizar, consultar, listarEleicoes } from './tse'
import type { Apuracao, Candidato, OpcaoEleicao, PontoHistorico, RespostaApi, ResumoEstado } from './types'

// Enquanto a apuração não terminou, a página consulta o módulo do TSE neste
// intervalo; ele só vai à rede quando a última captura venceu (20 s / 60 s).
const TIQUE_MS = 1_000
const MAX_BARRAS = 5
// Candidatos com linha no gráfico de evolução.
const LINHAS_EVOLUCAO = 3

const fmtInt = new Intl.NumberFormat('pt-BR')
const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/Sao_Paulo',
})
const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

const metaPrimeiroTurno = (votosValidos: number) => Math.floor(votosValidos / 2) + 1

interface Selecao {
  ano: number
  turno: 1 | 2
}

function selecaoDaUrl(): Selecao | null {
  const p = new URLSearchParams(location.search)
  const ano = Number(p.get('ano'))
  const turno = Number(p.get('turno'))
  return ano && (turno === 1 || turno === 2) ? { ano, turno } : null
}

// Estado do resumo por UF: sigla minúscula ou "todos".
const UF_PADRAO = 'rn'
function ufDaUrl() {
  const uf = new URLSearchParams(location.search).get('uf')?.toLowerCase()
  return uf && (uf === 'todos' || ESTADOS.some((e) => e.sigla === uf)) ? uf : UF_PADRAO
}

function definirNaUrl(params: Record<string, string>) {
  const url = new URL(location.href)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  history.replaceState(null, '', url)
}

export default function App() {
  const [opcoes, setOpcoes] = useState<OpcaoEleicao[]>([])
  const [selecao, setSelecao] = useState<Selecao | null>(selecaoDaUrl)
  const [uf, setUf] = useState(ufDaUrl)
  const [dados, setDados] = useState<RespostaApi | null>(null)
  const [erroRede, setErroRede] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    listarEleicoes()
      .then(setOpcoes)
      .catch(() => {})
  }, [])

  // Acompanha a eleição escolhida; para de atualizar quando a apuração já terminou.
  useEffect(() => {
    let ativo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    async function carregar() {
      try {
        const r = await consultar(selecao, uf)
        if (!ativo) return
        setDados(r)
        setErroRede(null)
        clearTimeout(espera)
        if (!r.encerrada) espera = setTimeout(carregar, TIQUE_MS)
      } catch (e) {
        if (ativo) setErroRede(e instanceof Error ? e.message : String(e))
      }
    }
    carregar()
    // Dados novos (captura concluída, estado baixado no worker) aparecem na hora.
    const parar = aoAtualizar(carregar)
    return () => {
      ativo = false
      clearTimeout(espera)
      parar()
    }
  }, [selecao, uf])

  const aoVivo = dados != null && !dados.encerrada && dados.intervaloMs != null
  useEffect(() => {
    if (!aoVivo) return
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [aoVivo])

  const ano = dados?.eleicao.ano
  const turno = dados?.eleicao.turno
  useEffect(() => {
    if (ano) document.title = `Apuração Presidente ${ano} · ${turno}º turno`
  }, [ano, turno])

  function escolherUf(sigla: string) {
    definirNaUrl({ uf: sigla })
    setUf(sigla)
  }

  function escolher(s: Selecao) {
    definirNaUrl({ ano: String(s.ano), turno: String(s.turno) })
    setDados(null)
    setErroRede(null)
    setSelecao(s)
  }

  // Cor do partido para os candidatos exibidos (a mesma dos mapas).
  const cores = useMemo(
    () => coresDosCandidatos(dados?.atual?.candidatos.slice(0, MAX_BARRAS) ?? []),
    [dados?.atual],
  )

  const atual = dados?.atual
  const eleicao = dados?.eleicao ?? (selecao ? { ...selecao, data: '', aoVivo: true } : undefined)
  const seletor = (
    <Seletor opcoes={opcoes} atual={eleicao ? { ano: eleicao.ano, turno: eleicao.turno } : null} onEscolher={escolher} />
  )

  if (!atual || !dados) {
    const erro = erroRede ?? dados?.erro
    return (
      <main className="app">
        <Cabecalho eleicao={eleicao} seletor={seletor} />
        <div className="card vazio">
          {erro
            ? `Não foi possível obter os dados: ${erro}`
            : (dados?.carregando ?? 'Carregando dados do TSE…')}
        </div>
      </main>
    )
  }

  const proximaCaptura =
    aoVivo && dados.ultimaBusca
      ? Math.max(0, Math.round((Date.parse(dados.ultimaBusca) + dados.intervaloMs! - agora) / 1000))
      : null
  const segundoTurno = dados.eleicao.turno === 2
  const mostraEvolucao = dados.historico.length >= 2 || !dados.encerrada

  return (
    <main className="app">
      <Cabecalho
        eleicao={dados.eleicao}
        seletor={seletor}
        atual={atual}
        encerrada={dados.encerrada}
        proximaCaptura={proximaCaptura}
        intervaloSeg={dados.intervaloMs ? dados.intervaloMs / 1000 : undefined}
        erro={erroRede ?? dados.erro ?? null} />
      {dados.carregando && (
        <div className="aviso-carregando" role="status">
          <span className="girador" aria-hidden />
          {dados.carregando}
        </div>
      )}
      {atual.pctSecoes < 100 && <ProgressoSecoes atual={atual} />}
      {segundoTurno ? (
        <>
          <IndicadoresSegundoTurno atual={atual} />
          <div className="grade">
            <section className="card">
              <h2>Confronto direto</h2>
              <p className="sub">Percentual dos votos válidos · vence quem tiver mais votos</p>
              <Duelo atual={atual} cores={cores} />
            </section>
            <section className="card">
              {atual.andamento !== 'final' && atual.pctSecoes < 100 ? (
                <>
                  <h2>Ainda dá para virar?</h2>
                  <p className="sub">Vantagem do líder comparada aos votos válidos que faltam apurar (estimativa)</p>
                  <Virada atual={atual} cores={cores} />
                  <h3>Comparecimento</h3>
                </>
              ) : (
                <>
                  <h2>Comparecimento</h2>
                  <p className="sub">Distribuição do eleitorado apto no 2º turno</p>
                </>
              )}
              <Comparecimento atual={atual} />
            </section>
          </div>
        </>
      ) : (
        <>
          <Indicadores atual={atual} />
          <div className="grade">
            <section className="card">
              <h2>Percentual de votos válidos</h2>
              <p className="sub">Linha tracejada: 50% + 1 voto, necessário para vencer no 1º turno</p>
              <BarrasCandidatos atual={atual} cores={cores} />
            </section>
            <section className="card">
              <h2>Corrida para os 50% + 1</h2>
              <p className="sub">Votos do líder comparados ao necessário para vencer no 1º turno</p>
              <Meta atual={atual} cor={cores.get(atual.candidatos[0]?.numero)} />
              <h3>Comparecimento</h3>
              <Comparecimento atual={atual} />
            </section>
          </div>
        </>
      )}
      {mostraEvolucao && (
        <section className="card">
          <h2>Evolução da apuração</h2>
          <p className="sub">% dos votos válidos a cada atualização do TSE capturada neste navegador</p>
          <Evolucao historico={dados.historico} atual={atual} cores={cores} segundoTurno={segundoTurno} />
        </section>
      )}
      <div className="grade mapas">
        <MapaBrasil
          titulo={`Presidente${segundoTurno ? ' · 2º turno' : ''} · líder por estado`}
          dados={dados.mapas.presidente} />
        <MapaBrasil
          titulo={`Governador${segundoTurno ? ' · 2º turno' : ''} · líder por estado`}
          dados={dados.mapas.governador}
          rotuloAusente={segundoTurno && !dados.carregando ? 'Sem 2º turno' : undefined} />
      </div>
      <ResumoEstados
        uf={uf}
        estados={dados.estados}
        segundoTurno={segundoTurno}
        carregando={dados.carregando != null}
        onEscolher={escolherUf} />
      <footer>
        Fonte: Tribunal Superior Eleitoral —{' '}
        <a href={dados.fonte} target="_blank" rel="noreferrer">
          {dados.eleicao.aoVivo ? 'resultados.tse.jus.br' : 'dados abertos do TSE'}
        </a>
        .{' '}
        {dados.intervaloMs
          ? `A página busca os dados no TSE a cada ${dados.intervaloMs / 1000} segundos. `
          : 'Apuração encerrada: a página não se atualiza sozinha. '}
        Mapa: @svg-maps/brazil (CC BY 4.0).
      </footer>
    </main>
  )
}

function Seletor({
  opcoes,
  atual,
  onEscolher,
}: {
  opcoes: OpcaoEleicao[]
  atual: Selecao | null
  onEscolher: (s: Selecao) => void
}) {
  if (!opcoes.length || !atual) return null
  const anos = [...new Set(opcoes.map((o) => o.ano))]
  const existe = (ano: number, turno: number) => opcoes.some((o) => o.ano === ano && o.turno === turno)
  return (
    <div className="seletor">
      <Dropdown
        rotulo="Ano da eleição"
        valor={String(atual.ano)}
        opcoes={anos.map((ano) => ({ valor: String(ano), texto: String(ano) }))}
        onEscolher={(v) => {
          const ano = Number(v)
          onEscolher({ ano, turno: existe(ano, atual.turno) ? atual.turno : 1 })
        }} />
      <div className="segmentos" role="radiogroup" aria-label="Turno">
        {([1, 2] as const).map((turno) => (
          <button
            key={turno}
            type="button"
            role="radio"
            aria-checked={turno === atual.turno}
            className={turno === atual.turno ? 'ativo' : ''}
            disabled={!existe(atual.ano, turno)}
            onClick={() => onEscolher({ ano: atual.ano, turno })}
          >
            {turno}º turno
          </button>
        ))}
      </div>
    </div>
  )
}

function Cabecalho({
  eleicao,
  seletor,
  atual,
  encerrada,
  proximaCaptura,
  intervaloSeg,
  erro,
}: {
  eleicao?: OpcaoEleicao
  seletor: ReactNode
  atual?: Apuracao
  encerrada?: boolean
  proximaCaptura?: number | null
  intervaloSeg?: number
  erro?: string | null
}) {
  let status: { texto: string; classe: string } | null = null
  if (atual && eleicao) {
    const eleito = atual.candidatos.find((c) => c.eleito && c.situacao !== '2º turno')
    const definido = atual.candidatos[0]
    if (eleito)
      status = { texto: `${eleito.nome} eleito${eleicao.turno === 1 ? ' no 1º turno' : ''}`, classe: 'ok' }
    else if (atual.andamento === 'nao-iniciada') status = { texto: 'Apuração ainda não começou', classe: 'aviso' }
    else if (eleicao.turno === 1 && (atual.matematicamenteDefinida || atual.totalizacaoFinal))
      status = { texto: encerrada ? 'Houve 2º turno' : 'Haverá 2º turno', classe: 'aviso' }
    else if (eleicao.turno === 2 && atual.matematicamenteDefinida && definido)
      status = { texto: `${definido.nome} matematicamente eleito`, classe: 'ok' }
    else status = { texto: 'Apuração em andamento', classe: 'andamento' }
  }
  return (
    <header className="cabecalho">
      <div className="titulo">
        <h1>Apuração · Presidente da República</h1>
        <p className="sub">
          {eleicao ? `Eleições ${eleicao.ano} · ${eleicao.turno}º turno · Brasil` : 'Eleições · Brasil'}
        </p>
        {seletor}
      </div>
      {atual && status && (
        <div className="meta-cabecalho">
          <span className={`pill ${status.classe}`}>
            <span className="ponto" aria-hidden />
            {status.texto}
          </span>
          <span className="sub atualizacao">
            {encerrada ? (
              <>
                Resultado final
                {eleicao?.data && ` · votação em ${fmtData.format(new Date(eleicao.data))}`}
              </>
            ) : (
              <>
                Atualizado pelo TSE às {fmtHora.format(new Date(atual.atualizadoEm))}
                {proximaCaptura != null && intervaloSeg && (
                  <>
                    {' · '}
                    <Contagem restante={proximaCaptura} total={intervaloSeg} />
                    nova captura em {proximaCaptura}s
                  </>
                )}
              </>
            )}
          </span>
          {erro && <span className="erro">⚠ {erro}</span>}
        </div>
      )}
    </header>
  )
}

function Contagem({ restante, total }: { restante: number; total: number }) {
  const r = 7
  const circ = 2 * Math.PI * r
  const fracao = Math.min(1, Math.max(0, restante / total))
  return (
    <svg className={`contagem${restante === 0 ? ' girando' : ''}`} viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r={r} className="contagem-trilho" />
      <circle
        cx="9"
        cy="9"
        r={r}
        className="contagem-arco"
        strokeDasharray={circ}
        strokeDashoffset={restante === 0 ? circ * 0.75 : circ * (1 - fracao)}
      />
    </svg>
  )
}

function ProgressoSecoes({ atual }: { atual: Apuracao }) {
  return (
    <section className="card progresso">
      <div className="progresso-topo">
        <span>
          <strong>{fmtPct.format(atual.pctSecoes)}%</strong> das seções totalizadas
        </span>
        <span className="sub">
          {fmtInt.format(atual.secoesTotalizadas)} de {fmtInt.format(atual.secoesTotal)} seções
        </span>
      </div>
      <div
        className="trilho"
        role="progressbar"
        aria-valuenow={atual.pctSecoes}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="preenchido" style={{ width: `${atual.pctSecoes}%` }} />
      </div>
    </section>
  )
}

function Indicadores({ atual }: { atual: Apuracao }) {
  const meta = metaPrimeiroTurno(atual.votosValidos)
  const lider = atual.candidatos[0]
  if (!lider) return null
  const falta = meta - lider.votos
  return (
    <section className="kpis">
      <div className="card kpi">
        <span className="rotulo">Votos válidos apurados</span>
        <span className="valor">{fmtInt.format(atual.votosValidos)}</span>
      </div>
      <div className="card kpi destaque">
        <span className="rotulo">Necessário para vencer no 1º turno (50% + 1)</span>
        <span className="valor">{fmtInt.format(meta)}</span>
        <span className="sub">votos, com base nos válidos apurados até agora</span>
      </div>
      <div className="card kpi">
        <span className="rotulo">Líder</span>
        <span className="valor">{fmtPct.format(lider.pct)}%</span>
        <span className="sub">
          {lider.nome} ({lider.partido})
        </span>
      </div>
      <div className="card kpi">
        <span className="rotulo">{falta > 0 ? 'Faltam ao líder para 50% + 1' : 'Líder acima de 50% + 1'}</span>
        <span className="valor">{fmtInt.format(Math.abs(falta))}</span>
        <span className="sub">{falta > 0 ? 'votos' : 'votos de folga'}</span>
      </div>
    </section>
  )
}

// Estimativa dos votos válidos que ainda faltam: eleitores das seções não
// totalizadas × comparecimento e proporção de válidos observados até agora.
function votosRestantes(a: Apuracao) {
  const eleitoresApurados = a.eleitorado - a.eleitoradoNaoApurado
  if (eleitoresApurados <= 0 || a.totalVotos <= 0) return 0
  return Math.round(a.eleitoradoNaoApurado * (a.comparecimento / eleitoresApurados) * (a.votosValidos / a.totalVotos))
}

function IndicadoresSegundoTurno({ atual }: { atual: Apuracao }) {
  const [lider, segundo] = atual.candidatos
  if (!lider || !segundo) return null
  const vantagem = lider.votos - segundo.votos
  const final = atual.andamento === 'final' || atual.pctSecoes >= 100
  const restantes = votosRestantes(atual)
  // Fração dos válidos restantes que o 2º colocado precisa para passar o líder.
  const necessario = restantes > 0 ? (vantagem + restantes) / (2 * restantes) : Infinity
  const invalidos = atual.brancos + atual.nulos
  return (
    <section className="kpis">
      <div className="card kpi">
        <span className="rotulo">{final ? 'Votos válidos' : 'Votos válidos apurados'}</span>
        <span className="valor">{fmtInt.format(atual.votosValidos)}</span>
      </div>
      <div className="card kpi destaque">
        <span className="rotulo">{final ? 'Diferença final' : 'Vantagem do líder'}</span>
        <span className="valor">{fmtInt.format(vantagem)}</span>
        <span className="sub">
          votos para {lider.nome} · {fmtPct.format(lider.pct - segundo.pct)} p.p.
        </span>
      </div>
      {final ? (
        <>
          <div className="card kpi">
            <span className="rotulo">Comparecimento</span>
            <span className="valor">{fmtPct.format(atual.pctComparecimento)}%</span>
            <span className="sub">{fmtInt.format(atual.comparecimento)} eleitores</span>
          </div>
          <div className="card kpi">
            <span className="rotulo">Brancos e nulos</span>
            <span className="valor">
              {fmtPct.format(atual.totalVotos ? (invalidos / atual.totalVotos) * 100 : 0)}%
            </span>
            <span className="sub">{fmtInt.format(invalidos)} votos</span>
          </div>
        </>
      ) : (
        <>
          <div className="card kpi">
            <span className="rotulo">Válidos ainda por apurar</span>
            <span className="valor">≈ {fmtInt.format(restantes)}</span>
            <span className="sub">estimativa pelo comparecimento até agora</span>
          </div>
          <div className="card kpi">
            <span className="rotulo">Para virar, {segundo.nome} precisa de</span>
            <span className="valor">
              {necessario > 1 ? 'Impossível' : `${fmtPct.format(Math.max(0, necessario) * 100)}%`}
            </span>
            <span className="sub">
              {necessario > 1 ? 'a vantagem supera os votos restantes' : 'dos válidos que faltam apurar'}
            </span>
          </div>
        </>
      )}
    </section>
  )
}

function Duelo({ atual, cores }: { atual: Apuracao; cores: Map<string, string> }) {
  const [a, b] = atual.candidatos
  if (!a || !b) return null
  const corA = cores.get(a.numero) ?? 'var(--series-1)'
  const corB = cores.get(b.numero) ?? 'var(--series-2)'
  const total = a.pct + b.pct || 1
  return (
    <div className="duelo">
      <div className="duelo-lados">
        {[
          { c: a, cor: corA },
          { c: b, cor: corB },
        ].map(({ c, cor }, i) => (
          <div key={c.numero} className={`duelo-lado${i === 1 ? ' direita' : ''}`}>
            <Foto c={c} cor={cor} grande />
            <div className="duelo-info">
              <strong className="duelo-nome">{c.nome}</strong>
              <span className="sub">
                {c.partido}
                {c.vice && ` · vice ${c.vice}`}
              </span>
              <span className="duelo-pct" style={{ color: cor }}>
                {fmtPct.format(c.pct)}%
              </span>
              <span className="sub">{fmtInt.format(c.votos)} votos</span>
            </div>
          </div>
        ))}
      </div>
      <div className="duelo-barra" role="img" aria-label={`${a.nome} ${fmtPct.format(a.pct)}%, ${b.nome} ${fmtPct.format(b.pct)}%`}>
        <div style={{ width: `${(a.pct / total) * 100}%`, background: corA }} />
        <div style={{ width: `${(b.pct / total) * 100}%`, background: corB }} />
        <span className="duelo-meio" aria-hidden />
      </div>
      <div className="duelo-eixo">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

function Virada({ atual, cores }: { atual: Apuracao; cores: Map<string, string> }) {
  const [lider, segundo] = atual.candidatos
  if (!lider || !segundo) return null
  const vantagem = lider.votos - segundo.votos
  const restantes = votosRestantes(atual)
  const max = Math.max(vantagem, restantes) * 1.1 || 1
  const linhas = [
    { rotulo: `Vantagem de ${lider.nome}`, valor: vantagem, cor: cores.get(lider.numero) ?? 'var(--series-1)' },
    { rotulo: 'Válidos ainda por apurar (estim.)', valor: restantes, cor: 'var(--neutro)' },
  ]
  return (
    <div className="meta">
      {linhas.map((l) => (
        <div key={l.rotulo} className="meta-linha">
          <div className="meta-rotulo">
            <strong>{l.rotulo}</strong>
            <span>
              {fmtInt.format(l.valor)} <span className="sub">votos</span>
            </span>
          </div>
          <div className="trilho grande">
            <div className="preenchido" style={{ width: `${(l.valor / max) * 100}%`, background: l.cor }} />
          </div>
        </div>
      ))}
      <p className="sub">
        {vantagem >= restantes
          ? `Mesmo que ${segundo.nome} receba todos os votos restantes, não alcança ${lider.nome}.`
          : `A virada ainda é possível se ${segundo.nome} superar ${lider.nome} por ${fmtInt.format(vantagem)} votos no que falta.`}
      </p>
    </div>
  )
}

function BarrasCandidatos({ atual, cores }: { atual: Apuracao; cores: Map<string, string> }) {
  const escala = Math.max(60, Math.ceil((atual.candidatos[0]?.pct ?? 0) / 10) * 10)
  return (
    <div className="barras" style={{ ['--linha-meta' as string]: `${(50 / escala) * 100}%` }}>
      {atual.candidatos.slice(0, MAX_BARRAS).map((c) => (
        <div className="barra-linha" key={c.numero} title={`${c.nome}: ${fmtInt.format(c.votos)} votos`}>
          <div className="barra-nome">
            <Foto c={c} cor={cores.get(c.numero)} />
            <span>
              <strong>{c.nome}</strong>
              <span className="sub"> {c.partido}</span>
            </span>
          </div>
          <div className="barra-area">
            <div
              className="barra"
              style={{ width: `${(c.pct / escala) * 100}%`, background: cores.get(c.numero) ?? 'var(--neutro)' }}
            />
            <div className="linha-meta" aria-hidden />
          </div>
          <span className="barra-valor">{fmtPct.format(c.pct)}%</span>
        </div>
      ))}
      <div className="barras-eixo">
        <span />
        <div className="barra-area eixo">
          <span style={{ left: 0 }}>0%</span>
          <span style={{ left: 'var(--linha-meta)' }}>50%</span>
        </div>
        <span />
      </div>
    </div>
  )
}

function Meta({ atual, cor }: { atual: Apuracao; cor?: string }) {
  const meta = metaPrimeiroTurno(atual.votosValidos)
  const [lider, segundo] = atual.candidatos
  if (!lider) return null
  const max = Math.max(meta, lider.votos) * 1.1
  const linhas = [lider, segundo].filter(Boolean)
  return (
    <div className="meta">
      {linhas.map((c, i) => (
        <div key={c.numero} className="meta-linha">
          <div className="meta-rotulo">
            <strong>{c.nome}</strong>
            <span>
              {fmtInt.format(c.votos)} <span className="sub">votos</span>
            </span>
          </div>
          <div className="trilho grande">
            <div
              className="preenchido"
              style={{
                width: `${(c.votos / max) * 100}%`,
                background: i === 0 ? (cor ?? 'var(--series-1)') : 'var(--neutro)',
              }}
            />
            <div className="marca-meta" style={{ left: `${(meta / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="meta-legenda">
        <span className="marca-legenda" /> Meta: {fmtInt.format(meta)} votos (50% + 1 dos válidos)
      </div>
    </div>
  )
}

function Comparecimento({ atual }: { atual: Apuracao }) {
  const partes = [
    { rotulo: 'Válidos', valor: atual.votosValidos, cor: 'var(--seq-forte)' },
    { rotulo: 'Brancos', valor: atual.brancos, cor: 'var(--seq-medio)' },
    { rotulo: 'Nulos', valor: atual.nulos, cor: 'var(--seq-fraco)' },
    { rotulo: 'Abstenção', valor: atual.abstencao, cor: 'var(--neutro)' },
  ]
  const soma = partes.reduce((s, p) => s + p.valor, 0) || 1
  return (
    <div>
      <div className="empilhada">
        {partes.map((p) => (
          <div
            key={p.rotulo}
            style={{ flexGrow: p.valor, background: p.cor }}
            title={`${p.rotulo}: ${fmtInt.format(p.valor)} (${fmtPct.format((p.valor / soma) * 100)}%)`}
          />
        ))}
      </div>
      <ul className="legenda">
        {partes.map((p) => (
          <li key={p.rotulo}>
            <span className="quadrado" style={{ background: p.cor }} />
            {p.rotulo}
            <strong>{fmtPct.format((p.valor / soma) * 100)}%</strong>
            <span className="sub">{fmtInt.format(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Evolucao({
  historico,
  atual,
  cores,
  segundoTurno,
}: {
  historico: PontoHistorico[]
  atual: Apuracao
  cores: Map<string, string>
  segundoTurno: boolean
}) {
  const destaque = atual.candidatos.slice(0, LINHAS_EVOLUCAO).filter((c) => cores.has(c.numero))
  const pontos = historico.map((p) => {
    const linha: Record<string, number | string> = {
      hora: fmtHora.format(new Date(p.atualizadoEm)).slice(0, 5),
      secoes: p.pctSecoes,
    }
    for (const c of destaque) linha[c.numero] = p.votosValidos ? ((p.votos[c.numero] ?? 0) / p.votosValidos) * 100 : 0
    return linha
  })

  if (pontos.length < 2) {
    return (
      <p className="vazio">
        O gráfico aparece a partir da segunda atualização do TSE ({pontos.length} capturada até agora).
      </p>
    )
  }

  // No 2º turno as duas linhas espelham uma à outra em torno dos 50%.
  const dominio = segundoTurno ? [30, 70] : [0, 60]
  const ticks = segundoTurno ? [30, 40, 50, 60, 70] : [0, 10, 20, 30, 40, 50, 60]

  return (
    <>
      <ul className="legenda horizontal">
        {destaque.map((c) => (
          <li key={c.numero}>
            <span className="traco" style={{ background: cores.get(c.numero) }} />
            {c.nome}
          </li>
        ))}
        <li>
          <span className="traco tracejado" />
          {segundoTurno ? '50% (empate)' : '50% (vitória no 1º turno)'}
        </li>
      </ul>
      <div className="grafico">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grade)" vertical={false} />
            <XAxis dataKey="hora" tick={{ fill: 'var(--texto-2)', fontSize: 12 }} stroke="var(--eixo)" minTickGap={24} />
            <YAxis
              domain={dominio}
              ticks={ticks}
              allowDataOverflow
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: 'var(--texto-2)', fontSize: 12 }}
              stroke="var(--eixo)"
            />
            <ReferenceLine y={50} stroke="var(--texto-1)" strokeDasharray="5 4" />
            <Tooltip content={<DicaEvolucao destaque={destaque} cores={cores} />} cursor={{ stroke: 'var(--eixo)' }} />
            {destaque.map((c) => (
              <Line
                key={c.numero}
                dataKey={c.numero}
                name={c.nome}
                stroke={cores.get(c.numero)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--superficie)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function DicaEvolucao({
  active,
  payload,
  destaque,
  cores,
}: {
  active?: boolean
  payload?: { payload: Record<string, number | string> }[]
  destaque: Candidato[]
  cores: Map<string, string>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="dica">
      <div className="dica-titulo">
        {p.hora} · {fmtPct.format(Number(p.secoes))}% seções
      </div>
      {destaque.map((c) => (
        <div key={c.numero} className="dica-linha">
          <span className="traco" style={{ background: cores.get(c.numero) }} />
          <span>{c.nome}</span>
          <strong>{fmtPct.format(Number(p[c.numero]))}%</strong>
        </div>
      ))}
    </div>
  )
}

function Dropdown({
  rotulo,
  valor,
  opcoes,
  onEscolher,
}: {
  rotulo: string
  valor: string
  opcoes: { valor: string; texto: string }[]
  onEscolher: (valor: string) => void
}) {
  return (
    <label className="dropdown">
      <span className="visualmente-oculto">{rotulo}</span>
      <select value={valor} onChange={(e) => onEscolher(e.target.value)}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  )
}

function ResumoEstados({
  uf,
  estados,
  segundoTurno,
  carregando,
  onEscolher,
}: {
  uf: string
  estados: ResumoEstado[]
  segundoTurno: boolean
  carregando: boolean
  onEscolher: (uf: string) => void
}) {
  const todos = uf === 'todos'
  const ordem = (sigla: string) => ESTADOS.findIndex((e) => e.sigla === sigla)
  const lista = [...estados].sort((a, b) => ordem(a.sigla) - ordem(b.sigla))
  const vazio = carregando
    ? 'Carregando resultados do TSE…'
    : segundoTurno
      ? todos
        ? 'Nenhum estado teve 2º turno para governador.'
        : `${nomeUf(uf)} não teve 2º turno para governador.`
      : 'Sem resultados para este estado.'
  return (
    <section>
      <div className="secao-topo">
        <h2 className="titulo-secao">
          Resultados por estado · {segundoTurno ? 'governador no 2º turno' : '2 primeiros colocados'}
        </h2>
        <Dropdown
          rotulo="Estado"
          valor={uf}
          opcoes={[
            { valor: 'todos', texto: 'Todos os estados' },
            ...ESTADOS.map((e) => ({ valor: e.sigla, texto: `${e.nome} (${e.sigla.toUpperCase()})` })),
          ]}
          onEscolher={onEscolher} />
      </div>
      {estados.length === 0 ? (
        <div className="card vazio">{vazio}</div>
      ) : (
        <div className="estados">
          {lista.map((e) => (
            <div key={e.sigla}>
              {(todos || lista.length > 1) && (
                <h3 className="estado-nome">
                  {nomeUf(e.sigla)} <span className="sub">({e.sigla.toUpperCase()})</span>
                </h3>
              )}
              <CargosEstado cargos={e.cargos} />
            </div>
          ))}
          {todos && segundoTurno && !carregando && (
            <p className="sub">Os demais estados não tiveram 2º turno para governador.</p>
          )}
        </div>
      )}
    </section>
  )
}

function CargosEstado({ cargos }: { cargos: ResumoEstado['cargos'] }) {
  return (
    <div className="mini-cards">
      {cargos.map((r) => (
        <div className="card mini" key={r.cargo}>
          <div className="mini-topo">
            <strong>{r.cargo}</strong>
            <span className="sub">{fmtPct.format(r.pctSecoes)}% seções</span>
          </div>
          {r.candidatos.map((c, i) => (
            <div className="mini-cand" key={c.numero}>
              <Foto c={c} />
              <span className="mini-nome" title={`${i + 1}º · ${c.nomeCompleto}`}>
                <strong>{c.nome}</strong>
                <span className="sub">{c.partido}</span>
              </span>
              <span className="mini-pct">
                {fmtPct.format(c.pct)}%
                <span className="sub">{fmtInt.format(c.votos)}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Foto({ c, cor, grande }: { c: Candidato; cor?: string; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className={`foto${grande ? ' grande' : ''}`} style={{ borderColor: cor ?? 'var(--borda)' }}>
      {falhou || !c.foto ? (
        <span>{c.nome.slice(0, 1)}</span>
      ) : (
        <img src={c.foto} alt="" loading="lazy" onError={() => setFalhou(true)} />
      )}
    </span>
  )
}
