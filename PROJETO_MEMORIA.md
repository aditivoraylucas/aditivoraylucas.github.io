# 📦 PROJETO_MEMORIA.md
> Arquivo de contexto do projeto — atualizado a cada sessão com "Atualize a memória"

---

## 🏗️ Visão Geral do Projeto

**Nome:** AditiVo — Sistema de Gestão de Obras
**Repositório:** `aditivoraylucas/aditivoraylucas.github.io`
**URL pública:** `https://aditivoraylucas.github.io`
**Stack:** HTML + CSS + JavaScript puro (ES Modules), Firebase (auth + Firestore)

### Objetivo
Sistema web para gestão de obras de construção civil:
- Colaboradores lançam medições, cronogramas, aditivos e serviços
- Admin visualiza tudo como espelho (read-only) do que o colaborador faz
- Curvas S automáticas por item, por serviço e por aditivo

---

## 📁 Arquitetura de Arquivos

```
/
├── index.html                  # App principal (SPA)
├── assets/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── state.js            # Estado global + helpers (money, pct, buildCurvaServico...)
│       ├── obra-service.js     # currentObra() — obra ativa
│       ├── obra-context.js     # Registro de funções entre módulos (evita ciclo)
│       ├── url-state.js        # Sincroniza obraId na URL
│       ├── render-obra.js      # Renderização da obra ativa (tabela, dashboard, Curvas S)
│       ├── render-obras.js     # Lista de obras + cronograma + aditivos
│       ├── render-charts.js    # Chart.js: renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo
│       ├── render-servicos.js  # Cards de Curvas S por Serviço
│       ├── render-admin.js     # Painel admin (espelho do colaborador)
│       └── firebase.js         # Auth + Firestore
└── docs/
    └── (documentação auxiliar)
```

---

## 👥 Perfis de Usuário

| Perfil | Acesso | Pode editar? |
|---|---|---|
| `admin` | Vê todos os colaboradores e obras | ❌ Somente leitura |
| `colaborador` | Vê apenas as próprias obras | ✅ Edita tudo |

---

## 🔑 Estrutura de Dados (Firestore)

### Obra (`users/{uid}/obras/{obraId}`)
```js
{
  id, nome, contratada, medicaoAtual, dataInicio,
  itens: [],              // índice de itens do contrato
  cronograma: [],         // valores mensais planejados (contrato)
  cronogramaExecucao: [], // valores mensais executados (contrato)
  cronogramaItens: [],    // serviços planejados por mês (contrato)
  cronogramaItensExecucao: [], // serviços executados por mês (contrato)
  dataEmissao, dataEmissaoExecucao,
  historicoExecucao: [],  // snapshots anteriores para linha de referência
  resumo: { valorContratoAditivo, acumuladoTotal, estaMedicao },
  aditivos: [             // array de aditivos
    {
      id, nome,
      cronograma: [],
      cronogramaExecucao: [],
      cronogramaItens: [],
      cronogramaItensExecucao: [],
      dataEmissao, dataEmissaoExecucao,
      historicoExecucao: []
    }
  ]
}
```

---

## 📈 Lógica das Curvas S

### Curva S 1 — Índice de Itens
- Função: `renderCurvaS1(canvasId, wrapId, itens, chartRef)`
- Dados: array de `itens` com `percentualExecutado`

### Curva S 2 — Cronograma Físico-Financeiro (Contrato)
- Função: `renderCurvaS2(canvasId, wrapId, obra, chartRef)`
- Dados: `obra.cronograma` (planejado) + `obra.cronogramaExecucao` (executado)

### Curva S 2 Aditivo — por aditivo
- Função: `renderCurvaS2Aditivo(canvasId, wrapId, ad, dataInicioAd, chartRef)`
- Criada automaticamente para cada aditivo com cronograma

### Curvas S por Serviço
- Função principal: `buildFonteServico(obra)` em `render-obra.js` (exportada)
- **Regra:** usa SEMPRE o último aditivo que tenha `cronogramaItens`; fallback = contrato
- Função de render: `renderCurvasPorServico(containerId, fonte, prefix)` em `render-servicos.js`
- Cards expansíveis por serviço, com badge de status (em dia / adiantado / atrasado)

---

## 🔁 Painel Admin — Espelho do Colaborador

- Arquivo: `render-admin.js`
- **Importa `buildFonteServico` diretamente de `render-obra.js`** (fonte única de verdade)
- Espelha exatamente o que o colaborador vê: mesmas Curvas S, mesmos dados, mesma lógica
- IDs DOM diferentes: `adminCurvasPorServicoPanel`, `adminCurvasPorServicoContainer`, etc.
- Sem botões de edição — somente leitura

---

## ⚠️ Restrições Técnicas Importantes

1. **Sem ciclo de imports:** `render-obra.js` ↔ `render-obras.js` usam `obra-context.js` como intermediário
2. **Funções compartilhadas exportadas:** `buildFonteServico` em `render-obra.js` é importada pelo `render-admin.js` — nunca duplicar essa lógica
3. **SHA obrigatório em updates:** ao atualizar arquivo existente via API, sempre buscar o SHA atual
4. **Firebase sem localStorage:** não usar `localStorage` (sandbox bloqueia)

---

## 🗓️ Histórico de Sessões

| Data | O que foi feito |
|---|---|
| 2026-06-24 | Admin criado como espelho do colaborador; `buildFonteServico` exportada e compartilhada; Curvas S por Serviço corrigidas para sempre usar o último aditivo |
| _(sessões anteriores)_ | Cronograma, aditivos, serviços, admin base, Firebase |
