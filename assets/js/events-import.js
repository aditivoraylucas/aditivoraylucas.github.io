/**
 * events-import.js — FACHADA (Fase 3 da refatoração incremental).
 * Toda a lógica foi movida para import-service.js.
 * Este arquivo re-exporta tudo para não quebrar consumidores existentes.
 *
 * Consumidores que importam daqui:
 *   - events.js (bindEvents)
 *   - app.js (se importar diretamente)
 *
 * TODO fase-7: atualizar consumidores para importar direto de import-service.js
 * e remover este arquivo.
 */
export {
  importFile,
  importCronograma,
  importCronogramaMensal,
  importCronogramaPrevistoAditivo,
  importCronogramaMensalAditivo,
  addNovoAditivo,
  renomearAditivo,
  removerAditivo
} from './import-service.js';
