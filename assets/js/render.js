/**
 * render.js — FACHADA (Fase 4 da refatoração incremental).
 * A lógica de renderização da obra foi movida para render-obra.js.
 * Este arquivo re-exporta tudo para não quebrar consumidores existentes.
 *
 * Consumidores principais: events.js, events-import.js, app.js
 *
 * TODO fase-7: atualizar consumidores para importar direto dos novos módulos
 * e remover este arquivo.
 */

// ── De render-obra.js (Fase 4) ──
export {
  applySelected,
  renderTable,
  renderAditivosCurvas,
  renderCurvasPorServicoPanel,
  updateDashboard,
  renderAll,
  setImportFileFn
} from './render-obra.js';

// ── De obra-service.js (Fase 1) ──
export { saveObra, deleteObra, scheduleSave, currentObra } from './obra-service.js';

// ── De render-charts.js (inalterado) ──
export { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo } from './render-charts.js';

// ── De render-servicos.js (inalterado) ──
export { renderCurvasPorServico } from './render-servicos.js';

// ── De render-admin.js (inalterado) ──
export {
  renderAdminStats,
  renderAdminSidebar,
  renderColabList,
  renderAdminDetail,
  renderAdminViews,
  adminObraCardHTML
} from './render-admin.js';

// ── De render-obras.js (inalterado) ──
export {
  renderObrasBox,
  renderCronogramaBox,
  renderCronogramaMensalBox,
  renderAditivosSection
} from './render-obras.js';
