export interface Candidato {
  numero: string
  nome: string
  nomeCompleto: string
  partido: string
  vice: string
  votos: number
  pct: number
  eleito: boolean
  situacao: string
  foto: string
}

export interface Apuracao {
  atualizadoEm: string
  secoesTotal: number
  secoesTotalizadas: number
  pctSecoes: number
  eleitorado: number
  comparecimento: number
  abstencao: number
  pctComparecimento: number
  totalVotos: number
  votosValidos: number
  brancos: number
  nulos: number
  totalizacaoFinal: boolean
  matematicamenteDefinida: boolean
  candidatos: Candidato[]
}

export interface PontoHistorico {
  atualizadoEm: string
  pctSecoes: number
  votosValidos: number
  votos: Record<string, number>
}

export interface ResumoCargo {
  cargo: string
  atualizadoEm: string
  pctSecoes: number
  candidatos: Candidato[]
}

export interface CandidatoUf {
  nome: string
  partido: string
  pct: number
  votos: number
}

export interface LiderUf {
  uf: string
  pctSecoes: number
  lider: CandidatoUf | null
  segundo: CandidatoUf | null
}

export interface RespostaApi {
  atual: Apuracao | null
  historico: PontoHistorico[]
  ultimaBusca: string | null
  erro: string | null
  uf: { sigla: string; cargos: ResumoCargo[] }
  mapas: { presidente: Record<string, LiderUf>; governador: Record<string, LiderUf> }
  fonte: string
  intervaloMs: number
}
