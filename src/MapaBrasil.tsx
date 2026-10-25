import mapaBrasil from '@svg-maps/brazil'
import { useLayoutEffect, useRef, useState } from 'react'
import { CORES_PARTIDO } from './cores'
import type { LiderUf } from './types'

const brasil = mapaBrasil as unknown as { viewBox: string; locations: { id: string; name: string; path: string }[] }

const COR_OUTROS = 'var(--neutro)'
const COR_SEM_VOTOS = 'var(--grade)'

// Estados pequenos do litoral: o rótulo vai para o mar, ligado por uma linha.
const ROTULO_FORA: Record<string, [number, number]> = {
  rn: [622, 172],
  pb: [622, 192],
  pe: [622, 212],
  al: [622, 232],
  se: [622, 252],
  es: [550, 420],
  rj: [522, 470],
  df: [452, 392],
}
// Largura extra à direita do mapa original (613) para os rótulos no mar.
const VIEWBOX = '0 0 680 639'

const fmtPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPct2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const corDo = (l: LiderUf | undefined) =>
  !l?.lider ? COR_SEM_VOTOS : (CORES_PARTIDO[l.lider.partido] ?? COR_OUTROS)

export default function MapaBrasil({
  titulo,
  dados,
  rotuloAusente,
}: {
  titulo: string
  dados: Record<string, LiderUf>
  // Legenda para estados sem arquivo no TSE (ex.: sem 2º turno para governador).
  rotuloAusente?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [centros, setCentros] = useState<Record<string, [number, number]>>({})
  const [ativo, setAtivo] = useState<{ uf: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const c: Record<string, [number, number]> = {}
    svg.querySelectorAll<SVGPathElement>('path[data-uf]').forEach((p) => {
      const b = p.getBBox()
      c[p.dataset.uf!] = [b.x + b.width / 2, b.y + b.height / 2]
    })
    setCentros(c)
  }, [])

  const legenda = new Map<string, { cor: string; n: number }>()
  for (const l of Object.values(dados)) {
    const rotulo = !l.lider ? 'Sem votos' : CORES_PARTIDO[l.lider.partido] ? l.lider.partido : 'Outros'
    const item = legenda.get(rotulo) ?? { cor: corDo(l), n: 0 }
    item.n++
    legenda.set(rotulo, item)
  }
  const ausentes = brasil.locations.filter((l) => !dados[l.id]).length
  if (rotuloAusente && ausentes) legenda.set(rotuloAusente, { cor: COR_SEM_VOTOS, n: ausentes })
  const itensLegenda = [...legenda.entries()].sort((a, b) => b[1].n - a[1].n)

  const info = ativo ? dados[ativo.uf] : undefined
  const nomeUf = (uf: string) => brasil.locations.find((l) => l.id === uf)?.name ?? uf.toUpperCase()

  return (
    <section className="card mapa-card">
      <h2>{titulo}</h2>
      <p className="sub">Cor do partido que lidera em cada estado · % de votos válidos do líder</p>
      <ul className="legenda horizontal">
        {itensLegenda.map(([rotulo, { cor, n }]) => (
          <li key={rotulo}>
            <span className="quadrado" style={{ background: cor }} />
            {rotulo} <span className="sub">({n})</span>
          </li>
        ))}
      </ul>
      <div className="mapa-wrap" onMouseLeave={() => setAtivo(null)}>
        <svg ref={svgRef} viewBox={VIEWBOX} className="mapa" role="img" aria-label={titulo}>
          {brasil.locations.map((l) => (
            <path
              key={l.id}
              data-uf={l.id}
              d={l.path}
              fill={corDo(dados[l.id])}
              className={ativo?.uf === l.id ? 'uf ativo' : 'uf'}
              onMouseMove={(e) => {
                const r = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect()
                setAtivo({ uf: l.id, x: e.clientX - r.left, y: e.clientY - r.top })
              }}
              onClick={(e) => {
                const r = e.currentTarget.ownerSVGElement!.parentElement!.getBoundingClientRect()
                setAtivo({ uf: l.id, x: e.clientX - r.left, y: e.clientY - r.top })
              }}
            />
          ))}
          {brasil.locations.map((l) => {
            const centro = centros[l.id]
            const lider = dados[l.id]?.lider
            if (!centro || !lider) return null
            const fora = ROTULO_FORA[l.id]
            const [x, y] = fora ?? centro
            return (
              <g key={l.id} className="rotulo-uf" pointerEvents="none">
                {fora && <line x1={centro[0]} y1={centro[1]} x2={x - 3} y2={y - 4} className="guia" />}
                <text x={x} y={y} className={fora ? 'fora' : 'dentro'} textAnchor={fora ? 'start' : 'middle'}>
                  {fora && <tspan className="sigla">{l.id.toUpperCase()} </tspan>}
                  {fmtPct.format(lider.pct)}%
                </text>
              </g>
            )
          })}
        </svg>
        {ativo && info && (
          <div
            className="dica dica-mapa"
            style={{ left: ativo.x, top: ativo.y, transform: ativo.x > 200 ? 'translate(-105%, 12px)' : 'translate(12px, 12px)' }}
          >
            <div className="dica-titulo">
              {nomeUf(ativo.uf)} · {fmtPct2.format(info.pctSecoes)}% seções
            </div>
            {[info.lider, info.segundo].map(
              (c, i) =>
                c && (
                  <div className="dica-linha" key={i}>
                    <span
                      className="quadrado"
                      style={{ background: CORES_PARTIDO[c.partido] ?? COR_OUTROS }}
                    />
                    <span>
                      {c.nome} <span className="sub">{c.partido}</span>
                    </span>
                    <strong>{fmtPct2.format(c.pct)}%</strong>
                  </div>
                ),
            )}
            {!info.lider && <div className="sub">Sem votos apurados</div>}
          </div>
        )}
      </div>
      <details className="por-estado">
        <summary>Ver por estado</summary>
        <ul>
          {brasil.locations
            .filter((l) => dados[l.id])
            .map((l) => {
              const d = dados[l.id]
              return (
                <li key={l.id}>
                  <span className="quadrado" style={{ background: corDo(d) }} />
                  <strong>{l.id.toUpperCase()}</strong>
                  <span className="nome">{d.lider ? `${d.lider.nome} (${d.lider.partido})` : 'Sem votos'}</span>
                  <span className="pct">{d.lider ? `${fmtPct2.format(d.lider.pct)}%` : '–'}</span>
                </li>
              )
            })}
        </ul>
      </details>
    </section>
  )
}
