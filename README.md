# Apuração · Presidente 2026

Painel em React + Vite que acompanha a apuração do 1º turno para Presidente
usando os dados públicos do TSE (`resultados.tse.jus.br`).

- O servidor Vite busca o resultado no TSE **a cada 20 segundos** e guarda o
  histórico em `data/` (um único acesso ao TSE, não importa quantos dispositivos
  estejam abertos). As páginas consultam `/api/apuracao` a cada 5 s.
- Mostra % de votos válidos, votos necessários para vencer no 1º turno
  (50% + 1 dos válidos), quanto falta ao líder, seções totalizadas,
  comparecimento e a evolução ao longo da apuração.

## Rodando

```bash
yarn install
yarn dev     # desenvolvimento — porta 5173
yarn start   # build + preview — porta 4173
```

Os dois modos escutam em todas as interfaces; acesse de outros dispositivos
pelo endereço "Network" que o Vite exibe (ex.: `http://192.168.0.106:5173`).

Para outra eleição, defina `TSE_CICLO` e `TSE_ELEICAO`
(códigos em `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`).

Mapa dos estados: [@svg-maps/brazil](https://github.com/VictorCazanave/svg-maps) (CC BY 4.0).
