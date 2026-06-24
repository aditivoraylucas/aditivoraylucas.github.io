# Projeto: Sistema de Gestão de Cronograma Físico-Financeiro de Obras

## Objetivo
Plataforma web para gestão e acompanhamento de obras públicas e privadas.
Permite cadastrar obras, lançar cronogramas físico-financeiros, registrar execução mensal por serviço, gerar Curvas S e comparar o planejado vs executado em tempo real.

---

## Repositório
- **GitHub Pages:** https://aditivoraylucas.github.io
- **Repositório:** https://github.com/aditivoraylucas/aditivoraylucas.github.io
- **Branch principal:** `main`
- **Deploy:** automático via GitHub Pages (sem build, arquivos servidos diretamente)

---

## Tecnologias utilizadas
- **Front-end:** HTML5 + CSS3 + JavaScript puro (ES Modules, sem framework)
- **Banco de dados:** Firebase Firestore (tempo real, NoSQL)
- **Autenticação:** Firebase Authentication (e-mail/senha)
- **Hospedagem:** GitHub Pages
- **Gráficos:** Chart.js (CDN)
- **Importação de planilhas:** SheetJS / xlsx (CDN)
- **Controle de versão:** Git + GitHub

---

## Estrutura de arquivos

```
/
  index.html                  → Único HTML; todas as views estão nele (login, app, admin)
  assets/
    css/
      style.css               → Estilos globais + tema dark/light
    js/
      firebase.js             → Inicialização do Firebase (config + exports: db, auth)
      state.js                → Estado global, utilitários, buildCronogramaTimeline,
                                buildCurvaServico, detectarAnomaliaServico
      app.js                  → Inicialização, roteamento de views, listeners de auth
      events.js               → Eventos do usuário (salvar obra, editar, excluir, etc.)
      events-import.js        → Importação de planilha Excel (mapeamento de colunas)
      cronograma.js           → Lógica do cronograma físico-financeiro (tabela + cálculos)
      excel.js                → Exportação para Excel (cronograma + execução)
      render.js               → Renderização principal da obra (resumo, abas, status)
      render-charts.js        → Curva S do Contrato e do Aditivo (_renderCurvaS2Generica)
      render-servicos.js      → Curvas S individuais por serviço
      render-obras.js         → Lista de obras do usuário
      render-admin.js         → Painel administrativo (todos os usuários e obras)
      auditoria.js            → Log de ações do usuário no Firestore
      url-state.js            → Persistência de aba/obra selecionada na URL
```

---

## Estrutura do Firestore

```
users/{uid}/
  obras/{obraId}/
    → dados da obra (nome, endereço, valor, datas, status, responsável...)
    → cronograma[]            → array de meses com planejadoPct e planejadoValor
    → cronogramaExecucao[]    → array de meses com executadoPct e executadoValor
    → itens[]                 → serviços do cronograma (item, descrição, peso, valor)
    → itensCronograma[]       → cronograma mensal por serviço (meses[])
    → itensCronogramaExecucao[] → execução mensal por serviço (meses[])
    → resumo{}                → valorContratoAditivo, acumuladoTotal, etc.
    → dataInicio              → string 'YYYY-MM'
    → dataEmissaoExecucao{}   → { mes, ano } → referência da última atualização
    → historicoExecucao[]     → versões anteriores de execução salvas
    → aditivos[]              → aditivos contratuais com próprio cronograma
```

> ⚠️ NUNCA alterar a estrutura do Firestore sem validar impacto em todos os módulos.

---

## Funcionalidades já prontas

### Gestão de obras
- Cadastro, edição e exclusão de obras
- Upload de planilha Excel para importar cronograma (itens + valores + % por mês)
- Exportação do cronograma + execução para Excel
- Aditivos contratuais com cronograma próprio

### Cronograma Físico-Financeiro
- Tabela com 18 meses (configurável) e % planejado por serviço/mês
- Cálculo automático de totais simples e acumulados
- Edição inline mês a mês por serviço
- Validação de % (soma não pode ultrapassar 100% por item)

### Execução Mensal
- Lançamento do executado por serviço, mês a mês
- Histórico de versões anteriores (comparação entre emissões)
- Badge de status por serviço: Em dia / Atrasado / Adiantado / Não iniciado
- Detecção de anomalias: início antes do previsto, execução fora do cronograma, muito adiantado

### Curvas S
- **Curva S — Contrato:** planejado vs executado acumulado do contrato todo
- **Curva S — Aditivo:** mesma lógica para cada aditivo
- **Curvas S por Serviço:** gráfico individual para cada item do cronograma
- Linha do executado **cortada no último mês com execução real** (cauda vazia não é exibida)
- Linha do planejado sempre exibida completa até o último mês do cronograma
- Tooltip com desvio (adiantado/atrasado)

### Painel Admin
- Visualização de todos os usuários e suas obras
- Acesso completo para suporte

### Autenticação
- Login e logout via Firebase Auth
- Separação de acesso: usuário comum vs admin
- Colaboradores com acesso restrito a obras específicas

---

## Funcionalidades pendentes / em aberto
- Notificações automáticas de atraso por e-mail
- Exportação em PDF do relatório da obra
- Dashboard geral com resumo de todas as obras
- Filtro e busca na lista de obras

---

## Regras importantes (NUNCA ignorar)

1. **Nunca alterar a estrutura do Firestore** sem mapear impacto em todos os módulos que lêem/gravam aquele campo.
2. **A linha do Planejado nunca é cortada** — sempre exibe todos os meses do cronograma.
3. **A linha do Executado é cortada pela execução real**, não pelo planejado:
   - Escaneia do último mês para o primeiro.
   - Corta após o último mês onde `executadoPct > 0` ou `executadoValor > 0`.
   - Buracos no meio (mês zero entre meses com execução) são **preservados**.
   - Cauda final vazia (meses após o último trabalho real) **não é exibida**.
4. **Mesma lógica de corte** se aplica tanto à Curva S do Contrato/Aditivo (`render-charts.js`) quanto às Curvas S por Serviço (`state.js → buildCurvaServico`).
5. **Não usar frameworks** — o projeto é JS puro, sem React, Vue ou similares.
6. **Não usar bundlers** — sem Webpack, Vite ou esbuild. Tudo via ES Modules nativos e CDN.
7. **Sempre testar impacto visual** antes de alterar lógica de acúmulo ou corte dos gráficos.
8. Manter o padrão de módulos separados por responsabilidade (render, events, state, etc.).

---

## Arquivos mais sensíveis
| Arquivo | Por quê é sensível |
|---|---|
| `state.js` | Estado global + toda a lógica de cálculo das curvas S |
| `firebase.js` | Credenciais e inicialização do banco |
| `cronograma.js` | Cálculos do cronograma físico-financeiro |
| `render-charts.js` | Renderização das Curvas S do contrato e aditivo |
| `render-servicos.js` | Renderização das Curvas S por serviço |
| `events.js` | Salvar/editar/excluir obras no Firestore |

---

## Últimas decisões técnicas relevantes
- **2026-06:** Corte do executado migrado de âncora no planejado para âncora na execução real, tanto em `state.js` (serviços) quanto em `render-charts.js` (contrato/aditivo).
- **2026-06:** Adicionada detecção de anomalias por serviço (`detectarAnomaliaServico` em `state.js`).
- **2026-06:** Histórico de execuções salvo em `historicoExecucao[]` para comparação entre emissões.
