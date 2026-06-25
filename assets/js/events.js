import { $, state, showToast, cleanup, parseMoney, money } from './state.js';
import { setupColabForm, setupLoginForm, setupLogout, toggleBloqueio, removeColab } from './auth-events.js';
import { bindObraEvents } from './obra-events.js';
import { renderAdminDetail, renderAdminSidebar } from './render-admin.js';
import { updateDashboard } from './render-obra.js';
import { importFile } from './import-service.js';
import { renderPainelAuditoria } from './render-auditoria.js';

export { setupColabForm } from './auth-events.js';
export { importFile } from './import-service.js';

export function bindEvents() {
  // ── auth ──
  setupLoginForm();
  setupLogout();

  // ── obra ──
  bindObraEvents();

  // ── admin globals ──
  window.adminSelectColab = uid => {
    state.adminSelectedUid = uid; state.adminSelectedObraId = null;
    renderAdminSidebar(); renderAdminDetail();
  };
  window.adminDeselectColab = () => {
    state.adminSelectedUid = null; state.adminSelectedObraId = null;
    renderAdminSidebar(); renderAdminDetail();
  };
  window.adminSelectObra = obraId => {
    state.adminSelectedObraId = obraId || null; renderAdminDetail();
  };

  // ── filtros admin (Fase 3) ──
  window.adminFiltrarColab = valor => {
    if (!state.adminFiltros) state.adminFiltros = { busca: '', status: 'todas' };
    state.adminFiltros.busca = valor || '';
    renderAdminSidebar();
    requestAnimationFrame(() => {
      const el = document.getElementById('adminBuscaColab');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  };
  window.adminFiltrarStatus = status => {
    if (!state.adminFiltros) state.adminFiltros = { busca: '', status: 'todas' };
    state.adminFiltros.status = status || 'todas';
    renderAdminDetail();
  };

  // ── globals de colaboradores ──
  window.toggleBloqueio = (uid, bloqueado) => toggleBloqueio(uid, bloqueado);
  window.removeColab    = (uid)            => removeColab(uid);

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
    if (!p) return;
    const abrindo = p.style.display === 'none';
    p.style.display = abrindo ? 'block' : 'none';
    if (abrindo) {
      // fecha auditoria se estiver aberta
      const aud = $('adminAuditoriaPanel');
      if (aud) aud.style.display = 'none';
      // sobe para o topo da área principal
      const main = document.querySelector('#adminView .app-main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ── painel de auditoria (admin) ──
  const auditoriaToggle = $('adminToggleAuditoria');
  if (auditoriaToggle) auditoriaToggle.onclick = () => {
    const p = $('adminAuditoriaPanel');
    if (!p) return;
    const abrindo = p.style.display === 'none';
    p.style.display = abrindo ? 'block' : 'none';
    if (abrindo) {
      // fecha colaboradores se estiver aberto
      const col = $('adminColabPanel');
      if (col) col.style.display = 'none';
      renderPainelAuditoria('auditoriaContainer');
      // sobe para o topo
      const main = document.querySelector('#adminView .app-main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const auditoriaReload = $('auditoriaReloadBtn');
  if (auditoriaReload) auditoriaReload.onclick = () => renderPainelAuditoria('auditoriaContainer');

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
    const v = parseMoney(vc.value);
    const a = parseMoney(acu.value);
    const saldoEl = $('fSaldo'), pctEl = $('fPct');
    if (saldoEl) saldoEl.value = money(v - a);
    if (pctEl)   pctEl.value   = (v > 0 ? +(a / v * 100).toFixed(2) : 0) + '%';
  };
  if (vc)  vc.addEventListener('input', update);
  if (med) med.addEventListener('input', update);
  if (acu) acu.addEventListener('input', update);
}
