import { $, state, showToast, cleanup } from './state.js';
import { auth } from './firebase.js';
import { renderAll, applySelected, updateDashboard, renderAdminViews, renderAdminDetail, renderColabList, renderAdminSidebar } from './render-obra.js';
import { renderAdminViews as _renderAdminViews, renderAdminDetail as _renderAdminDetail, renderColabList as _renderColabList, renderAdminSidebar as _renderAdminSidebar } from './render-admin.js';
import { importFile } from './import-service.js';
import { setupColabForm, setupLoginForm, setupLogout } from './auth-events.js';
import { bindObraEvents } from './obra-events.js';

/**
 * events.js — orquestrador de eventos (Fase 6 da refatoração incremental).
 * Não contém lógica própria: apenas chama bind* dos módulos especializados
 * e registra os poucos globals de admin que ainda não têm módulo próprio.
 */

export { setupColabForm } from './auth-events.js';
export { importFile } from './import-service.js';

export function bindEvents() {
  // ── auth ──
  setupLoginForm();
  setupLogout();

  // ── obra (tabela, importação, aditivos, exportação, etc.) ──
  bindObraEvents();

  // ── admin globals ──
  window.adminSelectColab = uid => {
    state.adminSelectedUid = uid; state.adminSelectedObraId = null;
    _renderAdminSidebar(); _renderAdminDetail();
  };
  window.adminDeselectColab = () => {
    state.adminSelectedUid = null; state.adminSelectedObraId = null;
    _renderAdminSidebar(); _renderAdminDetail();
  };
  window.adminSelectObra = obraId => {
    state.adminSelectedObraId = obraId || null; _renderAdminDetail();
  };

  // ── tema ──
  const themeBtn = $('toggleTheme');
  if (themeBtn) themeBtn.onclick = () => {
    const html = document.documentElement, dark = html.dataset.theme === 'dark';
    html.dataset.theme = dark ? 'light' : 'dark';
    themeBtn.textContent = dark ? '\u{1F319}' : '\u2600\uFE0F';
    updateDashboard();
  };

  // ── menus laterais ──
  const menuBtn = $('menuBtn');
  if (menuBtn) menuBtn.onclick = () => {
    const a = document.querySelector('.app-aside'); if (a) a.classList.toggle('aside-open');
  };
  const menuBtnAdmin = $('menuBtnAdmin');
  if (menuBtnAdmin) menuBtnAdmin.onclick = () => {
    const a = $('adminAside'); if (a) a.classList.toggle('aside-open');
  };

  // ── painel de colaboradores (admin) ──
  const adminToggle = $('adminToggleColab');
  if (adminToggle) adminToggle.onclick = () => {
    const p = $('adminColabPanel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  };

  // ── botão topo ──
  window.addEventListener('scroll', () => {
    const btn = $('btnTopo'); if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
  });
}

export function setupNovaAtividade() {
  const vc  = $('fValorContrato');
  const med = $('fMedicao');
  const acu = $('fAcumulado');
  const update = () => {
    if (!vc || !med || !acu) return;
    const { parseMoney, money } = await import('./state.js').then(m => m);
    // inline para evitar import circular
    const v = parseFloat(String(vc.value).replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
    const a = parseFloat(String(acu.value).replace(/[^\d,.-]/g,'').replace(',','.')) || 0;
    const saldoEl = $('fSaldo'), pctEl = $('fPct');
    if (saldoEl) saldoEl.value = (v - a).toLocaleString('pt-BR', {minimumFractionDigits:2});
    if (pctEl)   pctEl.value   = (v > 0 ? +(a / v * 100).toFixed(2) : 0) + '%';
  };
  if (vc)  vc.addEventListener('input', update);
  if (med) med.addEventListener('input', update);
  if (acu) acu.addEventListener('input', update);
}
