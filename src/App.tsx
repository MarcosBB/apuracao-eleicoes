import { useEffect, useMemo, useState } from 'react'
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
import MapaBrasil from './MapaBrasil'
import type { Apuracao, Candidato, PontoHistorico, RespostaApi, ResumoCargo } from './types'

const POLL_CLIENTE_MS = 5_000
const MAX_BARRAS = 5
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

const fmtInt = new Intl.NumberFormat('pt-BR')
const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

const metaPrimeiroTurno = (votosValidos: number) => Math.floor(votosValidos / 2) + 1

export default function App() {
  const [dados, setDados] = useState<RespostaApi | null>(null)
  const [erroRede, setErroRede] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    let ativo = true
    async function carregar() {
      try {
        const res = await fetch('/api/apuracao', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: RespostaApi = await res.json()
        if (ativo) {
          setDados(json)
          setErroRede(null)
        }
      } catch (e) {
        if (ativo) setErroRede(e instanceof Error ? e.message : String(e))
      }
    }
    carregar()
    const poll = setInterval(carregar, POLL_CLIENTE_MS)
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      ativo = false
      clearInterval(poll)
      clearInterval(relogio)
    }
  }, [])

  // Cores fixas por candidato: as 3 primeiras posições da primeira captura
  // mantêm sua cor mesmo que a ordem mude depois.
  const cores = useMemo(() => {
    const mapa = new Map<string, string>()
    const base = dados?.historico[0]?.votos
    const ordem = base
      ? Object.entries(base).sort((a, b) => b[1] - a[1]).map(([n]) => n)
      : (dados?.atual?.candidatos.map((c) => c.numero) ?? [])
    ordem.slice(0, SERIES.length).forEach((n, i) => mapa.set(n, SERIES[i]))
    return mapa
  }, [dados?.historico, dados?.atual])

  const atual = dados?.atual

  if (!atual) {
    return (
      <main className="app">
        <Cabecalho />
        <div className="card vazio">
          {erroRede || dados?.erro
            ? `Não foi possível obter os dados: ${erroRede ?? dados?.erro}`
            : 'Carregando dados do TSE…'}
        </div>
      </main>
    )
  }

  const proximaCaptura = dados?.ultimaBusca
    ? Math.max(0, Math.round((Date.parse(dados.ultimaBusca) + dados.intervaloMs - agora) / 1000))
    : null

  return (
    <main className="app">
      <Cabecalho
        atual={atual}
        proximaCaptura={proximaCaptura}
        intervaloSeg={dados!.intervaloMs / 1000}
        erro={erroRede ?? dados?.erro ?? null} />
      <ProgressoSecoes atual={atual} />
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
          <Meta atual={atual} cor={cores.get(atual.candidatos[0].numero)} />
          <h3>Comparecimento</h3>
          <Comparecimento atual={atual} />
        </section>
      </div>
      <section className="card">
        <h2>Evolução da apuração</h2>
        <p className="sub">% dos votos válidos a cada atualização do TSE capturada por este servidor</p>
        <Evolucao historico={dados!.historico} atual={atual} cores={cores} />
      </section>
      <div className="grade mapas">
        <MapaBrasil titulo="Presidente · líder por estado" dados={dados!.mapas.presidente} />
        <MapaBrasil titulo="Governador · líder por estado" dados={dados!.mapas.governador} />
      </div>
      {dados!.uf.cargos.length > 0 && <ResumoUf sigla={dados!.uf.sigla} cargos={dados!.uf.cargos} />}
      <footer>
        Fonte: Tribunal Superior Eleitoral —{' '}
        <a href={dados!.fonte} target="_blank" rel="noreferrer">
          resultados.tse.jus.br
        </a>
        . O servidor captura os dados a cada {dados!.intervaloMs / 1000} segundos.{' '}
        Mapa: @svg-maps/brazil (CC BY 4.0).
      </footer>
    </main>
  )
}

function Cabecalho({
  atual,
  proximaCaptura,
  intervaloSeg,
  erro,
}: {
  atual?: Apuracao
  proximaCaptura?: number | null
  intervaloSeg?: number
  erro?: string | null
}) {
  let status: { texto: string; classe: string } | null = null
  if (atual) {
    const eleito = atual.candidatos.find((c) => c.eleito)
    if (eleito) status = { texto: `${eleito.nome} eleito no 1º turno`, classe: 'ok' }
    else if (atual.matematicamenteDefinida || atual.totalizacaoFinal)
      status = { texto: 'Haverá 2º turno', classe: 'aviso' }
    else status = { texto: 'Apuração em andamento', classe: 'andamento' }
  }
  return (
    <header className="cabecalho">
      <div>
        <h1>Apuração · Presidente da República</h1>
        <p className="sub">Eleições 2026 · 1º turno · Brasil</p>
      </div>
      {atual && status && (
        <div className="meta-cabecalho">
          <span className={`pill ${status.classe}`}>
            <span className="ponto" aria-hidden />
            {status.texto}
          </span>
          <span className="sub atualizacao">
            Atualizado pelo TSE às {fmtHora.format(new Date(atual.atualizadoEm))}
            {proximaCaptura != null && intervaloSeg && (
              <>
                {' · '}
                <Contagem restante={proximaCaptura} total={intervaloSeg} />
                nova captura em {proximaCaptura}s
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
}: {
  historico: PontoHistorico[]
  atual: Apuracao
  cores: Map<string, string>
}) {
  const destaque = atual.candidatos.filter((c) => cores.has(c.numero))
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
          50% (vitória no 1º turno)
        </li>
      </ul>
      <div className="grafico">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grade)" vertical={false} />
            <XAxis dataKey="hora" tick={{ fill: 'var(--texto-2)', fontSize: 12 }} stroke="var(--eixo)" minTickGap={24} />
            <YAxis
              domain={[0, 60]}
              ticks={[0, 10, 20, 30, 40, 50, 60]}
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

function ResumoUf({ sigla, cargos }: { sigla: string; cargos: ResumoCargo[] }) {
  return (
    <section>
      <h2 className="titulo-secao">Rio Grande do Norte ({sigla}) · 2 primeiros colocados</h2>
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
    </section>
  )
}

function Foto({ c, cor }: { c: Candidato; cor?: string }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="foto" style={{ borderColor: cor ?? 'var(--borda)' }}>
      {falhou ? (
        <span>{c.nome.slice(0, 1)}</span>
      ) : (
        <img src={c.foto} alt="" loading="lazy" onError={() => setFalhou(true)} />
      )}
    </span>
  )
}
