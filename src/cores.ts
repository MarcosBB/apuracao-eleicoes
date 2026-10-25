// O TSE não publica cor de partido: esta tabela é a nossa convenção, inspirada
// na cor tradicional de cada legenda, e vale para mapas, candidatos e gráficos.
// Os maiores partidos têm tons bem separados; legendas pequenas, que raramente
// aparecem juntas, podem ter tons parecidos. Siglas antigas usam a cor do
// partido que as sucedeu (ex.: PMDB → MDB, PRB → Republicanos).

const PL = '#2a78d6'
const PT = '#e34948'
const MDB = '#1baf7a'
const REPUBLICANOS = '#0f766e'
const CIDADANIA = '#db2777'
const PODEMOS = '#16a34a'
const AVANTE = '#c2410c'
const SOLIDARIEDADE = '#fb923c'
const DC = '#0891b2'
const MOBILIZA = '#7c3aed'
const PRD = '#1e3a8a'

export const CORES_PARTIDO: Record<string, string> = {
  // Partidos registrados
  PL,
  PT,
  'UNIÃO': '#22b8e6',
  PSD: '#eb6834',
  MDB,
  PP: '#5c6bc0',
  REPUBLICANOS,
  PSB: '#eda100',
  PSDB: '#1e40af',
  PDT: '#b91c1c',
  PODE: PODEMOS,
  PSOL: '#a855f7',
  AVANTE,
  SOLIDARIEDADE,
  CIDADANIA,
  'PC do B': '#991b1b',
  PCdoB: '#991b1b',
  PV: '#65a30d',
  REDE: '#14b8a6',
  NOVO: '#ff8c1a',
  PRD,
  AGIR: '#4d7c0f',
  DC,
  MOBILIZA,
  PMB: '#f472b6',
  PCB: '#7f1d1d',
  PCO: '#dc2626',
  PSTU: '#9f1239',
  UP: '#be123c',
  'MISSÃO': '#eab308',
  DEMOCRATA: '#a16207',
  PRTB: '#15803d',

  // Siglas de eleições anteriores
  PSL: '#8c9a0a',
  DEM: '#0284c7',
  PR: PL,
  PRB: REPUBLICANOS,
  PMDB: MDB,
  PPS: CIDADANIA,
  PTN: PODEMOS,
  'PT do B': AVANTE,
  SD: SOLIDARIEDADE,
  PSDC: DC,
  PMN: MOBILIZA,
  PTB: '#7c2d12',
  PATRIOTA: '#3f6212',
  PATRI: '#3f6212',
  PEN: '#3f6212',
  PSC: '#166534',
  PROS: '#ea580c',
  PHS: '#0369a1',
  PTC: '#1d4ed8',
  PRP: '#2563eb',
  PPL: '#b45309',
}

// Cor de cada candidato listado, pela sigla do partido.
export function coresDosCandidatos(candidatos: { numero: string; partido: string }[]) {
  return new Map(candidatos.map((c) => [c.numero, CORES_PARTIDO[c.partido] ?? 'var(--neutro)']))
}
