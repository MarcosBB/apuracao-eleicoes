import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANOS_DADOS_ABERTOS, montarAno } from '../src/tse/dadosAbertos.ts'

// Gera <destino>/<ano>.json com o resultado final de cada ano anterior, lido dos
// dados abertos do TSE. Roda no deploy (destino dist/anos) ou localmente para
// desenvolver (destino public/anos, ignorado pelo git).
//   node scripts/gerar-anos.ts dist/anos
const destino = process.argv[2] ?? 'public/anos'
mkdirSync(destino, { recursive: true })

for (const ano of ANOS_DADOS_ABERTOS) {
  const inicio = Date.now()
  const r = await montarAno(ano, (msg) => console.log(msg))
  if (!r.turnos[1].atual) throw new Error(`${ano}: resultado do 1º turno vazio`)
  const arquivo = join(destino, `${ano}.json`)
  writeFileSync(arquivo, JSON.stringify(r))
  console.log(`${arquivo} gerado em ${((Date.now() - inicio) / 1000).toFixed(0)} s`)
}
