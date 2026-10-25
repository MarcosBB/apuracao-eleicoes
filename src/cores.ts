// Cor fixa por partido, a mesma nos mapas, nos candidatos e nos gráficos.
// Partidos fora da lista viram "Outros" nos mapas.
export const CORES_PARTIDO: Record<string, string> = {
  PL: 'var(--series-1)',
  PT: 'var(--series-8)',
  PSD: 'var(--series-2)',
  MDB: 'var(--series-3)',
  PSB: 'var(--series-4)',
  PP: 'var(--series-5)',
  REPUBLICANOS: 'var(--series-6)',
  UNIÃO: 'var(--series-7)',
}

// Ordem de reserva para candidatos de partidos sem cor própria (ex.: PSL em
// 2018, PSDB em 2014): a primeira que nenhum outro destacado esteja usando.
const RESERVA = [1, 8, 2, 3, 4, 5, 6, 7].map((n) => `var(--series-${n})`)

// Cor de cada candidato destacado, pela sigla do partido.
export function coresDosCandidatos(candidatos: { numero: string; partido: string }[]) {
  const mapa = new Map<string, string>()
  const usadas = new Set(candidatos.map((c) => CORES_PARTIDO[c.partido]).filter(Boolean))
  for (const c of candidatos) {
    let cor = CORES_PARTIDO[c.partido]
    if (!cor) {
      cor = RESERVA.find((r) => !usadas.has(r)) ?? 'var(--neutro)'
      usadas.add(cor)
    }
    mapa.set(c.numero, cor)
  }
  return mapa
}
