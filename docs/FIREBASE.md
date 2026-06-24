# Firebase — Estrutura e Configuração

## Serviços utilizados
- **Firebase Firestore** — banco de dados NoSQL em tempo real
- **Firebase Authentication** — autenticação por e-mail/senha
- **Arquivo de configuração:** `assets/js/firebase.js`

> ⚠️ NUNCA alterar campos do Firestore sem mapear impacto em todos os módulos que lêem/gravam aquele campo.

---

## Estrutura completa do Firestore

```
users/
  {uid}/                              ← UID do Firebase Auth
    obras/
      {obraId}/                       ← ID gerado automaticamente

        /* ── Dados gerais da obra ── */
        nome            : string       ← Nome da obra
        endereco        : string       ← Endereço completo
        municipio       : string
        uf              : string
        responsavel     : string       ← Responsável técnico
        contrato        : string       ← Número do contrato
        status          : string       ← 'em_andamento' | 'concluida' | 'paralisada'
        valorContrato   : number       ← Valor original do contrato (R$)
        dataInicio      : string       ← Formato: 'YYYY-MM'
        dataPrevFim     : string       ← Formato: 'YYYY-MM'
        obs             : string       ← Observações gerais

        /* ── Resumo consolidado ── */
        resumo: {
          valorContratoAditivo : number   ← Valor contrato + todos os aditivos
          acumuladoTotal       : number   ← Valor executado acumulado total (R$)
          percentualGeral      : number   ← % executado geral
        }

        /* ── Cronograma planejado (consolidado por mês) ── */
        cronograma: [
          {
            mes           : number     ← 1, 2, 3... (índice do mês, começa em 1)
            planejadoPct  : number     ← % planejado simples naquele mês (ex: 5.23)
            planejadoValor: number     ← Valor (R$) planejado simples naquele mês
          },
          ...                          ← Um objeto por mês do cronograma
        ]

        /* ── Execução mensal (consolidado por mês) ── */
        cronogramaExecucao: [
          {
            mes           : number     ← 1, 2, 3...
            executadoPct  : number     ← % executado simples naquele mês
            executadoValor: number     ← Valor (R$) executado simples naquele mês
          },
          ...                          ← Um objeto por mês
        ]

        /* ── Data de referência da última atualização de execução ── */
        dataEmissaoExecucao: {
          mes : number                 ← Mês de referência (1–12)
          ano : number                 ← Ano de referência (ex: 2026)
        }

        /* ── Histórico de versões anteriores de execução ── */
        historicoExecucao: [
          {
            emissao: { mes: number, ano: number }
            cronogramaExecucao: [...]   ← Snapshot da execução daquela competência
            itensCronogramaExecucao: [...]
          },
          ...                          ← Uma entrada por emissão anterior salva
        ]

        /* ── Serviços (itens do cronograma) ── */
        itens: [
          {
            item          : string     ← Número do item (ex: '1', '1.1', '2')
            descricao     : string     ← Descrição do serviço
            pesoTotal     : number     ← Peso % do item no contrato total
            valorContrato : number     ← Valor (R$) do item
            acumulado     : number     ← Valor executado acumulado do item
            percentualExecutado: number ← % executado acumulado do item
          },
          ...
        ]

        /* ── Cronograma mensal por serviço (planejado) ── */
        itensCronograma: [
          {
            item      : string         ← Mesmo valor de itens[].item
            descricao : string
            pesoTotal : number
            valorTotal: number
            meses: [
              {
                mes   : number         ← 1, 2, 3...
                pct   : number         ← % planejado do item naquele mês
                valor : number         ← Valor (R$) planejado do item naquele mês
              },
              ...                      ← Apenas meses com valor > 0 são gravados
            ]
          },
          ...
        ]

        /* ── Execução mensal por serviço ── */
        itensCronogramaExecucao: [
          {
            item  : string
            meses: [
              {
                mes   : number
                pct   : number         ← % executado do item naquele mês
                valor : number         ← Valor (R$) executado do item naquele mês
              },
              ...
            ]
          },
          ...
        ]

        /* ── Aditivos contratuais ── */
        aditivos: [
          {
            id          : string       ← ID único do aditivo
            nome        : string       ← Ex: 'Aditivo 1'
            valor       : number       ← Valor (R$) do aditivo
            dataInicio  : string       ← Formato: 'YYYY-MM'
            cronograma  : [...]        ← Mesmo formato de cronograma[]
            cronogramaExecucao: [...] ← Mesmo formato de cronogramaExecucao[]
          },
          ...
        ]
```

---

## Módulos que acessam o Firestore

| Módulo | Operação | Campos acessados |
|---|---|---|
| `firebase.js` | Inicialização | config do projeto |
| `app.js` | Leitura em tempo real | `users/{uid}/obras` |
| `events.js` | Leitura / Escrita / Exclusão | todos os campos da obra |
| `events-import.js` | Escrita | `itens`, `itensCronograma`, `cronograma` |
| `cronograma.js` | Leitura / Escrita | `cronograma`, `itensCronograma` |
| `render.js` | Leitura | todos os campos |
| `render-charts.js` | Leitura | `cronograma`, `cronogramaExecucao`, `dataInicio`, `aditivos` |
| `render-servicos.js` | Leitura | `itensCronograma`, `itensCronogramaExecucao`, `itens` |
| `render-admin.js` | Leitura | todos os usuários e obras |
| `auditoria.js` | Escrita | coleção separada de logs |

---

## Regras de segurança (Firestore Rules)
- Usuário autenticado só acessa seus próprios dados (`/users/{uid}/`).
- Admin tem acesso de leitura a todos os usuários.
- Colaboradores têm acesso restrito a obras específicas compartilhadas.

---

## Observações importantes
- O campo `dataInicio` usa formato `'YYYY-MM'` — nunca usar `Date` direto.
- Arrays como `cronograma[]` e `itensCronograma[]` são **sempre substituídos inteiros** no save (não há update parcial de item do array).
- `historicoExecucao[]` cresce a cada nova emissão salva — monitorar tamanho do documento.
- Limite do Firestore por documento: **1 MB**. Obras com muitos meses e serviços podem se aproximar desse limite.
