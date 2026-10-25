# Apuração · Presidente

Painel em React + Vite que acompanha a apuração para Presidente usando os dados
públicos do TSE. No topo dá para escolher o ano (menu) e o turno.

- **Ciclo atual (2026):** vem do portal de resultados (`resultados.tse.jus.br`).
  Enquanto a apuração está em andamento, o servidor Vite busca o resultado
  **a cada 20 segundos** e guarda o histórico em `data/` (um único acesso ao TSE,
  não importa quantos dispositivos estejam abertos); as páginas consultam
  `/api/apuracao` a cada 5 s. Quando o TSE marca tudo como totalizado, ou a
  votação já passou, o servidor para de buscar e a página para de se atualizar.
- **Anos anteriores (2022, 2018, 2014):** o portal só mantém o ciclo atual, então
  o resultado final vem dos dados abertos do TSE (`cdn.tse.jus.br`). O servidor
  lê só os CSVs necessários de dentro dos zips (HTTP Range), monta o resultado em
  memória na primeira consulta e não grava nada.
- **1º turno:** % de votos válidos, votos necessários para vencer no 1º turno
  (50% + 1 dos válidos) e quanto falta ao líder.
- **2º turno:** confronto direto, vantagem do líder, estimativa de votos ainda
  por apurar e quanto o 2º colocado precisa deles para virar.
- Em ambos: seções totalizadas, comparecimento, evolução ao longo da apuração,
  mapas de líder por estado (Presidente e Governador) e os 2 primeiros
  colocados de cada cargo por estado (governador, senador e deputados), com um
  menu para escolher o estado ou ver todos. No ciclo atual, o servidor só busca
  os estados que alguém está vendo.

## Rodando

```bash
yarn install
yarn dev     # desenvolvimento — porta 5173
yarn start   # build + preview — porta 4173
```

Os dois modos escutam em todas as interfaces; acesse de outros dispositivos
pelo endereço "Network" que o Vite exibe (ex.: `http://192.168.0.106:5173`).

As eleições ao vivo e seus códigos são lidos de
`https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`.

Mapa dos estados: [@svg-maps/brazil](https://github.com/VictorCazanave/svg-maps) (CC BY 4.0).
