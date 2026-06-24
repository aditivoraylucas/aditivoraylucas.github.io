/**
 * render.js — FACHADA DEPRECATED.
 *
 * Toda a lógica foi distribuída nas Fases 1–6 para:
 *   - obra-service.js  (saveObra, deleteObra, scheduleSave, currentObra)
 *   - render-obra.js   (renderAll, renderTable, updateDashboard, applySelected, ...)
 *   - render-charts.js (renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo)
 *   - render-servicos.js (renderCurvasPorServico)
 *   - render-admin.js  (renderAdminStats, renderAdminSidebar, renderColabList, ...)
 *   - render-obras.js  (renderObrasBox, renderCronogramaBox, ...)
 *
 * Este arquivo existe apenas para compatibilidade com possíveis imports
 * externos não mapeados. Não adicionar lógica aqui.
 *
 * TODO: remover após confirmar que nenhum arquivo importa daqui.
 */

export { saveObra, deleteObra, scheduleSave, currentObra } from './obra-service.js';
export { applySelected, renderTable, renderAditivosCurvas, renderCurvasPorServicoPanel, updateDashboard, renderAll, setImportFileFn } from './render-obra.js';
export { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo } from './render-charts.js';
export { renderCurvasPorServico } from './render-servicos.js';
export { renderAdminStats, renderAdminSidebar, renderColabList, renderAdminDetail, renderAdminViews, adminObraCardHTML } from './render-admin.js';
export { renderObrasBox, renderCronogramaBox, renderCronogramaMensalBox, renderAditivosSection } from './render-obras.js';
