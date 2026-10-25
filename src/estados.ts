import mapaBrasil from '@svg-maps/brazil'

// Siglas (minúsculas) e nomes das UFs, em ordem alfabética de nome.
export const ESTADOS = (mapaBrasil as unknown as { locations: { id: string; name: string }[] }).locations
  .map((l) => ({ sigla: l.id, nome: l.name }))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

export const nomeUf = (sigla: string) => ESTADOS.find((e) => e.sigla === sigla)?.nome ?? sigla.toUpperCase()
