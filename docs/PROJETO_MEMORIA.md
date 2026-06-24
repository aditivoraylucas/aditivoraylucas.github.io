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
  docs/                       → Documentação do projeto
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

Ver detalhes completos em `docs/FIREBASE.md`.

```
users/{uid}/
  obras/{obraId}/
    → cronograma[], cronogramaExecucao[]
    → itens[], itensCronograma[], itensCronogramaExecucao[]
    → resumo{}, dataInicio, dataEmissaoExecucao{}
    → historicoExecucao[], aditivos[]
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

Ver `docs/TODO.md` para lista completa e prioridades.

---

## Regras importantes (NUNCA ignorar)

1. **Nunca alterar a estrutura do Firestore** sem mapear impacto em todos os módulos.
2. **A linha do Planejado nunca é cortada** — sempre exibe todos os meses do cronograma.
3. **A linha do Executado é cortada pela execução real**, não pelo planejado.
4. **Mesma lógica de corte** em `render-charts.js` e `state.js → buildCurvaServico`.
5. **Não usar frameworks** — JS puro, sem React, Vue ou similares.
6. **Não usar bundlers** — sem Webpack, Vite ou esbuild. Tudo via ES Modules + CDN.
7. **Sempre testar impacto visual** antes de alterar lógica de acúmulo ou corte dos gráficos.
8. Manter o padrão de módulos separados por responsabilidade.

---

## Arquivos mais sensíveis

| Arquivo | Por quê é sensível |
|---|---|
| `state.js` | Estado global + lógica de cálculo das curvas S |
| `firebase.js` | Credenciais e inicialização do banco |
| `cronograma.js` | Cálculos do cronograma físico-financeiro |
| `render-charts.js` | Curvas S do contrato e aditivo |
| `render-servicos.js` | Curvas S por serviço |
| `events.js` | Salvar/editar/excluir obras no Firestore |

---

## Últimas decisões técnicas relevantes
- **2026-06:** Corte do executado migrado para âncora na execução real (em `state.js` e `render-charts.js`).
- **2026-06:** Detecção de anomalias por serviço (`detectarAnomaliaServico` em `state.js`).
- **2026-06:** Histórico de execuções salvo em `historicoExecucao[]` para comparação entre emissões.
- **2026-06:** Documentação do projeto reorganizada em `/docs`.
