# API Interna — Módulos JavaScript

Documentação das funções e módulos principais do projeto.
Todas as funções são ES Modules importadas explicitamente entre arquivos.

---

## `state.js` — Estado global e utilitários

### Estado global
```js
export const state = {
  user, admin, userName,
  obras, selectedObraId, rows,
  allUsers, adminSubs,
  adminSelectedUid, adminSelectedObraId,
  chartUser, chartUser2,
  chartAdmin, chartAdmin2,
  saveTimer, colabFormReady
}
```

### Utilitários
```js
export const $          // getElementById
export const fmtMoney   // formata número como R$ BRL
export const esc        // escapa HTML
export const parseMoney // string R$ → number
export const norm       // normaliza string (lowercase, sem acento)
export const isNum      // valida se é número
export const baseName   // remove extensão de nome de arquivo
export const money      // alias de fmtMoney
export const pct        // formata número como '0.00%'
```

### Funções principais

#### `currentObra()`
Retorna a obra selecionada atualmente em `state.obras`.

#### `calcPctGeral(resumo, itens)`
Calcula o percentual geral executado da obra.
Prioriza `resumo.valorContratoAditivo` e `resumo.acumuladoTotal` se disponíveis.

#### `showView(name)`
Alterna entre as views: `'loginView'`, `'appView'`, `'adminView'`.

#### `showToast(msg, isError = false)`
Exibe mensagem de feedback flutuante. Erro dura 5s, normal 3.5s.

#### `cleanup(adminSubs, allUsers)`
Desinscreve todos os listeners do Firestore e limpa o estado admin.

---

### `buildCronogramaTimeline(dataInicio, cronograma, dataEmissao)`
Monta o array de meses para exibição na tabela do cronograma.

**Parâmetros:**
- `dataInicio` — string `'YYYY-MM'`
- `cronograma` — array de objetos `{ planejadoPct, planejadoValor }`
- `dataEmissao` — objeto `{ mes, ano }` (opcional; usa data atual se omitido)

**Retorna:** array de objetos `{ mes, label, planejadoPct, planejadoValor, passado }`

---

### `buildCurvaServico(dataInicio, itemCronograma, itensExecucao, totalMeses, dataEmissaoObra, itemCronogramaExecucao)`
Calcula todos os dados necessários para o gráfico de Curva S de um serviço individual.

**Retorna:**
```js
{
  descricao, item,
  labels[],          // rótulos de mês ('abr. 25', 'mai. 25'...)
  planMensal[],      // % planejado simples por mês
  planAcum[],        // % planejado acumulado (NUNCA cortado)
  planValorMensal[], planValorAcum[],
  execMensal[],      // % executado simples (null após último mês real)
  execAcum[],        // % executado acumulado (cortado na cauda vazia)
  execValorMensal[], execValorAcum[],
  execAcumPct,       // % acumulado final (para badge de status)
  execAcumValor,
  valorContrato,
  pesoTotal,
  status,            // 'em_dia' | 'atrasado' | 'adiantado' | 'nao_iniciado'
  anomalias[],       // array de { tipo, mensagem, severidade }
  mesAtualIdx,
  mesesDecorridos
}
```

> ⚠️ O corte da cauda do executado é feito aqui — não reaplicar em `render-servicos.js`.

---

### `detectarAnomaliaServico({ planMensal, execMensal, execAcumPctFinal, planAteAgora, mesesDecorridos, totalMeses })`
Detecta anomalias na execução de um serviço.

**Tipos de anomalia retornados:**
| Tipo | Severidade | Condição |
|---|---|---|
| `INICIADO_ANTES_DO_PREVISTO` | `alerta` | Primeiro mês com execução < primeiro mês com planejamento |
| `EXECUTADO_FORA_DO_CRONOGRAMA` | `alerta` | Execução em mês onde planejadoPct = 0 |
| `MUITO_ADIANTADO` | `aviso` | Executado acumulado > planejado + 15pp |

---

## `render-charts.js` — Curvas S do Contrato e Aditivo

### `renderCurvaS2(canvasId, wrapId, obra, prevChart)`
Renderiza a Curva S do contrato completo.

### `renderCurvaS2Aditivo(canvasId, wrapId, aditivo, dataInicioAditivo, prevChart)`
Renderiza a Curva S de um aditivo específico.

### `_renderCurvaS2Generica(canvasId, wrapId, { cronograma, cronogramaExecucao, dataInicio, titulo }, prevChart)` *(privada)*
Função base usada por ambas acima.
- Planejado: exibe todos os meses sem corte.
- Executado: cortado pelo último índice onde `executadoPct > 0`.

### `renderCurvaServico(canvasId, wrapId, dados, prevChart, dadosAnterior)`
Renderiza a Curva S individual de um serviço.
`dados` vem de `buildCurvaServico()` — já com cauda cortada.
`dadosAnterior` (opcional) — exibe linha pontilhada da versão anterior.

### `renderCurvaS1(canvasId, wrapId, itens, prevChart)`
Gráfico de barras com % executado por item (índice geral de serviços).

### `renderIndicadorAtualizacao(containerId, obra)`
Exibe badge com a data da última atualização de execução.

---

## `cronograma.js` — Tabela do Cronograma

Gerencia a tabela interativa do cronograma físico-financeiro:
- Renderização da tabela com células editáveis
- Cálculo de totais simples e acumulados por mês
- Validação de % por item (máximo 100%)
- Integração com save no Firestore via `events.js`

---

## `events.js` — Eventos do Usuário

Centraliza todos os handlers de eventos da aplicação:
- Salvar / editar / excluir obra
- Salvar execução mensal (com snapshot para histórico)
- Gerenciar aditivos
- Gerenciar colaboradores
- Alternar tema dark/light

---

## `events-import.js` — Importação de Planilha

Fluxo de importação de cronograma via Excel:
1. Leitura do arquivo com SheetJS
2. Detecção automática das colunas (item, descrição, valor, % por mês)
3. Mapeamento para a estrutura `itensCronograma[]`
4. Geração do `cronograma[]` consolidado
5. Salvo no Firestore via `events.js`

---

## `excel.js` — Exportação para Excel

Gera planilha `.xlsx` com:
- Cronograma físico-financeiro planejado
- Execução mensal por serviço
- Totais simples e acumulados

---

## `firebase.js` — Configuração do Firebase

```js
export { db }    // instância do Firestore
export { auth }  // instância do Firebase Auth
```

> ⚠️ Credenciais do projeto estão neste arquivo. Não expor em logs ou commits públicos.

---

## `url-state.js` — Estado na URL

Persiste na URL a obra e aba selecionadas, permitindo compartilhar link direto para uma obra.

---

## `auditoria.js` — Log de Ações

Registra no Firestore ações críticas do usuário (criar obra, salvar execução, excluir) com timestamp e UID.
