# Apuração · Presidente

Painel em React + Vite que acompanha a apuração para Presidente usando os dados
públicos do TSE. No topo dá para escolher o ano (menu) e o turno. É um site
estático, publicado no GitHub Pages: tudo roda no navegador.

- **Ciclo atual (2026):** a página busca direto no portal de resultados
  (`resultados.tse.jus.br`, que libera CORS) **a cada 20 segundos**, e os mapas
  a cada 60 s. O histórico do gráfico de evolução fica no `localStorage` de
  quem acompanha. Quando o TSE marca tudo como totalizado, ou a votação já
  passou, a página para de buscar.
- **Anos anteriores (2022, 2018, 2014):** o portal só mantém o ciclo atual e o
  CDN de dados abertos do TSE (`cdn.tse.jus.br`) responde com o cabeçalho CORS
  duplicado, que o navegador recusa. Por isso o deploy roda
  `scripts/gerar-anos.ts`, que lê só os CSVs necessários de dentro dos zips
  (HTTP Range) e publica um `anos/<ano>.json` por ano junto com o site. Nada
  disso fica no repositório.
- **1º turno:** % de votos válidos, votos necessários para vencer no 1º turno
  (50% + 1 dos válidos) e quanto falta ao líder.
- **2º turno:** confronto direto, vantagem do líder, estimativa de votos ainda
  por apurar e quanto o 2º colocado precisa deles para virar.
- Em ambos: seções totalizadas, comparecimento, evolução ao longo da apuração,
  mapas de líder por estado (Presidente e Governador) e os 2 primeiros
  colocados de cada cargo por estado (governador, senador e deputados), com um
  menu para escolher o estado ou ver todos.

## Rodando

```bash
yarn install
yarn anos    # gera public/anos/*.json (anos anteriores; ~2 min, só uma vez)
yarn dev     # desenvolvimento — porta 5173
yarn start   # build + preview — porta 4173
```

Os dois modos escutam em todas as interfaces; acesse de outros dispositivos
pelo endereço "Network" que o Vite exibe (ex.: `http://192.168.0.106:5173`).

## Publicação

O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push na
`main` (ou manualmente, em Actions → "Publicar no GitHub Pages"). Em
Settings → Pages, a origem deve ser **GitHub Actions**.

As eleições ao vivo e seus códigos são lidos de
`https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`.

Mapa dos estados: [@svg-maps/brazil](https://github.com/VictorCazanave/svg-maps) (CC BY 4.0).
