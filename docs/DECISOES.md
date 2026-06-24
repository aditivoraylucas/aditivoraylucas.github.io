# Registro de Decisões — Sistema de Gestão de Cronograma Físico-Financeiro

> Este arquivo registra as decisões técnicas e de produto tomadas ao longo do projeto.
> Antes de alterar qualquer comportamento já implementado, consulte este arquivo.

---

## 2025 — Decisões de Arquitetura Inicial

### Escolha do Firebase como banco de dados e autenticação
- **Decisão:** Utilizar Firebase Firestore (banco) + Firebase Authentication.
- **Motivo:** Permite sincronização em tempo real sem servidor próprio, autenticação pronta com e-mail/senha, e hospedagem gratuita via GitHub Pages sem necessidade de back-end.
- **Alternativas descartadas:** Supabase (mais complexo para o perfil do projeto), MySQL/PostgreSQL (exigiria servidor dedicado).

### JavaScript puro, sem framework
- **Decisão:** Não utilizar React, Vue, Angular ou similares.
- **Motivo:** O projeto é uma SPA simples com páginas estáticas. Frameworks adicionariam complexidade de build desnecessária para o contexto.
- **Regra permanente:** Não introduzir frameworks sem revisão completa da arquitetura.

### Sem bundler (sem Webpack, Vite ou esbuild)
- **Decisão:** Usar ES Modules nativos do browser + CDN para bibliotecas externas.
- **Motivo:** GitHub Pages serve arquivos estáticos diretamente. Sem build pipeline, deploy é instantâneo a cada push.
- **Impacto:** Todas as bibliotecas (Chart.js, SheetJS, Firebase) são carregadas via CDN no `index.html`.

### Single HTML (`index.html`)
- **Decisão:** Todas as views (login, app do usuário, painel admin) estão dentro de um único `index.html`.
- **Motivo:** Simplifica o roteamento em GitHub Pages e mantém o contexto do Firebase Auth entre telas.
- **Padrão:** Views são mostradas/ocultadas via `showView(name)` em `state.js`.

---

## 2025 — Estrutura do Firestore

### Organização dos dados por usuário
- **Decisão:** Estrutura hierarquizada por UID do usuário.
- **Regra:** Nunca renomear ou remover campos sem mapear todos os módulos que os utilizam.
- **Detalhes completos:** ver `docs/FIREBASE.md`.

### Cronograma armazenado como array indexado por mês
- **Decisão:** `cronograma[0]` = mês 1, `cronograma[1]` = mês 2, etc.
- **Motivo:** Acesso direto por índice sem necessidade de busca.
- **Atenção:** O gráfico usa `offset = 0..n-1` com `base0 = (iniMes-1) + offset` para calcular o label correto do mês.

---

## 2025 — Cronograma e Importação

### Importação via planilha Excel
- **Decisão:** Usuário importa o cronograma físico-financeiro via arquivo Excel (.xlsx).
- **Biblioteca:** SheetJS (xlsx) via CDN.
- **Módulo responsável:** `events-import.js`.
- **Motivo:** Obras públicas já entregam o cronograma em planilha. Evita digitação manual.

### Exportação do cronograma para Excel
- **Decisão:** Exportar cronograma planejado + execução em planilha formatada.
- **Módulo responsável:** `excel.js`.

---

## 2025 — Gráficos (Curva S)

### Biblioteca de gráficos: Chart.js
- **Decisão:** Utilizar Chart.js via CDN.
- **Motivo:** Leve, sem dependências, funciona com canvas nativo, suporte a `spanGaps: false` para interromper a linha em pontos `null`.
- **Alternativas descartadas:** D3.js (muito complexo), ApexCharts (mais pesado).

### Ponto de origem das Curvas S é "Mês 0" com valor zero
- **Decisão:** O primeiro ponto do gráfico é sempre um ponto "Mês 0" com 0%.
- **Motivo:** A curva S precisa partir do zero visualmente.

### Planejado nunca é cortado
- **Decisão:** A linha laranja (planejado) sempre exibe todos os meses do cronograma.
- **Motivo:** O usuário precisa ver o horizonte completo do contrato.

---

## Junho/2026 — Corte do Executado (decisão crítica)

### Corte da cauda vazia do executado por execução real
- **Decisão:** A linha verde (executado) é interrompida no último mês onde houve execução real (`executadoPct > 0` ou `executadoValor > 0`).
- **Comportamento anterior (descartado):** O corte era feito pelo último mês com `planejadoPct > 0`. Causava platô horizontal até o fim do contrato sem execução.
- **Algoritmo definido:**
  1. Escanear o array de execução **do fim para o início**.
  2. Encontrar o último índice com valor real > 0.
  3. Tornar `null` todos os pontos após esse índice.
  4. Buracos no meio são **preservados** — a linha continua normalmente após o buraco.
- **Onde está implementado:**
  - Curva S por Serviço → `state.js` → `buildCurvaServico`
  - Curva S do Contrato e Aditivo → `render-charts.js` → `_renderCurvaS2Generica`
- **Regra permanente:** Esta lógica deve ser idêntica nos dois lugares.

---

## Junho/2026 — Histórico de Execuções

### Salvar versões anteriores de execução
- **Decisão:** Antes de sobrescrever a execução mensal, a versão atual é salva em `historicoExecucao[]`.
- **Motivo:** Permite comparar a curva atual com versões anteriores (linha pontilhada cinza no gráfico).
- **Campo de referência:** `dataEmissaoExecucao { mes, ano }` identifica a competência de cada versão.

---

## Junho/2026 — Detecção de Anomalias

### Anomalias automáticas por serviço
- **Decisão:** O sistema detecta e exibe alertas para três tipos de anomalia:
  1. `INICIADO_ANTES_DO_PREVISTO` — execução começou antes do mês planejado.
  2. `EXECUTADO_FORA_DO_CRONOGRAMA` — execução em mês não previsto no planejado.
  3. `MUITO_ADIANTADO` — executado acumulado mais de 15pp acima do planejado.
- **Threshold adiantado:** 15 pontos percentuais (constante `THRESHOLD_ADIANTADO` em `state.js`).
- **Função:** `detectarAnomaliaServico` em `state.js`.

---

## Junho/2026 — Documentação

### Organização da documentação em /docs
- **Decisão:** Toda documentação do projeto centralizada em `/docs`.
- **Arquivos:** `PROJETO_MEMORIA.md`, `DECISOES.md`, `API.md`, `FIREBASE.md`, `TODO.md`.

---

## Regras permanentes consolidadas

| # | Regra |
|---|---|
| 1 | Nunca alterar estrutura do Firestore sem mapear impacto em todos os módulos |
| 2 | Linha do planejado nunca é cortada |
| 3 | Linha do executado cortada pela execução real, não pelo planejado |
| 4 | Buracos no meio do executado são preservados; apenas cauda final é cortada |
| 5 | Lógica de corte deve ser idêntica em `state.js` e `render-charts.js` |
| 6 | Não introduzir frameworks JS sem revisão da arquitetura |
| 7 | Não usar bundler — tudo via ES Modules nativos + CDN |
| 8 | Toda nova decisão relevante deve ser registrada aqui com data e motivo |
