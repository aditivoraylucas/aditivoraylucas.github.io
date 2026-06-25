# 🧠 DECISOES.md
> Registro de decisões técnicas e de produto — o "porquê" de cada escolha

---

## Decisões de Arquitetura

### [2026-06-24] `buildFonteServico` é exportada de `render-obra.js`

**Decisão:** A função que determina qual fonte de dados usar nas Curvas S por Serviço é exportada de `render-obra.js` e importada por `render-admin.js`.

**Motivo:** O admin é espelho do colaborador. Duplicar a lógica causaria divergência de dados. Fonte única de verdade.

**Impacto:** Qualquer alteração na lógica de seleção de fonte afeta automaticamente colaborador e admin.

---

### [2026-06-24] Curvas S por Serviço: sempre o ÚLTIMO aditivo com `cronogramaItens`

**Decisão:** Ao invés de mostrar um seletor de fonte (Contrato / Aditivo 1 / Aditivo 2...), a seção Curvas S por Serviço sempre exibe automaticamente o dado mais recente.

**Regra de prioridade:**
```
Aditivo N (último com cronogramaItens)  ← usa este
  ↑ se não tiver
Aditivo N-1
  ↑ se não tiver
...
Contrato inicial
  ↑ se não tiver
Painel oculto
```

**Motivo:** Um aditivo sempre substitui/complementa o contrato anterior. O último aditivo representa o estado atual do contrato. Não faz sentido o usuário escolher manualmente qual cronograma de serviços ver.

---

### [2026-06-XX] Evitar ciclo de imports: `obra-context.js` como mediador

**Decisão:** `render-obra.js` e `render-obras.js` não se importam diretamente. Funções compartilhadas (`applySelected`, `renderAll`, `updateDashboard`, `renderObrasBox`) são registradas/obtidas via `obra-context.js`.

**Motivo:** Import circular em ES Modules gera `undefined` em tempo de execução sem erro visível — bug difícil de rastrear.

---

### [2026-06-XX] `render-admin.js` não duplica lógica de renderização

**Decisão:** O admin reutiliza funções de `render-charts.js` e `render-servicos.js` diretamente, apenas adaptando os IDs dos elementos DOM.

**Motivo:** Manter dois caminhos paralelos de renderização dobra a superfície de bugs. O admin é um consumidor dos mesmos dados, não um sistema separado.

---

## Decisões de Produto

### Admin é somente leitura (espelho)

**Decisão:** O admin não pode editar nenhuma obra. Só visualiza.

**Motivo:** A obra pertence ao colaborador. O admin acompanha o progresso sem interferir no trabalho.

---

### Aditivos criam nova Curva S (não substituem a do contrato)

**Decisão:** Cada aditivo gera seu próprio painel de Curva S Físico-Financeira, além da do contrato.

**Motivo:** O histórico de cada fase (contrato original + aditivos) precisa ser visível separadamente para auditoria e acompanhamento.

---

### Curvas S por Serviço mostram apenas a fonte mais recente

**Decisão:** (vide seção de arquitetura acima)

**Motivo:** Simplicidade para o usuário final — ele quer saber o estado atual dos serviços, não comparar cronogramas de fases passadas.

---

## Convenções de Código

| Padrão | Regra |
|---|---|
| IDs do admin | Prefixo `admin` nos IDs DOM: `adminCurvasPorServicoPanel` |
| Prefixo de state | Admin usa `adm_f`, colaborador usa `colab_f` |
| SHA em updates | Sempre buscar SHA atual antes de atualizar arquivo via API |
| Exportações | Funções compartilhadas entre colaborador e admin ficam em `render-obra.js` |
| Nomenclatura | `buildFonteServico` (singular) = retorna UMA fonte; `_buildFontesServico` (plural, removida) = retornava array |
