import { $, state, esc, showToast } from './state.js';
import { saveObra, deleteObra, currentObra } from './obra-service.js';
import { applySelected, renderAll, updateDashboard, registerObrasContext } from './obra-context.js';
import { limparObraIdDaUrl } from './url-state.js';
import { renderIndicadorAtualizacao } from './render-charts.js';

/**
 * render-obras.js — lista de obras, cronograma e aditivos na sidebar.
 *
 * NÃO importa de render-obra.js — usa obra-context.js para evitar ciclo circular.
 * Registra renderObrasBox no obra-context para que render-obra.js possa chamá-la
 * em renderAll() sem importar este arquivo diretamente.
 */

function fmtDate(str) {
  if (!str) return '-';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
}
function calcDataFim(dataInicio, totalMeses) {
  if (!dataInicio || !totalMeses) return null;
  const [ano, mes, dia] = dataInicio.split('-').map(Number);
  const mesBase0 = (mes - 1) + totalMeses;
  const fimAno = ano + Math.floor(mesBase0 / 12);
  const fimMes = (mesBase0 % 12) + 1;
  const ultimoDia = new Date(fimAno, fimMes, 0).getDate();
  return `${fimAno}-${String(fimMes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}
async function migrarAditivosSemId(o) {
  if (!Array.isArray(o.aditivos)) return false;
  let precisaSalvar = false;
  o.aditivos.forEach((ad, idx) => {
    if (!ad.id) {
      ad.id = 'aditivo_legado_' + idx + '_' + Date.now();
      if (!Array.isArray(ad.cronograma))         ad.cronograma         = ad.cronograma         ? [ad.cronograma] : [];
      if (!Array.isArray(ad.cronogramaExecucao)) ad.cronogramaExecucao = ad.cronogramaExecucao ? [ad.cronogramaExecucao] : [];
      precisaSalvar = true;
    }
  });
  if (precisaSalvar && state.user?.uid) await saveObra(o);
  return precisaSalvar;
}

let _importFileFn = () => {};
export function setImportFileFnObras(fn) { _importFileFn = fn; }

export function renderCronogramaBox() {
  const box = $('cronogramaBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const temCrono = Array.isArray(o.cronograma) && o.cronograma.length > 0;
  const totalMeses = temCrono ? o.cronograma.length : 0;
  const dataFimStr = (temCrono && o.dataInicio) ? fmtDate(calcDataFim(o.dataInicio, totalMeses)) : null;
  if (temCrono) {
    const nS = Array.isArray(o.cronogramaItens) ? o.cronogramaItens.length : 0;
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${totalMeses} meses</strong> importados${nS ? ` \u00b7 <strong style="color:var(--text)">${nS} servi\u00e7os</strong>` : ''}</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} T\u00e9rmino previsto: <strong>${dataFimStr}</strong></div>` : ''}
       <button id="removeCronogramaBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\u{1F5D1} Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma importado.</p>';
  }
  const rb = $('removeCronogramaBtn');
  if (rb) rb.onclick = async () => {
    if (!confirm('Remover o cronograma desta obra?')) return;
    delete o.cronograma; delete o.dataEmissao; delete o.cronogramaItens;
    await saveObra(o); renderCronogramaBox(); updateDashboard();
    showToast('\u2705 Cronograma removido.');
  };
}

export function renderCronogramaMensalBox() {
  const box = $('cronogramaMensalBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const tem = Array.isArray(o.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const temItens = Array.isArray(o.cronogramaItensExecucao) && o.cronogramaItensExecucao.length > 0;

  const ind = $('indicadorAtualizacaoMensal');
  if (ind) {
    if (tem) renderIndicadorAtualizacao('indicadorAtualizacaoMensal', o);
    else ind.innerHTML = '';
  }

  if (tem) {
    const emissaoTxt = o.dataEmissaoExecucao
      ? ` \u00b7 Emiss\u00e3o: <strong>${String(o.dataEmissaoExecucao.mes).padStart(2, '0')}/${o.dataEmissaoExecucao.ano}</strong>`
      : '';
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4C8} <strong style="color:var(--text)">${o.cronogramaExecucao.length} meses</strong> importados${emissaoTxt}</div>
       ${temItens ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${o.cronogramaItensExecucao.length} servi\u00e7os</strong> com execu\u00e7\u00e3o real m\u00eas a m\u00eas</div>` : ''}
       <button id="removeCronogramaMensalBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\u{1F5D1} Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma mensal importado.</p>';
  }
  const rb = $('removeCronogramaMensalBtn');
  if (rb) rb.onclick = async () => {
    if (!confirm('Remover o cronograma mensal desta obra?')) return;
    delete o.cronogramaExecucao; delete o.cronogramaItensExecucao; delete o.dataEmissaoExecucao;
    await saveObra(o); renderCronogramaMensalBox(); updateDashboard();
    showToast('\u2705 Cronograma mensal removido.');
  };
}

export function renderAditivosSection() {
  const box = $('aditivosBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = ''; return; }
  if (Array.isArray(o.aditivos) && o.aditivos.some(ad => !ad.id)) {
    migrarAditivosSemId(o).then(() => renderAditivosSection()); return;
  }
  const aditivos = Array.isArray(o.aditivos) ? o.aditivos : [];
  if (!aditivos.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.78rem;margin:.25rem 0">Nenhum aditivo criado.</p>'; return; }
  box.innerHTML = aditivos.map(ad => {
    const nP = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    const nM = Array.isArray(ad.cronogramaExecucao) ? ad.cronogramaExecucao.length : 0;
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:.65rem .75rem;margin-bottom:.6rem;background:var(--surface)">
      <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem">
        <input type="text" data-aditivo-nome="${ad.id}" value="${esc(ad.nome || 'Aditivo')}" style="flex:1;font-size:.82rem;font-weight:600;border:1px solid var(--border);border-radius:5px;padding:.25rem .4rem;background:var(--bg);color:var(--text)"/>
        <button data-aditivo-action="remover" data-aditivo-id="${ad.id}" class="btn btn-danger" style="padding:.25rem .45rem;font-size:.75rem">\u{1F5D1}</button>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        <button data-aditivo-action="previsto" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">${nP > 0 ? `\u2705 Previsto (${nP}m)` : '\u{1F4CA} Importar Previsto'}</button>
        <button data-aditivo-action="mensal"   data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">${nM > 0 ? `\u2705 Mensal (${nM}m)` : '\u{1F4C8} Importar Mensal'}</button>
      </div>
    </div>`;
  }).join('');
}

export function renderObrasBox() {
  const box = $('obrasBox'); if (!box) return;
  const obrasAtivas = (state.obras || []).filter(o => !o.deletedAt);
  if (!obrasAtivas.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhuma obra cadastrada.</p>';
    renderCronogramaBox(); renderCronogramaMensalBox(); renderAditivosSection();
    return;
  }
  box.innerHTML =
    `<div class="form-group" style="margin-bottom:.5rem"><label>Obra ativa</label>
     <select id="obraSelect" class="form-control">
       ${obrasAtivas.map(o => `<option value="${o.id}" ${o.id === state.selectedObraId ? 'selected' : ''}>${esc(o.nomeProjeto || o.nome || 'Obra')}</option>`).join('')}
     </select></div>
     <div style="display:flex;gap:.5rem;flex-wrap:wrap">
       <button class="btn btn-sec" id="replaceObraBtn" style="flex:1">\u{1F504} Atualizar</button>
       <button class="btn btn-danger" id="deleteObraBtn" style="flex:1">\u{1F5D1} Remover</button>
     </div>`;
  $('obraSelect').onchange = e => {
    state.selectedObraId = e.target.value;
    const o = currentObra(); if (o) { applySelected(o); renderAll(); }
  };
  $('replaceObraBtn').onclick = () => _importFileFn(true);
  $('deleteObraBtn').onclick = async () => {
    const id = state.selectedObraId;
    const nome = currentObra()?.nomeProjeto || currentObra()?.nome || 'esta obra';
    if (!id || !confirm(`Remover "${nome}"? Esta a\u00e7\u00e3o pode ser desfeita pelo administrador.`)) return;
    await deleteObra(id);
    const restantes = obrasAtivas.filter(o => o.id !== id);
    state.selectedObraId = restantes.length ? restantes[0].id : null;
    if (state.selectedObraId) {
      const prox = state.obras.find(x => x.id === state.selectedObraId);
      if (prox) applySelected(prox);
    } else {
      state.rows = [];
      ['projName', 'projContratada', 'projScope'].forEach(k => { const el = $(k); if (el) el.value = ''; });
      limparObraIdDaUrl();
    }
    renderAll();
    showToast(`"${nome}" removida.`);
  };
  renderCronogramaBox(); renderCronogramaMensalBox(); renderAditivosSection();
}

// Registra renderObrasBox no obra-context para render-obra.js usar via renderAll()
registerObrasContext({ renderObrasBox });

export function renderSeletorObras() { renderObrasBox(); }
export function migrarAditivosSemIdExport(obra) { return migrarAditivosSemId(obra); }
