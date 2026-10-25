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
  // Eleitores das seções ainda não totalizadas.
  eleitoradoNaoApurado: number
  comparecimento: number
  abstencao: number
  pctComparecimento: number
  totalVotos: number
  votosValidos: number
  brancos: number
  nulos: number
  totalizacaoFinal: boolean
  andamento: 'nao-iniciada' | 'parcial' | 'final'
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

export interface ResumoEstado {
  // Sigla em minúsculas (ex.: "rn").
  sigla: string
  cargos: ResumoCargo[]
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

export interface OpcaoEleicao {
  ano: number
  turno: 1 | 2
  // Data da votação (AAAA-MM-DD).
  data: string
  // true: API de resultados ao vivo; false: dados abertos (resultado final).
  aoVivo: boolean
}

export interface RespostaApi {
  eleicao: OpcaoEleicao
  atual: Apuracao | null
  historico: PontoHistorico[]
  ultimaBusca: string | null
  erro: string | null
  // Resumo por estado dos cargos estaduais e de deputado: só os estados pedidos (?uf=rn ou ?uf=todos).
  estados: ResumoEstado[]
  mapas: { presidente: Record<string, LiderUf>; governador: Record<string, LiderUf> }
  // Mensagem enquanto parte dos dados ainda está sendo baixada do TSE.
  carregando: string | null
  // Apuração encerrada: o servidor não busca mais e a página não precisa atualizar.
  encerrada: boolean
  fonte: string
  // Intervalo de captura do servidor; null quando não há mais capturas.
  intervaloMs: number | null
}
