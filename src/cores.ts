// O TSE não publica cor de partido; esta é a nossa convenção, a mesma nos
// mapas, nos candidatos e nos gráficos. Partidos fora da lista viram "Outros"
// nos mapas.
export const CORES_PARTIDO: Record<string, string> = {
  PL: 'var(--series-1)',
  PT: 'var(--series-8)',
  PSD: 'var(--series-2)',
  MDB: 'var(--series-3)',
  PSB: 'var(--series-4)',
  PP: 'var(--series-5)',
  REPUBLICANOS: 'var(--series-6)',
  UNIÃO: 'var(--series-7)',
  PSDB: 'var(--series-9)',
  PSL: 'var(--series-11)',
}

// Cores que nenhum partido usa, para candidatos de partidos sem cor fixa.
const RESERVA = ['var(--series-10)', 'var(--series-12)']

// Cor de cada candidato listado, pela sigla do partido. Sem cor fixa, pega a
// primeira da reserva livre; esgotada, a de um partido que não está na lista.
export function coresDosCandidatos(candidatos: { numero: string; partido: string }[]) {
  const mapa = new Map<string, string>()
  const usadas = new Set(candidatos.map((c) => CORES_PARTIDO[c.partido]).filter(Boolean))
  const livres = [...RESERVA, ...Object.values(CORES_PARTIDO)]
  for (const c of candidatos) {
    let cor = CORES_PARTIDO[c.partido]
    if (!cor) {
      cor = livres.find((r) => !usadas.has(r)) ?? 'var(--neutro)'
      usadas.add(cor)
    }
    mapa.set(c.numero, cor)
  }
  return mapa
}
