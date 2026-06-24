# TODO — Pendências e Melhorias

> Atualizar este arquivo sempre que uma funcionalidade for concluída ou uma nova ideia surgir.

---

## 🔴 Alta prioridade

- [ ] **Filtro e busca na lista de obras** — hoje a lista cresce sem possibilidade de filtrar por nome, status ou município.
- [ ] **Validação de limite de documento Firestore** — obras com muitos meses e serviços podem se aproximar do limite de 1MB por documento. Adicionar aviso ao usuário.

---

## 🟡 Média prioridade

- [ ] **Exportação em PDF do relatório da obra** — gerar PDF com Curva S + tabela de execução para entrega formal.
- [ ] **Dashboard geral** — tela resumo com todas as obras do usuário: % médio de execução, obras atrasadas, em dia, concluídas.
- [ ] **Notificações automáticas de atraso** — alertar por e-mail quando a execução acumulada ficar abaixo do planejado por mais de X%.
- [ ] **Paginação ou scroll virtual na lista de serviços** — obras com muitos itens podem travar a renderização da tabela.

---

## 🟢 Baixa prioridade / melhorias futuras

- [ ] **Modo impressão** — CSS de impressão para a tabela do cronograma.
- [ ] **Comparação lado a lado de dois aditivos** — gráfico com múltiplas curvas S de aditivos diferentes.
- [ ] **Internacionalização (i18n)** — suporte a outros idiomas além do português.
- [ ] **Teste automatizado das funções de cálculo** — especialmente `buildCurvaServico` e `detectarAnomaliaServico`.
- [ ] **Compressão do histórico de execuções** — `historicoExecucao[]` cresce indefinidamente; avaliar limite ou arquivamento.

---

## ✅ Concluído

- [x] Login e logout via Firebase Auth
- [x] Cadastro, edição e exclusão de obras
- [x] Importação de cronograma via planilha Excel
- [x] Exportação de cronograma + execução para Excel
- [x] Curva S do Contrato (planejado vs executado)
- [x] Curva S do Aditivo
- [x] Curvas S individuais por serviço
- [x] Corte da cauda vazia do executado pelo último mês com execução real
- [x] Histórico de versões de execução (comparação entre emissões)
- [x] Badge de status por serviço (Em dia / Atrasado / Adiantado / Não iniciado)
- [x] Detecção de anomalias por serviço
- [x] Painel administrativo
- [x] Colaboradores com acesso restrito
- [x] Tema dark/light
- [x] Aditivos contratuais com cronograma próprio
- [x] Documentação centralizada em `/docs`
