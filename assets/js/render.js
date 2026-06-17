import { $, state, esc, money, pct, calcPctGeral, showToast } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { setObraIdNaUrl, limparObraIdDaUrl } from './url-state.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo } from './render-charts.js';
import { renderCurvasPorServico } from './render-servicos.js';
import { renderAdminStats, renderAdminSidebar, renderColabList, renderAdminDetail, renderAdminViews, adminObraCardHTML } from './render-admin.js';

export { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo, renderAdminStats, renderAdminSidebar, renderColabList, renderAdminDetail, renderAdminViews, adminObraCardHTML, renderCurvasPorServico };

export async function saveObra(obra) {
  if (!state.user?.uid) return;
  await setDoc(doc(db, 'users', state.user.uid, 'obras', obra.id), obra);
}

export async function deleteObra(id) {
  if (!state.user?.uid) return;
  const obraRef  = doc(db, 'users', state.user.uid, 'obras', id);
  const snapshot = state.obras.find(o => o.id === id) ?? null;
  await updateDoc(obraRef, { deletedAt: serverTimestamp() });
  await registrarEvento({ uid: state.user.uid, entidade: 'obras', docId: id, acao: 'OBRA_REMOVIDA', snapshotAntes: snapshot });
}

export function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const o = currentObra();
    if (o) { o.itens = state.rows; await saveObra(o); }
  }, 1200);
}

export function currentObra() {
  return state.obras.find(o => o.id === state.selectedObraId);
}

function fmtDate(str) {
  if (!str) return '-';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
}
function calcDataFim(dataInicio, totalMeses) {
  if (!dataInicio || !totalMeses) return null;
  const [ano, mes, dia] = dataInicio.split('-').map(Number);
  const mesBase0  = (mes - 1) + totalMeses;
  const fimAno    = ano + Math.floor(mesBase0 / 12);
  const fimMes    = (mesBase0 % 12) + 1;
  const ultimoDia = new Date(fimAno, fimMes, 0).getDate();
  return `${fimAno}-${String(fimMes).padStart(2,'0')}-${String(Math.min(dia, ultimoDia)).padStart(2,'0')}`;
}
function calcDataInicioProximo(dataInicio, totalMeses) {
  if (!dataInicio || !totalMeses) return dataInicio || null;
  const [ano, mes] = dataInicio.split('-').map(Number);
  const base0   = (mes - 1) + totalMeses;
  const novoAno = ano + Math.floor(base0 / 12);
  const novoMes = (base0 % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2,'0')}-01`;
}

async function migrarAditivosSemId(o) {
  if (!Array.isArray(o.aditivos)) return false;
  let precisaSalvar = false;
  o.aditivos.forEach((ad, idx) => {
    if (!ad.id) {
      ad.id = 'aditivo_legado_' + idx + '_' + Date.now();
      if (!Array.isArray(ad.cronograma))         ad.cronograma         = ad.cronograma         ? [ad.cronograma]         : [];
      if (!Array.isArray(ad.cronogramaExecucao)) ad.cronogramaExecucao = ad.cronogramaExecucao ? [ad.cronogramaExecucao] : [];
      precisaSalvar = true;
    }
  });
  if (precisaSalvar && state.user?.uid) await saveObra(o);
  return precisaSalvar;
}

export function applySelected(o) {
  state.rows = Array.isArray(o.itens) ? o.itens : [];
  const pn = $('projName');       if (pn) pn.value = o.nomeProjeto || o.nome || 'Nova obra';
  const pc = $('projContratada'); if (pc) pc.value = o.contratada || '';
  const ps = $('projScope');      if (ps) ps.value = o.medicaoAtual || '';
  const di = $('projDataInicio'); if (di) di.value = o.dataInicio || '';
  setObraIdNaUrl(o.id);
}

export function renderTable() {
  const tbody = $('tbody'); if (!tbody) return;
  tbody.innerHTML = state.rows.map((r, i) => {
    const p = Number(r.percentualExecutado || 0);
    const pctColor = p >= 99.95 ? 'color:var(--success);font-weight:700' : 'font-weight:700';
    return `<tr data-i="${i}">
      <td contenteditable="true" data-k="item">${esc(r.item)}</td>
      <td contenteditable="true" data-k="descricao" class="td-desc">${esc(r.descricao)}</td>
      <td contenteditable="true" data-k="valorContrato" style="text-align:right">${money(r.valorContrato)}</td>
      <td contenteditable="true" data-k="medicao" style="text-align:right">${money(r.medicao)}</td>
      <td contenteditable="true" data-k="acumulado" style="text-align:right">${money(r.acumulado)}</td>
      <td contenteditable="true" data-k="saldo" style="text-align:right">${money(r.saldo)}</td>
      <td contenteditable="true" data-k="percentualExecutado" style="text-align:right;${pctColor}">${p.toFixed(2)}</td>
      <td style="text-align:right"><button data-del="${i}" class="btn btn-danger" style="padding:.4rem;border-radius:6px">\u{1F5D1}</button></td>
    </tr>`;
  }).join('');
}

export function renderCronogramaBox() {
  const box = $('cronogramaBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const temCrono   = Array.isArray(o.cronograma) && o.cronograma.length > 0;
  const totalMeses = temCrono ? o.cronograma.length : 0;
  const dataFimStr = (temCrono && o.dataInicio) ? fmtDate(calcDataFim(o.dataInicio, totalMeses)) : null;
  if (temCrono) {
    const nServicos = Array.isArray(o.cronogramaItens) ? o.cronogramaItens.length : 0;
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${totalMeses} meses</strong> importados${nServicos ? ` \u00b7 <strong style="color:var(--text)">${nServicos} servi\u00e7os</strong>` : ''}</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} T\u00e9rmino previsto: <strong>${dataFimStr}</strong></div>` : ''}
       <button id="removeCronogramaBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\u{1F5D1} Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma importado.</p>';
  }
  const removeBtn = $('removeCronogramaBtn');
  if (removeBtn) removeBtn.onclick = async () => {
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
  const tem      = Array.isArray(o.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const temItens = Array.isArray(o.cronogramaItensExecucao) && o.cronogramaItensExecucao.length > 0;
  if (tem) {
    const emissaoTxt = o.dataEmissaoExecucao
      ? ` \u00b7 Emiss\u00e3o: <strong>${String(o.dataEmissaoExecucao.mes).padStart(2,'0')}/${o.dataEmissaoExecucao.ano}</strong>`
      : '';
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4C8} <strong style="color:var(--text)">${o.cronogramaExecucao.length} meses</strong> importados${emissaoTxt}</div>
       ${temItens ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${o.cronogramaItensExecucao.length} servi\u00e7os</strong> com execu\u00e7\u00e3o real m\u00eas a m\u00eas</div>` : ''}
       <button id="removeCronogramaMensalBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\u{1F5D1} Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma mensal importado.</p>';
  }
  const removeBtn = $('removeCronogramaMensalBtn');
  if (removeBtn) removeBtn.onclick = async () => {
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
  const precisaMigrar = Array.isArray(o.aditivos) && o.aditivos.some(ad => !ad.id);
  if (precisaMigrar) { migrarAditivosSemId(o).then(() => renderAditivosSection()); return; }
  const aditivos = Array.isArray(o.aditivos) ? o.aditivos : [];
  if (!aditivos.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.78rem;margin:.25rem 0">Nenhum aditivo criado.</p>'; return; }
  box.innerHTML = aditivos.map(ad => {
    const nP = Array.isArray(ad.cronograma)         ? ad.cronograma.length         : 0;
    const nM = Array.isArray(ad.cronogramaExecucao) ? ad.cronogramaExecucao.length : 0;
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:.65rem .75rem;margin-bottom:.6rem;background:var(--surface)">
        <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem">
          <input type="text" data-aditivo-nome="${ad.id}" value="${esc(ad.nome || 'Aditivo')}" style="flex:1;font-size:.82rem;font-weight:600;border:1px solid var(--border);border-radius:5px;padding:.25rem .4rem;background:var(--bg);color:var(--text)"/>
          <button data-aditivo-action="remover" data-aditivo-id="${ad.id}" class="btn btn-danger" style="padding:.25rem .45rem;font-size:.75rem">\u{1F5D1}</button>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button data-aditivo-action="previsto" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${nP > 0 ? `\u2705 Previsto (${nP}m)` : '\u{1F4CA} Importar Previsto'}
          </button>
          <button data-aditivo-action="mensal" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${nM > 0 ? `\u2705 Mensal (${nM}m)` : '\u{1F4C8} Importar Mensal'}
          </button>
        </div>
      </div>`;
  }).join('');
}

export function renderAditivosCurvas() {
  const container = $('aditivosCurvasContainer'); if (!container) return;
  const o = currentObra();
  if (!o) { container.innerHTML = ''; return; }
  const aditivos = Array.isArray(o.aditivos) ? o.aditivos : [];
  const nContrato = Array.isArray(o.cronograma) ? o.cronograma.length : 0;
  let dataInicioBase = calcDataInicioProximo(o.dataInicio, nContrato);
  if (!state._aditivoCharts) state._aditivoCharts = {};
  Object.values(state._aditivoCharts).forEach(c => { try { c.destroy(); } catch(_){} });
  state._aditivoCharts = {};
  container.innerHTML = '';
  aditivos.forEach((ad, idx) => {
    const nPrev = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    const dataInicioAd = dataInicioBase;
    dataInicioBase = calcDataInicioProximo(dataInicioBase, nPrev) || dataInicioBase;
    if (!nPrev && !(Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length)) return;
    const canvasId  = `curvaS_aditivo_${ad.id}`;
    const wrapId    = `curvaS_aditivo_wrap_${ad.id}`;
    const dataFimStr = (nPrev && dataInicioAd) ? fmtDate(calcDataFim(dataInicioAd, nPrev)) : null;
    const panel = document.createElement('div');
    panel.className = 'panel'; panel.style.marginBottom = '1.5rem';
    panel.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="font-size:.95rem;font-weight:700;margin:0">Curva S \u2014 ${esc(ad.nome || 'Aditivo')}</h3>
        ${dataFimStr ? `<span style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} T\u00e9rmino: <strong>${dataFimStr}</strong></span>` : ''}
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}"><div class="chart-container"><canvas id="${canvasId}"></canvas></div></div>`;
    container.appendChild(panel);
    requestAnimationFrame(() => {
      state._aditivoCharts[ad.id] = renderCurvaS2Aditivo(canvasId, wrapId, ad, dataInicioAd, state._aditivoCharts[ad.id] || null);
    });
  });
}

export function renderObrasBox() {
  const box = $('obrasBox'); if (!box) return;
  const obrasAtivas = state.obras.filter(o => !o.deletedAt);
  if (!obrasAtivas.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhuma obra cadastrada.</p>';
    renderCronogramaBox(); renderCronogramaMensalBox(); renderAditivosSection();
    return;
  }
  box.innerHTML =
    `<div class="form-group" style="margin-bottom:.5rem"><label>Obra ativa</label>
     <select id="obraSelect" class="form-control">
       ${obrasAtivas.map(o => `<option value="${o.id}" ${o.id === state.selectedObraId ? 'selected' : ''}>${esc(o.nome || 'Obra')}</option>`).join('')}
     </select></div>
     <div style="display:flex;gap:.5rem;flex-wrap:wrap">
       <button class="btn btn-sec" id="replaceObraBtn" style="flex:1">\u{1F504} Atualizar</button>
       <button class="btn btn-danger" id="deleteObraBtn" style="flex:1">\u{1F5D1} Remover</button>
     </div>`;
  $('obraSelect').onchange = e => {
    state.selectedObraId = e.target.value;
    const o = currentObra(); if (o) { applySelected(o); renderAll(); }
  };
  $('replaceObraBtn').onclick = () => importFileFn(true);
  $('deleteObraBtn').onclick  = async () => {
    const idToDelete = state.selectedObraId;
    const obraNome   = currentObra()?.nome || 'esta obra';
    if (!idToDelete || !confirm(`Remover "${obraNome}"? Esta a\u00e7\u00e3o pode ser desfeita pelo administrador.`)) return;
    await deleteObra(idToDelete);
    const restantes = obrasAtivas.filter(o => o.id !== idToDelete);
    state.selectedObraId = restantes.length ? restantes[0].id : null;
    if (state.selectedObraId) { const proxima = state.obras.find(x => x.id === state.selectedObraId); if (proxima) applySelected(proxima); }
    else { state.rows = []; ['projName','projContratada','projScope'].forEach(id => { const el = $(id); if (el) el.value = ''; }); limparObraIdDaUrl(); }
    renderAll(); showToast(`"${obraNome}" removida.`);
  };
  renderCronogramaBox(); renderCronogramaMensalBox(); renderAditivosSection();
}

export function updateDashboard() {
  const o     = currentObra();
  const itens = Array.isArray(o?.itens) && o.itens.length > 0 ? o.itens : state.rows;
  const vc      = Number(o?.resumo?.valorContratoAditivo) || itens.reduce((a,r)=>a+Number(r.valorContrato||0),0);
  const ac      = Number(o?.resumo?.acumuladoTotal)       || itens.reduce((a,r)=>a+Number(r.acumulado||0),0);
  const estaMed = Number(o?.resumo?.estaMedicao)          || itens.reduce((a,r)=>a+Number(r.medicao||0),0);
  const p       = calcPctGeral(o?.resumo, itens);
  const LS = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS = 'font-size:.95rem;font-weight:700;margin-top:.2rem';
  if ($('stats')) $('stats').innerHTML =
    `<div class="stat-card"><span class="stat-label" style="${LS}">Esta Medi\u00e7\u00e3o</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>`;
  if ($('countAll'))  $('countAll').textContent  = money(vc);
  if ($('countDone')) $('countDone').textContent = money(ac);
  if ($('countPct'))  $('countPct').textContent  = pct(p);
  if ($('mainProjName'))       $('mainProjName').textContent       = o?.nomeProjeto || o?.nome || '-';
  if ($('mainProjContratada')) $('mainProjContratada').textContent = o?.contratada || '-';
  if ($('mainProjScope'))      $('mainProjScope').textContent      = o?.medicaoAtual || '-';
  state.chartUser = renderCurvaS1('sCurveChart', 'sCurveScrollWrap', itens, state.chartUser);
  const temCrono  = Array.isArray(o?.cronograma)         && o.cronograma.length         > 0;
  const temMensal = Array.isArray(o?.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const panelS2   = $('sCurveAditivoPanel');
  if (temCrono && temMensal) {
    if (panelS2) panelS2.style.display = '';
    requestAnimationFrame(() => { state.chartUser2 = renderCurvaS2('sCurveAditivoChart', 'sCurveAditivoScrollWrap', o, state.chartUser2); });
  } else {
    if (panelS2) panelS2.style.display = 'none';
    if (state.chartUser2) { try { state.chartUser2.destroy(); } catch(_){} state.chartUser2 = null; }
  }
  renderAditivosCurvas();
  renderCurvasPorServico('curvasPorServicoContainer', o, 'colab');
  const cronoStatus = $('cronoStatus');
  if (cronoStatus) {
    if (temCrono && o?.dataInicio) {
      const nMeses  = o.cronograma.length;
      const dataFim = calcDataFim(o.dataInicio, nMeses);
      const diasRestantes = dataFim ? Math.ceil((new Date(dataFim + 'T00:00:00') - new Date()) / 86400000) : null;
      if (diasRestantes !== null) {
        const cor = diasRestantes < 0 ? 'var(--danger)' : diasRestantes < 30 ? '#f59e0b' : 'var(--success)';
        const txt = diasRestantes < 0 ? `\u26a0\ufe0f Prazo vencido h\u00e1 ${Math.abs(diasRestantes)} dias` : diasRestantes === 0 ? '\u{1F3C1} T\u00e9rmino hoje' : `\u{1F5D3}\uFE0F ${diasRestantes} dias restantes`;
        cronoStatus.innerHTML = `<span style="color:${cor};font-weight:600">${txt}</span>`;
      } else { cronoStatus.innerHTML = ''; }
    } else { cronoStatus.innerHTML = ''; }
  }
}

export function renderAll() { renderObrasBox(); renderTable(); updateDashboard(); }
let importFileFn = () => {};
export function setImportFileFn(fn) { importFileFn = fn; }
