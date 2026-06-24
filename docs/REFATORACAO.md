# Plano de Refatoração Incremental

> **Princípio:** Nunca reescrever tudo de uma vez. Cada fase termina com o sistema funcionando 100%.
> Um commit por extratoão. Comportamento externo nunca muda durante a refatoração.

---

## Diagnóstico atual

| Arquivo | Tamanho | Problema |
|---|---|---|
| `render.js` | ~14 KB | Mistura renderização de obra, dashboard, admin e persistência |
| `render-admin.js` | ~15 KB | Muito grande, mistura UI e lógica de acesso admin |
| `events.js` | ~10 KB | Mistura auth, UI, exportação, edição de tabela e aditivos |
| `events-import.js` | ~11 KB | Mistura parse de Excel, mapeamento e gravação no Firestore |
| `state.js` | ~12 KB | Correto, mas acumula funções de domínios diferentes |
| `cronograma.js` | ~13 KB | Bem focado — parser de planilha. Baixo risco. |
| `render-charts.js` | ~13 KB | Bem focado — gráficos. Baixo risco. |
| `render-servicos.js` | ~9 KB | Bem focado — Curvas S por serviço. Baixo risco. |

**Arquivos que mais doem:** `render.js`, `render-admin.js`, `events.js`, `events-import.js`

---

## Divisão alvo (modular monolith)

```
assets/js/

  /* ── Infraestrutura ── */
  firebase.js              (existente — não alterar)
  state.js                 (existente — manter estado + utilitários)

  /* ── Domínio: Auth ── */
  auth-events.js           ← NOVO: login, logout, cadastro de colaborador

  /* ── Domínio: Obra ── */
  obra-service.js          ← NOVO: saveObra, deleteObra, scheduleSave
  obra-events.js           ← NOVO: bindEvents da obra (tabela, campos, exportação)

  /* ── Domínio: Importação ── */
  cronograma.js            (existente — manter, já bem focado)
  import-service.js        ← NOVO: toda a lógica de parse + gravação no Firestore

  /* ── Domínio: Renderização ── */
  render-obra.js           ← NOVO: renderização da obra (tabela de itens, dashboard)
  render-charts.js         (existente — não alterar)
  render-servicos.js       (existente — não alterar)
  render-obras.js          (existente — não alterar)

  /* ── Domínio: Admin ── */
  admin-service.js         ← NOVO: lógica de acesso, bloqueio, listagem
  admin-render.js          ← NOVO: UI do painel admin (extraido de render-admin.js)

  /* ── Orquestrador ── */
  app.js                   (existente — só ajustar imports)

  /* ── Arquivos fachada temporária (removidos ao final) ── */
  render.js                → vira fachada vazia redirecionando para novos módulos
  events.js                → vira fachada vazia redirecionando para novos módulos
  events-import.js         → vira fachada vazia redirecionando para novos módulos
  render-admin.js          → vira fachada vazia redirecionando para novos módulos
```

---

## Fases de execução

---

### FASE 1 — Extrair `obra-service.js`
**Risco:** Mínimo
**O que muda:** Nada no comportamento externo.

**Extrair de `render.js`:**
- `saveObra(obra)`
- `deleteObra(obraId)`
- `scheduleSave()`
- `currentObra()`

**Passos:**
1. Criar `assets/js/obra-service.js` com as 4 funções.
2. Em `render.js`, substituir as implementações por re-exports:
   ```js
   export { saveObra, deleteObra, scheduleSave, currentObra } from './obra-service.js';
   ```
3. Testar: salvar obra, deletar obra, editar campo — tudo deve funcionar igual.
4. Commit: `refactor: extrai obra-service.js de render.js`

---

### FASE 2 — Extrair `auth-events.js`
**Risco:** Baixo
**O que muda:** Nada no comportamento externo.

**Extrair de `events.js`:**
- Handler de login (`loginForm`)
- Handler de logout (usuário e admin)
- `setupColabForm()`
- `toggleBloqueio()`, `removeColab()`

**Passos:**
1. Criar `assets/js/auth-events.js` com essas funções.
2. Em `events.js`, substituir por re-exports do novo arquivo.
3. Testar: login, logout, cadastrar colaborador, bloquear/desbloquear.
4. Commit: `refactor: extrai auth-events.js de events.js`

---

### FASE 3 — Extrair `import-service.js`
**Risco:** Médio (arquivo mais crítico de importação)
**O que muda:** Nada no comportamento externo.

**Extrair de `events-import.js`:**
- `importCronograma()` — importa cronograma previsto
- `importCronogramaMensal()` — importa execução mensal
- `importCronogramaPrevistoAditivo(id)` — importa previsto do aditivo
- `importCronogramaMensalAditivo(id)` — importa execução do aditivo
- `addNovoAditivo()`, `renomearAditivo()`, `removerAditivo()`
- `importFile(replace)` — importa obra inteira

**Passos:**
1. Criar `assets/js/import-service.js` com todas as funções acima.
2. Em `events-import.js`, substituir por re-exports.
3. Testar: importar cronograma, importar execução mensal, adicionar aditivo.
4. Commit: `refactor: extrai import-service.js de events-import.js`

---

### FASE 4 — Extrair `render-obra.js`
**Risco:** Médio
**O que muda:** Nada no comportamento externo.

**Extrair de `render.js`:**
- `renderAll()` — renderização geral da obra
- `applySelected(obra)` — aplica obra selecionada
- `updateDashboard()` — atualiza painel de resumo
- Funções de renderização da tabela de itens

**Mantém em `render.js` (temporário):**
- Re-exports das funções migradas
- Funções de admin (serão extraídas na Fase 5)

**Passos:**
1. Criar `assets/js/render-obra.js`.
2. Mover as funções listadas.
3. Em `render.js`, re-exportar.
4. Testar: selecionar obra, ver tabela, ver dashboard, editar item.
5. Commit: `refactor: extrai render-obra.js de render.js`

---

### FASE 5 — Extrair `admin-service.js` e `admin-render.js`
**Risco:** Baixo
**O que muda:** Nada no comportamento externo.

**Extrair de `render-admin.js`:**
- `admin-render.js` ← toda a UI do painel (HTML gerado)
- `admin-service.js` ← lógica de listagem, acesso, permissões

**Extrair de `render.js`:**
- `renderAdminViews()`, `renderAdminDetail()`, `renderColabList()`, `renderAdminSidebar()`

**Passos:**
1. Criar `assets/js/admin-service.js`.
2. Criar `assets/js/admin-render.js`.
3. Mover as funções correspondentes.
4. Atualizar `render.js` e `render-admin.js` para re-exportar.
5. Testar: painel admin, listar colaboradores, bloquear/desbloquear.
6. Commit: `refactor: extrai admin-service.js e admin-render.js`

---

### FASE 6 — Extrair `obra-events.js`
**Risco:** Baixo
**O que muda:** Nada no comportamento externo.

**Extrair de `events.js`:**
- Eventos da tabela de itens (`tbody` blur, click)
- Eventos de edição de campos da obra (`projDataInicio`)
- Exportação CSV e JSON
- `setupNovaAtividade()`
- Eventos de aditivos (`aditivosBox`)

**Passos:**
1. Criar `assets/js/obra-events.js`.
2. Mover as funções listadas.
3. Em `events.js`, re-exportar.
4. Testar: editar item na tabela, exportar CSV, mudar data de início.
5. Commit: `refactor: extrai obra-events.js de events.js`

---

### FASE 7 — Limpeza das fachadas
**Risco:** Mínimo (tudo já foi validado nas fases anteriores)
**O que muda:** Imports diretos nos arquivos consumidores.

**Passos:**
1. Atualizar `app.js` para importar diretamente dos novos módulos.
2. Remover as fachadas (`render.js`, `events.js`, `events-import.js`, `render-admin.js`) ou
   mantê-las como re-exports permanentes (mais seguro).
3. Commit: `refactor: atualiza imports para apontar direto aos novos módulos`

---

### FASE 8 — Nova feature sobre estrutura modular
**Agora sim, implementar novas funcionalidades** (ex: ordenação, filtros, PDF)
Sob estrutura modular, cada nova feature é adicionada ao módulo de domínio correto,
sem precisar abrir arquivos grandes.

---

## Regras durante a refatoração

| # | Regra |
|---|---|
| 1 | Um módulo por commit — nunca misturar duas extrações no mesmo commit |
| 2 | Testar no browser após cada fase antes do próximo commit |
| 3 | Não mudar comportamento externo — apenas mover código |
| 4 | Manter fachadas de re-export enquanto houver consumidores apontando para o arquivo antigo |
| 5 | Nunca fazer refatoração e feature nova no mesmo commit |
| 6 | Se algo quebrar, reverter o último commit e refazer com granularidade menor |
| 7 | Atualizar `docs/DECISOES.md` ao final de cada fase |

---

## Impacto esperado

| Aspecto | Antes | Depois |
|---|---|---|
| Arquivos grandes (>10KB) | 5 arquivos | 0 arquivos |
| Responsabilidade por arquivo | Múltiplas | Única |
| Risco ao adicionar feature | Alto (mexe em arquivo gigante) | Baixo (mexe só no módulo correto) |
| Respostas cortadas ao editar | Frequente | Raro |
| Tempo para entender um módulo | Alto | Baixo |
| Comportamento externo do site | Inalterado | Inalterado |

---

## Status das fases

| Fase | Descrição | Status |
|---|---|---|
| 1 | Extrair `obra-service.js` | ⏳ Pendente |
| 2 | Extrair `auth-events.js` | ⏳ Pendente |
| 3 | Extrair `import-service.js` | ⏳ Pendente |
| 4 | Extrair `render-obra.js` | ⏳ Pendente |
| 5 | Extrair `admin-service.js` + `admin-render.js` | ⏳ Pendente |
| 6 | Extrair `obra-events.js` | ⏳ Pendente |
| 7 | Limpeza das fachadas | ⏳ Pendente |
| 8 | Novas features sobre estrutura modular | ⏳ Aguardando fases anteriores |
