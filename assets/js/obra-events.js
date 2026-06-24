import { $, state, parseMoney, showToast, money } from './state.js';
import { saveObra, deleteObra, scheduleSave, currentObra } from './obra-service.js';
import { renderAll, applySelected, updateDashboard, setImportFileFn } from './render-obra.js';
import {
  importFile, importCronograma, importCronogramaMensal,
  importCronogramaPrevistoAditivo, importCronogramaMensalAditivo,
  addNovoAditivo, renomearAditivo, removerAditivo
} from './import-service.js';

/**
 * obra-events.js — bindings de eventos da obra ativa.
 * Extraído de events.js na Fase 6 da refatoração incremental.
 * Responsável por: seleção de obra, importação, edição inline da tabela,
 *   adição de item, exportação CSV/JSON, aditivos, cronograma.
 */

/** window globals de navegação entre obras */
function bindObraNav() {
  window._selecionarObra = (obraId) => {
    const obra = (state.obras || []).find(o => o.id === obraId);
    if (!obra) return;
    state.selectedObraId = obraId;
    applySelected(obra);
    renderAll();
  };
  window._atualizarObra   = () => { importFile(true); };
  window._removerObraAtiva = async () => {
    const obra = currentObra(); if (!obra) return;
    const nome = obra.nomeProjeto || obra.nome || 'esta obra';
    if (!confirm(`Remover "${nome}" permanentemente?`)) return;
    try {
      await deleteObra(obra.id);
      const restantes = (state.obras || []).filter(o => o.id !== obra.id);
      state.selectedObraId = restantes[0]?.id ?? null;
      if (state.selectedObraId) applySelected(restantes[0]);
      renderAll();
      showToast('\u2705 Obra removida.');
    } catch (err) { showToast('\u274C ' + err.message, true); }
  };
}

/** Botões de importação de arquivo e cronograma */
function bindImportButtons() {
  const loadFileBtn = $('loadFile');   if (loadFileBtn)  loadFileBtn.onclick  = () => importFile(false);
  const addObraBtn  = $('addObraBtn'); if (addObraBtn)   addObraBtn.onclick   = () => importFile(false);
  setImportFileFn(replace => importFile(replace));

  const loadCrono  = $('loadCronograma');        if (loadCrono)       loadCrono.onclick       = () => importCronograma();
  const loadMensal = $('loadCronogramaMensal');  if (loadMensal)      loadMensal.onclick      = () => importCronogramaMensal();
  const btnNovo    = $('btnNovoAditivo');         if (btnNovo)         btnNovo.onclick         = () => addNovoAditivo();
}

/** Delegação de eventos nos aditivos (previsto, mensal, remover, renomear) */
function bindAditivosBox() {
  const aditivosBox = $('aditivosBox'); if (!aditivosBox) return;
  aditivosBox.addEventListener('click', e => {
    const btn = e.target.closest('[data-aditivo-action]'); if (!btn) return;
    const action = btn.dataset.aditivoAction, id = btn.dataset.aditivoId;
    if (action === 'previsto') importCronogramaPrevistoAditivo(id);
    if (action === 'mensal')   importCronogramaMensalAditivo(id);
    if (action === 'remover')  removerAditivo(id);
  });
  aditivosBox.addEventListener('blur', async e => {
    const inp = e.target.closest('[data-aditivo-nome]'); if (!inp) return;
    await renomearAditivo(inp.dataset.aditivoNome, inp.value);
  }, true);
}

/** Exportação CSV e JSON */
function bindExport() {
  const exportCsv = $('exportCsv');
  if (exportCsv) exportCsv.onclick = () => {
    if (!state.rows.length) { showToast('Nenhum dado para exportar.', true); return; }
    const header = ['Item', 'Descri\u00e7\u00e3o', 'Valor Contrato', 'Medi\u00e7\u00e3o', 'Acumulado', 'Saldo', '% Exec.'];
    const rows   = state.rows.map(r => [r.item, r.descricao, r.valorContrato, r.medicao, r.acumulado, r.saldo, r.percentualExecutado]);
    const csv    = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = 'medicao.csv';
    a.click();
  };

  const saveJson = $('saveJson');
  if (saveJson) saveJson.onclick = () => {
    const o = currentObra() || {};
    const blob = new Blob([JSON.stringify({ ...o, itens: state.rows }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (o.nome || 'obra') + '.json';
    a.click();
  };
}

/** Limpar itens da obra atual */
function bindFillSample() {
  const fillSample = $('fillSample');
  if (fillSample) fillSample.onclick = async () => {
    if (!confirm('Limpar todos os itens da obra atual?')) return;
    state.rows = [];
    const o = currentObra(); if (o) { o.itens = []; await saveObra(o); }
    renderAll();
  };
}

/** Formulário de adição manual de item */
function bindAddRow() {
  const addRowBtn = $('addRow'); if (!addRowBtn) return;
  addRowBtn.onclick = () => {
    const vc  = parseMoney($('fValorContrato').value);
    const med = parseMoney($('fMedicao').value);
    const acu = parseMoney($('fAcumulado').value);
    const saldo = vc - acu;
    const p = vc > 0 ? +(acu / vc * 100).toFixed(2) : 0;
    state.rows.push({
      item: $('fItem').value.trim() || String(state.rows.length + 1),
      descricao: $('fName').value.trim(),
      valorContrato: vc, medicao: med, acumulado: acu, saldo, percentualExecutado: p
    });
    ['fItem', 'fName', 'fValorContrato', 'fMedicao', 'fAcumulado'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    scheduleSave(); renderAll();
  };
}

/** Edição inline da tabela de itens */
function bindTbody() {
  const tbody = $('tbody'); if (!tbody) return;
  tbody.addEventListener('blur', e => {
    const td = e.target.closest('[data-k]'); if (!td) return;
    const tr = td.closest('[data-i]');       if (!tr) return;
    const i = +tr.dataset.i, k = td.dataset.k;
    const raw = td.textContent.trim();
    const r = state.rows[i]; if (!r) return;
    if (['valorContrato', 'medicao', 'acumulado', 'saldo', 'percentualExecutado'].includes(k)) {
      r[k] = parseMoney(raw);
    } else { r[k] = raw; }
    if (k === 'valorContrato' || k === 'acumulado' || k === 'medicao') {
      const vc = Number(r.valorContrato) || 0, ac = Number(r.acumulado) || 0;
      r.saldo = vc - ac;
      r.percentualExecutado = vc > 0 ? +(ac / vc * 100).toFixed(2) : 0;
      renderAll();
    }
    scheduleSave();
  }, true);
  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('[data-del]'); if (!btn) return;
    state.rows.splice(+btn.dataset.del, 1);
    scheduleSave(); renderAll();
  });
}

/** Data de início do projeto */
function bindDataInicio() {
  const projDataInicio = $('projDataInicio'); if (!projDataInicio) return;
  projDataInicio.addEventListener('change', async () => {
    const o = currentObra(); if (!o) return;
    o.dataInicio = projDataInicio.value;
    await saveObra(o); updateDashboard();
  });
}

/** Ponto de entrada: registra todos os eventos de obra */
export function bindObraEvents() {
  bindObraNav();
  bindImportButtons();
  bindAditivosBox();
  bindExport();
  bindFillSample();
  bindAddRow();
  bindTbody();
  bindDataInicio();
}
