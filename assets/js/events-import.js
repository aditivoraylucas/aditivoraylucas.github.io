/**
 * events-import.js — FACHADA DEPRECATED.
 *
 * Toda a lógica foi movida para import-service.js na Fase 3.
 * Este arquivo existe apenas para compatibilidade com possíveis imports
 * externos não mapeados.
 *
 * TODO: remover após confirmar que nenhum arquivo importa daqui.
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
