import { $, state, esc, money, pct, calcPctGeral } from './state.js';
import { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo } from './render-charts.js';
import { renderCurvasPorServico } from './render-servicos.js';

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

/**
 * Cópia EXATA de _buildFontesServico de render-obra.js.
 * Retorna array de fontes (contrato + aditivos) para renderCurvasPorServico.
 */
function _buildFontesServico(o) {
  const fontes = [];
  const aditivos   = Array.isArray(o?.aditivos)       ? o.aditivos       : [];
  const nContrato  = Array.isArray(o?.cronograma)     ? o.cronograma.length : 0;
  const itensCronoContrato = Array.isArray(o?.cronogramaItens) ? o.cronogramaItens : [];
  if (itensCronoContrato.length && nContrato && o?.dataInicio) {
    fontes.push({
      label:             '\u{1F4CB} Contrato inicial',
      itensCrono:        itensCronoContrato,
      itensExecMensal:   Array.isArray(o?.cronogramaItensExecucao) ? o.cronogramaItensExecucao : [],
      itensExecucao:     Array.isArray(o?.itens) ? o.itens : [],
      totalMeses:        nContrato,
      dataInicio:        o.dataInicio,
      dataEmissaoRef:    o?.dataEmissaoExecucao || o?.dataEmissao || null,
      historicoExecucao: Array.isArray(o?.historicoExecucao) ? o.historicoExecucao : []
    });
  }
  let dataInicioBase = calcDataInicioProximo(o?.dataInicio, nContrato);
  aditivos.forEach((ad, adIdx) => {
    const dataInicioAd = dataInicioBase;
    const totalMesesAd = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    dataInicioBase = calcDataInicioProximo(dataInicioBase, totalMesesAd) || dataInicioBase;
    const itensCronoAd = Array.isArray(ad?.cronogramaItens) ? ad.cronogramaItens : [];
    if (!itensCronoAd.length || !totalMesesAd || !dataInicioAd) return;
    fontes.push({
      label:             `\u{1F4C4} ${esc(ad.nome || `Aditivo ${adIdx + 1}`)}`,
      itensCrono:        itensCronoAd,
      itensExecMensal:   Array.isArray(ad?.cronogramaItensExecucao) ? ad.cronogramaItensExecucao : [],
      itensExecucao:     Array.isArray(o?.itens) ? o.itens : [],
      totalMeses:        totalMesesAd,
      dataInicio:        dataInicioAd,
      dataEmissaoRef:    ad?.dataEmissaoExecucao || ad?.dataEmissao || null,
      historicoExecucao: Array.isArray(ad?.historicoExecucao) ? ad.historicoExecucao : []
    });
  });
  return fontes;
}

/**
 * Renderiza o painel Curvas S por Serviço no admin.
 * Cópia EXATA de renderCurvasPorServicoPanel de render-obra.js,
 * adaptada para os IDs do painel admin.
 */
function _renderCurvasPorServicoPanelAdmin(obra, prefix) {
  const painel    = $('adminCurvasPorServicoPanel');
  const badge     = $('adminCurvasPorServicoBadge');
  const container = $('adminCurvasPorServicoContainer');
  if (!painel || !container) return;

  const fontes = _buildFontesServico(obra);
  if (!fontes.length) { painel.style.display = 'none'; return; }
  painel.style.display = '';

  const totalServicos = fontes[0].itensCrono.length;
  const temMensal     = fontes.some(f => f.itensExecMensal.length > 0);
  if (badge) badge.textContent =
    `${totalServicos} servi\u00e7os` +
    (temMensal     ? ' \u2022 Real m\u00eas a m\u00eas'         : '') +
    (fontes.length > 1 ? ` \u2022 ${fontes.length - 1} aditivo(s)` : '');

  // Seletor de fonte (Contrato / Aditivos)
  let seletorEl = $(`${prefix}_fonte_seletor`);
  if (!seletorEl) {
    seletorEl = document.createElement('div');
    seletorEl.id = `${prefix}_fonte_seletor`;
    seletorEl.style.cssText = 'display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem';
    container.parentElement.insertBefore(seletorEl, container);
  }
  if (fontes.length > 1) {
    seletorEl.style.display = 'flex';
    seletorEl.innerHTML = fontes.map((f, i) => {
      const ativo = i === (state[`${prefix}_fonteAtiva`] ?? 0);
      return `<button
        data-fonte-idx="${i}"
        style="padding:.35rem .85rem;border-radius:999px;border:1px solid ${ativo ? 'var(--primary,#6366f1)' : 'var(--border,#e2e8f0)'};font-size:.75rem;font-weight:600;cursor:pointer;background:${ativo ? 'var(--primary,#6366f1)' : 'transparent'};color:${ativo ? '#fff' : 'var(--text-muted,#64748b)'};transition:all .15s"
        onclick="window._adminTrocarFonteServico && window._adminTrocarFonteServico(${i})"
      >${f.label}</button>`;
    }).join('');
  } else {
    seletorEl.style.display = 'none';
  }

  window._adminTrocarFonteServico = (idx) => {
    state[`${prefix}_fonteAtiva`] = idx;
    const sel = $(`${prefix}_fonte_seletor`);
    if (sel) sel.querySelectorAll('[data-fonte-idx]').forEach(btn => {
      const ativo = Number(btn.dataset.fonteIdx) === idx;
      btn.style.background  = ativo ? 'var(--primary,#6366f1)' : 'transparent';
      btn.style.color       = ativo ? '#fff' : 'var(--text-muted,#64748b)';
      btn.style.borderColor = ativo ? 'var(--primary,#6366f1)' : 'var(--border,#e2e8f0)';
    });
    renderCurvasPorServico('adminCurvasPorServicoContainer', fontes[idx], `${prefix}_f${idx}`);
  };

  const savedIdx = state[`${prefix}_fonteAtiva`] ?? 0;
  const idxAtivo = savedIdx < fontes.length ? savedIdx : 0;
  state[`${prefix}_fonteAtiva`] = idxAtivo;
  renderCurvasPorServico('adminCurvasPorServicoContainer', fontes[idxAtivo], `${prefix}_f${idxAtivo}`);
}

export function renderAdminStats() {
  let tot=0, tvc=0, tac=0;
  Object.values(state.allUsers).forEach(u => {
    if (u.role === 'admin') return;
    (u.obras || []).filter(o => !o.deletedAt).forEach(o => {
      tot++;
      const it = Array.isArray(o.itens) ? o.itens : [];
      tvc += Number(o.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
      tac += Number(o.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
    });
  });
  const p  = tvc > 0 ? +(tac/tvc*100).toFixed(2) : 0;
  const LS = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS = 'font-size:.95rem;font-weight:700;margin-top:.2rem';
  if ($('adminStats')) $('adminStats').innerHTML =
    `<div class="stat-card"><span class="stat-label" style="${LS}">Total de Obras</span><span class="stat-value" style="${VS}">${tot}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Soma dos Contratos</span><span class="stat-value" style="${VS}">${money(tvc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Geral</span><span class="stat-value" style="${VS}">${money(tac)}</span></div>`;
}

function _colabSidebarHTML(colabs) {
  if (!colabs.length) return '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem">Nenhum colaborador.</p>';
  if (state.adminSelectedUid && state.allUsers[state.adminSelectedUid]) {
    const u = state.allUsers[state.adminSelectedUid];
    const n = (u.obras || []).filter(o => !o.deletedAt).length;
    return `<button class="btn btn-sec" onclick="adminDeselectColab()" style="width:100%;margin-bottom:.75rem;font-size:.8rem">\u2190 Todos</button>
       <div class="colab-sidebar-item active">
         <div style="font-weight:600;font-size:.875rem">${u.blocked ? '\u{1F512} ' : ''}${esc(u.nome)}</div>
         <div style="font-size:.75rem;color:var(--text-muted)">${n} obra${n !== 1 ? 's' : ''}</div>
       </div>`;
  }
  return colabs.map(([uid, u]) => {
    const n = (u.obras || []).filter(o => !o.deletedAt).length;
    return `<div class="colab-sidebar-item" style="${u.blocked ? 'opacity:.55' : ''}" onclick="adminSelectColab('${uid}')">
       <div style="font-weight:600;font-size:.875rem">${u.blocked ? '\u{1F512} ' : ''}${esc(u.nome)}</div>
       <div style="font-size:.75rem;color:var(--text-muted)">${n} obra${n !== 1 ? 's' : ''}</div>
     </div>`;
  }).join('');
}

export function renderAdminSidebar() {
  const colabs = Object.entries(state.allUsers).filter(([,u]) => u.role !== 'admin');
  const html   = _colabSidebarHTML(colabs);
  const box    = $('adminColabSidebar');       if (box) box.innerHTML = html;
  const mob    = $('adminColabSidebarMobile'); if (mob) mob.innerHTML = html;
}

export function renderColabList() {
  const box = $('colabList'); if (!box) return;
  const colabs = Object.entries(state.allUsers).filter(([,u]) => u.role !== 'admin');
  if (!colabs.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">Nenhum colaborador.</p>'; return; }
  box.innerHTML = colabs.map(([uid, u]) =>
    `<div class="colab-item" style="${u.blocked ? 'opacity:.7' : ''}">
       <div><strong>${esc(u.nome)}</strong>
         ${u.blocked ? '<span style="margin-left:.5rem;font-size:.7rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.1rem .4rem;border-radius:999px">\u{1F512} Bloqueado</span>' : ''}
         <br><small style="color:var(--text-muted)">${esc(u.email)}</small></div>
       <div style="display:flex;gap:.4rem;flex-wrap:wrap">
         <button class="btn ${u.blocked ? 'btn-success' : 'btn-warning'}" style="padding:.3rem .65rem;font-size:.72rem" onclick="toggleBloqueio('${uid}',${u.blocked})">${u.blocked ? '\u2705 Desbloquear' : '\u{1F512} Bloquear'}</button>
         <button class="btn btn-danger" style="padding:.3rem .65rem;font-size:.72rem" onclick="removeColab('${uid}')">Remover</button>
       </div>
     </div>`).join('');
}

export function adminObraCardHTML(obra) {
  if (obra.deletedAt) return '';
  const it  = Array.isArray(obra.itens) ? obra.itens : [];
  const vc  = Number(obra.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac  = Number(obra.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const p   = calcPctGeral(obra.resumo, it);
  const nAd = Array.isArray(obra.aditivos) ? obra.aditivos.length : 0;
  const temCrono  = Array.isArray(obra.cronograma)         && obra.cronograma.length         > 0;
  const temMensal = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  return `<div class="obra-card" style="cursor:pointer" onclick="adminSelectObra('${obra.id}')">
    <div class="obra-card-header">
      <div><div class="obra-card-title">${esc(obra.nome || 'Sem nome')}</div>
      <div class="obra-card-sub">${it.length} itens | Aba: ${esc(obra.medicaoAtual || '-')}${temCrono ? ' | \u{1F4C5} Cronograma' : ''}${temMensal ? ' | \u{1F4C8} Mensal' : ''}${nAd > 0 ? ` | \u{1F4CB} ${nAd} aditivo${nAd>1?'s':''}` : ''}</div></div>
      <div class="obra-card-pct">${pct(p)}</div></div>
    <div class="obra-progress-bar"><div class="obra-progress-fill" style="width:${Math.min(100,p)}%"></div></div>
    <div class="obra-card-footer">
      <span>CT/Aditivo: ${money(vc)}</span><span>Acumulado: ${money(ac)}</span><span>Saldo: ${money(vc-ac)}</span>
    </div></div>`;
}

export function renderAdminDetail() {
  const panel = $('adminDetailPanel'); if (!panel) return;
  if (state.chartAdmin2) { try { state.chartAdmin2.destroy(); } catch(_){} state.chartAdmin2 = null; }
  if (!state.adminSelectedUid) { panel.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Selecione um colaborador ao lado.</p>'; return; }
  const u = state.allUsers[state.adminSelectedUid];
  if (!u) { panel.innerHTML = ''; return; }
  const obrasList = (u.obras || []).filter(o => !o.deletedAt);

  let html = `<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
    <div style="font-weight:700;font-size:1.1rem">\u{1F464} ${esc(u.nome)}${u.blocked ? ' <span style="font-size:.75rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.2rem .6rem;border-radius:999px">\u{1F512}</span>' : ''}</div>
    <div class="form-group" style="margin:0;min-width:220px">
      <select id="adminObraSelect" class="form-control" onchange="adminSelectObra(this.value)">
        <option value="">-- Selecione uma obra --</option>
        ${obrasList.map(o => `<option value="${o.id}" ${o.id === state.adminSelectedObraId ? 'selected' : ''}>${esc(o.nome || 'Obra')}</option>`).join('')}
      </select></div></div>`;

  if (!state.adminSelectedObraId || !obrasList.length) {
    panel.innerHTML = html + (obrasList.length ? obrasList.map(adminObraCardHTML).join('') : '<p style="color:var(--text-muted)">Sem obras.</p>');
    return;
  }
  const obra = obrasList.find(o => o.id === state.adminSelectedObraId);
  if (!obra) { panel.innerHTML = html + '<p style="color:var(--text-muted)">Obra n\u00e3o encontrada.</p>'; return; }

  const it          = Array.isArray(obra.itens) ? obra.itens : [];
  const vc          = Number(obra.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac          = Number(obra.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const estaMed     = Number(obra.resumo?.estaMedicao)          || it.reduce((a,i)=>a+Number(i.medicao||0),0);
  const p           = calcPctGeral(obra.resumo, it);
  const totalMeses  = Array.isArray(obra.cronograma) ? obra.cronograma.length : 0;
  const dataFimISO  = calcDataFim(obra.dataInicio, totalMeses);
  const temMensal   = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const temCrono    = Array.isArray(obra.cronograma)         && obra.cronograma.length         > 0;
  const aditivos    = Array.isArray(obra.aditivos) ? obra.aditivos : [];
  const LS   = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS   = 'font-size:.95rem;font-weight:700;margin-top:.15rem';
  const VSSM = 'font-size:.82rem;font-weight:700;margin-top:.15rem;word-break:break-word';

  // Pré-calcula fontes para saber se exibe o painel
  const fontesServico = _buildFontesServico(obra);
  const temServico    = fontesServico.length > 0;
  const nServicos     = temServico ? fontesServico[0].itensCrono.length : 0;
  const temMensalS    = fontesServico.some(f => f.itensExecMensal.length > 0);

  const curvasPorServicoHTML = temServico ? `
    <div class="panel" style="margin-bottom:1.5rem" id="adminCurvasPorServicoPanel">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="margin:0;font-size:.95rem;font-weight:700">&#128200; Curvas S por Servi&#231;o</h3>
        <span id="adminCurvasPorServicoBadge" style="font-size:.72rem;font-weight:600;padding:.2rem .6rem;border-radius:999px;background:rgba(99,102,241,.12);color:#6366f1">
          ${nServicos} servi&#231;o${nServicos !== 1 ? 's' : ''}${temMensalS ? ' \u2022 Real m\u00eas a m\u00eas' : ''}${fontesServico.length > 1 ? ` \u2022 ${fontesServico.length - 1} aditivo(s)` : ''}
        </span>
      </div>
      <div id="adminCurvasPorServicoContainer"></div>
    </div>` : '';

  let dataInicioBase = calcDataInicioProximo(obra.dataInicio, totalMeses);
  const aditivosHTML = aditivos.filter(ad =>
    (Array.isArray(ad.cronograma) && ad.cronograma.length > 0) ||
    (Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length > 0)
  ).map(ad => {
    const nP = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    const di = dataInicioBase;
    dataInicioBase = calcDataInicioProximo(dataInicioBase, nP) || dataInicioBase;
    const dataFimAd = (nP && di) ? fmtDate(calcDataFim(di, nP)) : null;
    return `<div class="panel" style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="font-size:.95rem;font-weight:700;margin:0">Curva S \u2014 ${esc(ad.nome || 'Aditivo')}</h3>
        ${dataFimAd ? `<span style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} T\u00e9rmino: <strong>${dataFimAd}</strong></span>` : ''}
      </div>
      <div class="chart-scroll-wrap" id="adminCurvaS_wrap_${ad.id}"><div class="chart-container"><canvas id="adminCurvaS_ad_${ad.id}"></canvas></div></div>
    </div>`;
  }).join('');

  html +=
    `<div class="admin-stats-grid">
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Contratada</span><span class="stat-value" style="${VSSM}">${esc(obra.contratada||'-')}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Esta Medi\u00e7\u00e3o</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\u{1F4C5} In\u00edcio</span><span class="stat-value" style="${VS}">${fmtDate(obra.dataInicio)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\u{1F3C1} T\u00e9rmino</span><span class="stat-value" style="${VS}">${dataFimISO ? fmtDate(dataFimISO) : '-'}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Saldo</span><span class="stat-value" style="${VS}">${money(vc-ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     </div>
     <div class="panel" style="margin-bottom:1.5rem">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 \u00cdndice de Itens</h3>
       <div class="chart-scroll-wrap" id="adminCurvaSwrap"><div class="chart-container"><canvas id="adminCurvaS"></canvas></div></div>
     </div>
     ${temCrono && temMensal ? `<div class="panel" style="margin-bottom:1.5rem"><h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 Cronograma F\u00edsico-Financeiro (Contrato)</h3><div class="chart-scroll-wrap" id="adminCurvaSAditivoWrap"><div class="chart-container"><canvas id="adminCurvaSAditivo"></canvas></div></div></div>` : ''}
     ${aditivosHTML}
     ${curvasPorServicoHTML}
     <div class="panel">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">\u00cdndice de Itens</h3>
       <div class="table-container"><table class="admin-table">
         <thead><tr>
           <th class="th-sticky" data-label="ITEM"></th><th class="th-sticky" data-label="DESCRI\u00c7\u00c3O"></th>
           <th class="th-sticky" style="text-align:right" data-label="VALOR CT"></th><th class="th-sticky" style="text-align:right" data-label="MED"></th>
           <th class="th-sticky" style="text-align:right" data-label="ACUMUL"></th><th class="th-sticky" style="text-align:right" data-label="SALDO"></th>
           <th class="th-sticky" style="text-align:right" data-label="%"></th>
         </tr></thead>
         <tbody>${it.map(r => {
           const rp = Number(r.percentualExecutado || 0);
           return `<tr><td style="font-size:.82rem">${esc(r.item)}</td><td class="td-desc" style="font-size:.82rem">${esc(r.descricao)}</td><td style="text-align:right;font-size:.82rem">${money(r.valorContrato)}</td><td style="text-align:right;font-size:.82rem">${money(r.medicao)}</td><td style="text-align:right;font-size:.82rem">${money(r.acumulado)}</td><td style="text-align:right;font-size:.82rem">${money(r.saldo)}</td><td style="text-align:right;font-size:.82rem;${rp>=99.95?'color:var(--success);font-weight:700':'font-weight:700'}">${rp.toFixed(2)}%</td></tr>`;
         }).join('')}</tbody>
       </table></div>
     </div>`;
  panel.innerHTML = html;

  let dataInicioBaseCharts = calcDataInicioProximo(obra.dataInicio, totalMeses);
  requestAnimationFrame(() => {
    state.chartAdmin = renderCurvaS1('adminCurvaS', 'adminCurvaSwrap', it, state.chartAdmin);
    if (temCrono && temMensal) state.chartAdmin2 = renderCurvaS2('adminCurvaSAditivo', 'adminCurvaSAditivoWrap', obra, state.chartAdmin2);
    aditivos.forEach(ad => {
      const nP = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
      if (!nP && !(Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length)) return;
      const di = dataInicioBaseCharts;
      dataInicioBaseCharts = calcDataInicioProximo(dataInicioBaseCharts, nP) || dataInicioBaseCharts;
      renderCurvaS2Aditivo(`adminCurvaS_ad_${ad.id}`, `adminCurvaS_wrap_${ad.id}`, ad, di, null);
    });
    if (temServico) {
      _renderCurvasPorServicoPanelAdmin(obra, 'adm');
    }
  });
}

export function renderAdminViews() { renderAdminStats(); renderAdminSidebar(); renderColabList(); }
