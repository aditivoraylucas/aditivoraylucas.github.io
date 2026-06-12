import { $, state, esc, money, pct, calcPctGeral, buildCronogramaTimeline, showToast } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { setObraIdNaUrl, limparObraIdDaUrl } from './url-state.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// P-007: NUNCA usar deleteDoc em obras — soft delete via deletedAt
export async function saveObra(obra) {
  await setDoc(doc(db, 'users', state.user.uid, 'obras', obra.id), obra);
}

export async function deleteObra(id) {
  const obraRef = doc(db, 'users', state.user.uid, 'obras', id);
  const snapshot = state.obras.find(o => o.id === id) ?? null;
  await updateDoc(obraRef, { deletedAt: serverTimestamp() });
  await registrarEvento({
    uid:          state.user.uid,
    entidade:     'obras',
    docId:        id,
    acao:         'OBRA_REMOVIDA',
    snapshotAntes: snapshot,
  });
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
  const fimDia    = Math.min(dia, ultimoDia);
  return `${fimAno}-${String(fimMes).padStart(2,'0')}-${String(fimDia).padStart(2,'0')}`;
}

/* ============================================================
   CURVA S1 — Índice de Itens (barras por item)
   ============================================================ */
export function renderCurvaS1(canvasId, wrapId, itens, prevChart) {
  const canvas = $(canvasId); if (!canvas) return prevChart;
  if (prevChart) prevChart.destroy();

  const dark    = document.documentElement.dataset.theme === 'dark';
  const gc      = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc      = dark ? '#94a3b8' : '#64748b';
  const mobile  = window.innerWidth <= 900;
  const wrap    = $(wrapId);
  if (wrap) { wrap.style.overflowX = 'hidden'; canvas.style.minWidth = ''; canvas.style.width = '100%'; }

  return new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: itens.map(r => String(r.item || '')),
      datasets: [{
        label: '% Executado',
        data: itens.map(r => Number(r.percentualExecutado) || 0),
        backgroundColor: 'rgba(99,102,241,0.25)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 4,
        barThickness: mobile ? 'flex' : Math.max(18, Math.min(40, Math.floor(600 / (itens.length || 1))))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: gc }, ticks: { color: tc, callback: v => v + '%' } },
        x: { grid: { display: false }, ticks: { color: tc, font: { size: mobile ? 8 : 10 }, maxRotation: mobile ? 90 : 45 } }
      },
      plugins: { legend: { labels: { color: tc } } }
    }
  });
}

/* ============================================================
   CURVA S2 — Cronograma Físico-Financeiro
   Planejado (contrato) x Executado Real (mensal)
   Se houver aditivo: continua no mesmo gráfico com linha vertical separadora
   ============================================================ */
export function renderCurvaS2(canvasId, wrapId, obra, prevChart) {
  const canvas = $(canvasId); if (!canvas) return prevChart;
  if (prevChart) prevChart.destroy();

  const dark   = document.documentElement.dataset.theme === 'dark';
  const gc     = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc     = dark ? '#94a3b8' : '#64748b';
  const mobile = window.innerWidth <= 900;
  const wrap   = $(wrapId);
  if (wrap) { wrap.style.overflowX = 'auto'; }

  const temContrato  = Array.isArray(obra?.cronograma) && obra.cronograma.length > 0;
  const temMensal    = Array.isArray(obra?.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const temAditivo   = Array.isArray(obra?.cronogramaAditivo) && obra.cronogramaAditivo.length > 0;
  const dataInicio   = obra?.dataInicio || null;

  if (!temContrato || !temMensal || !dataInicio) {
    // sem dados suficientes: mostra mensagem no canvas
    if (prevChart) prevChart.destroy();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = tc;
    ctx.font = `${mobile ? 12 : 14}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      'Importe o Cronograma do Contrato e o Cronograma Mensal para exibir a Curva S.',
      canvas.width / 2, canvas.height / 2
    );
    return null;
  }

  // --- monta timeline unificada: contrato + aditivo (se houver) ---
  const crono1 = obra.cronograma;                                      // contrato
  const crono2 = temAditivo ? obra.cronogramaAditivo : [];             // aditivo
  const nContrato = crono1.length;
  const nAditivo  = crono2.length;
  const totalMeses = nContrato + nAditivo;

  // Labels de mês/ano
  function labelMes(dataInicio, offset) {
    const [iniAno, iniMes] = dataInicio.split('-').map(Number);
    const base0  = (iniMes - 1) + offset;
    const ano    = iniAno + Math.floor(base0 / 12);
    const mes    = (base0 % 12) + 1;
    return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  const labels = [];
  for (let i = 1; i <= nContrato; i++) labels.push(labelMes(dataInicio, i));
  // aditivo continua do mês seguinte ao fim do contrato
  const dataInicioAditivo = obra.dataInicioAditivo || dataInicio;
  for (let i = 1; i <= nAditivo; i++) labels.push(labelMes(dataInicioAditivo, nContrato + i));

  // --- Planejado acumulado ---
  const planData = [];
  let acumPlan = 0;
  for (let i = 0; i < nContrato; i++) {
    acumPlan += Number(crono1[i].planejadoPct) || 0;
    planData.push(+Math.min(acumPlan, 100).toFixed(2));
  }
  // no segmento do aditivo a linha planejada do contrato vira null (encerra)
  // e começa nova linha planejada do aditivo
  const planAditivoData = new Array(nContrato).fill(null);
  let acumPlanAd = 0;
  for (let i = 0; i < nAditivo; i++) {
    acumPlanAd += Number(crono2[i].planejadoPct) || 0;
    planAditivoData.push(+Math.min(acumPlanAd, 100).toFixed(2));
  }

  // --- Executado acumulado (cronograma mensal) ---
  const execData = new Array(totalMeses).fill(null);
  let acumExec = 0;
  for (let i = 0; i < obra.cronogramaExecucao.length && i < totalMeses; i++) {
    acumExec += Number(obra.cronogramaExecucao[i].executadoPct) || 0;
    execData[i] = +Math.min(acumExec, 100).toFixed(2);
  }

  // índice de separação contrato/aditivo
  const separadorIdx = temAditivo ? nContrato - 1 : -1;

  // Plugin: linha vertical separando contrato e aditivo
  const pluginSeparador = {
    id: 'separadorAditivo',
    afterDraw(chart) {
      if (separadorIdx < 0) return;
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const xPos = x.getPixelForValue(separadorIdx) + (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = dark ? 'rgba(251,191,36,0.7)' : 'rgba(217,119,6,0.7)';
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const label   = 'Aditivo';
      ctx.font      = `bold ${mobile ? 9 : 11}px sans-serif`;
      const tw      = ctx.measureText(label).width;
      const bw      = tw + 8;
      const bh      = mobile ? 14 : 18;
      const bx      = xPos + 4;
      const by      = top + 4;
      ctx.fillStyle = dark ? 'rgba(217,119,6,0.85)' : 'rgba(251,191,36,0.9)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
      ctx.fillStyle = dark ? '#fff' : '#1e293b';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 4, by + bh / 2);
      ctx.restore();
    }
  };

  const datasets = [
    {
      type: 'line', label: 'Planejado — Contrato (%)',
      data: planData,
      borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)',
      borderWidth: 2.5, pointRadius: mobile ? 2 : 3,
      pointBackgroundColor: '#f59e0b',
      tension: 0.35, fill: false, spanGaps: false, order: 0
    },
    ...(temAditivo ? [{
      type: 'line', label: 'Planejado — Aditivo (%)',
      data: planAditivoData,
      borderColor: '#fb923c', backgroundColor: 'rgba(251,146,60,0.06)',
      borderWidth: 2.5, borderDash: [5, 3],
      pointRadius: mobile ? 2 : 3,
      pointBackgroundColor: '#fb923c',
      tension: 0.35, fill: false, spanGaps: false, order: 1
    }] : []),
    {
      type: 'line', label: 'Executado Real (%)',
      data: execData,
      borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
      borderWidth: 2.5, pointRadius: mobile ? 2 : 4,
      pointBackgroundColor: '#10b981',
      tension: 0.35, fill: false, spanGaps: false, order: 2
    }
  ];

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    plugins: [pluginSeparador],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          grid: { color: gc },
          ticks: { color: tc, callback: v => v + '%', font: { size: mobile ? 9 : 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: tc, font: { size: mobile ? 8 : 10 }, maxRotation: mobile ? 90 : 45 }
        }
      },
      plugins: {
        legend: {
          labels: { color: tc, font: { size: mobile ? 9 : 11 }, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          callbacks: {
            title: items => `\ud83d\udcc5 ${items[0].label}`,
            label: item => {
              const v = item.parsed.y;
              if (v === null || v === undefined) return null;
              return ` ${item.dataset.label}: ${Number(v).toFixed(1)}%`;
            },
            afterBody: items => {
              const plan  = items.find(i => i.datasetIndex === 0)?.parsed.y;
              const exec  = items.find(i => i.dataset.label?.startsWith('Executado'))?.parsed.y;
              if (plan == null || exec == null) return [];
              const dev = +(exec - plan).toFixed(1);
              const icon = dev >= 0 ? '\u2705' : '\u26a0\ufe0f';
              const txt  = dev >= 0 ? `Adiantado ${dev}%` : `Atrasado ${Math.abs(dev)}%`;
              return ['\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', ` ${icon} ${txt}`];
            }
          },
          backgroundColor: dark ? '#1e293b' : '#fff',
          titleColor:       dark ? '#f8fafc' : '#0f172a',
          bodyColor:        dark ? '#94a3b8' : '#475569',
          borderColor:      dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1, padding: 10, cornerRadius: 8
        }
      }
    }
  });
}

// Compat: mantém renderCurvaS exportado para o painel admin (usa a antiga lógica de barras)
export function renderCurvaS(canvasId, wrapId, itens, prev) {
  return renderCurvaS1(canvasId, wrapId, itens, prev);
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
      <td style="text-align:right"><button data-del="${i}" class="btn btn-danger" style="padding:.4rem;border-radius:6px">\ud83d\uddd1</button></td>
    </tr>`;
  }).join('');
}

/* ---- Caixas de status na sidebar ---- */

export function renderCronogramaBox() {
  const box = $('cronogramaBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const temCrono   = Array.isArray(o.cronograma) && o.cronograma.length > 0;
  const totalMeses = temCrono ? o.cronograma.length : 0;
  const dataFimStr = (temCrono && o.dataInicio) ? fmtDate(calcDataFim(o.dataInicio, totalMeses)) : null;
  if (temCrono) {
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\ud83d\udcca <strong style="color:var(--text)">${totalMeses} meses</strong> importados</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\ud83c\udfc1 Término previsto: <strong>${dataFimStr}</strong></div>` : ''}
       <button id="removeCronogramaBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\ud83d\uddd1 Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma importado.</p>';
  }
  const removeBtn = $('removeCronogramaBtn');
  if (removeBtn) removeBtn.onclick = async () => {
    if (!confirm('Remover o cronograma desta obra?')) return;
    delete o.cronograma; delete o.dataEmissao;
    await saveObra(o); renderCronogramaBox(); updateDashboard();
    showToast('\u2705 Cronograma removido.');
  };
}

export function renderCronogramaMensalBox() {
  const box = $('cronogramaMensalBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const tem = Array.isArray(o.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  if (tem) {
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\ud83d\udcc8 <strong style="color:var(--text)">${o.cronogramaExecucao.length} meses</strong> importados</div>
       <button id="removeCronogramaMensalBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\ud83d\uddd1 Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma mensal importado.</p>';
  }
  const removeBtn = $('removeCronogramaMensalBtn');
  if (removeBtn) removeBtn.onclick = async () => {
    if (!confirm('Remover o cronograma mensal desta obra?')) return;
    delete o.cronogramaExecucao;
    await saveObra(o); renderCronogramaMensalBox(); updateDashboard();
    showToast('\u2705 Cronograma mensal removido.');
  };
}

export function renderCronogramaAditivoBox() {
  const box = $('cronogramaAditivoBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra.</p>'; return; }
  const temAditivo = Array.isArray(o.cronogramaAditivo) && o.cronogramaAditivo.length > 0;
  const totalMeses = temAditivo ? o.cronogramaAditivo.length : 0;
  const dataBase   = o.dataInicioAditivo || o.dataInicio;
  const dataFimStr = (temAditivo && dataBase) ? fmtDate(calcDataFim(dataBase, totalMeses)) : null;
  if (temAditivo) {
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\ud83d\udccb <strong style="color:var(--text)">${totalMeses} meses</strong> importados</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\ud83c\udfc1 Término do aditivo: <strong>${dataFimStr}</strong></div>` : '' }
       <button id="removeCronogramaAditivoBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\ud83d\uddd1 Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum aditivo importado.</p>';
  }
  const removeBtn = $('removeCronogramaAditivoBtn');
  if (removeBtn) removeBtn.onclick = async () => {
    if (!confirm('Remover o cronograma de aditivo desta obra?')) return;
    delete o.cronogramaAditivo; delete o.dataEmissaoAditivo; delete o.dataInicioAditivo;
    await saveObra(o); renderCronogramaAditivoBox(); updateDashboard();
    showToast('\u2705 Cronograma de aditivo removido.');
  };
}

export function updateDashboard() {
  const o = currentObra();
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

  // Curva S1 — barras por item
  state.chartUser = renderCurvaS1('sCurveChart', 'sCurveScrollWrap', itens, state.chartUser);

  // Curva S2 — planejado x executado real (só exibe se tiver contrato + mensal)
  const temCrono  = Array.isArray(o?.cronograma) && o.cronograma.length > 0;
  const temMensal = Array.isArray(o?.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const panelS2   = $('sCurveAditivoPanel');
  if (panelS2) panelS2.style.display = (temCrono && temMensal) ? '' : 'none';
  if (temCrono && temMensal) {
    state.chartUser2 = renderCurvaS2('sCurveAditivoChart', 'sCurveAditivoScrollWrap', o, state.chartUser2);
  } else {
    if (state.chartUser2) { state.chartUser2.destroy(); state.chartUser2 = null; }
  }
}

export function renderObrasBox() {
  const box = $('obrasBox'); if (!box) return;
  const obrasAtivas = state.obras.filter(o => !o.deletedAt);
  if (!obrasAtivas.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhuma obra cadastrada.</p>';
    renderCronogramaBox(); renderCronogramaMensalBox(); renderCronogramaAditivoBox();
    return;
  }
  box.innerHTML =
    `<div class="form-group" style="margin-bottom:.5rem"><label>Obra ativa</label>
     <select id="obraSelect" class="form-control">
       ${obrasAtivas.map(o => `<option value="${o.id}" ${o.id === state.selectedObraId ? 'selected' : ''}>${esc(o.nome || 'Obra')}</option>`).join('')}
     </select></div>
     <div style="display:flex;gap:.5rem;flex-wrap:wrap">
       <button class="btn btn-sec" id="replaceObraBtn" style="flex:1">\ud83d\udd04 Atualizar</button>
       <button class="btn btn-danger" id="deleteObraBtn" style="flex:1">\ud83d\uddd1 Remover</button>
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
    if (state.selectedObraId) {
      const proxima = state.obras.find(x => x.id === state.selectedObraId);
      if (proxima) applySelected(proxima);
    } else {
      state.rows = [];
      ['projName','projContratada','projScope'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      limparObraIdDaUrl();
    }
    renderAll();
    showToast(`"${obraNome}" removida.`);
  };
  renderCronogramaBox();
  renderCronogramaMensalBox();
  renderCronogramaAditivoBox();
}

export function renderAll() { renderObrasBox(); renderTable(); updateDashboard(); }
let importFileFn = () => {};
export function setImportFileFn(fn) { importFileFn = fn; }

/* ============================================================
   ADMIN
   ============================================================ */

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

export function renderColabList() {
  const box = $('colabList'); if (!box) return;
  const colabs = Object.entries(state.allUsers).filter(([,u]) => u.role !== 'admin');
  if (!colabs.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">Nenhum colaborador.</p>'; return; }
  box.innerHTML = colabs.map(([uid, u]) =>
    `<div class="colab-item" style="${u.blocked ? 'opacity:.7' : ''}">
       <div><strong>${esc(u.nome)}</strong>
         ${u.blocked ? '<span style="margin-left:.5rem;font-size:.7rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.1rem .4rem;border-radius:999px">\ud83d\udd12 Bloqueado</span>' : ''}
         <br><small style="color:var(--text-muted)">${esc(u.email)}</small></div>
       <div style="display:flex;gap:.4rem;flex-wrap:wrap">
         <button class="btn ${u.blocked ? 'btn-success' : 'btn-warning'}" style="padding:.3rem .65rem;font-size:.72rem" onclick="toggleBloqueio('${uid}',${u.blocked})">${u.blocked ? '\u2705 Desbloquear' : '\ud83d\udd12 Bloquear'}</button>
         <button class="btn btn-danger" style="padding:.3rem .65rem;font-size:.72rem" onclick="removeColab('${uid}')">Remover</button>
       </div>
     </div>`).join('');
}

function colabSidebarHTML(colabs) {
  if (!colabs.length) return '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem">Nenhum colaborador.</p>';
  if (state.adminSelectedUid && state.allUsers[state.adminSelectedUid]) {
    const u = state.allUsers[state.adminSelectedUid];
    const n = (u.obras || []).filter(o => !o.deletedAt).length;
    return `<button class="btn btn-sec" onclick="adminDeselectColab()" style="width:100%;margin-bottom:.75rem;font-size:.8rem">\u2190 Todos</button>
       <div class="colab-sidebar-item active">
         <div style="font-weight:600;font-size:.875rem">${u.blocked ? '\ud83d\udd12 ' : ''}${esc(u.nome)}</div>
         <div style="font-size:.75rem;color:var(--text-muted)">${n} obra${n !== 1 ? 's' : ''}</div>
       </div>`;
  }
  return colabs.map(([uid, u]) => {
    const n = (u.obras || []).filter(o => !o.deletedAt).length;
    return `<div class="colab-sidebar-item" style="${u.blocked ? 'opacity:.55' : ''}" onclick="adminSelectColab('${uid}')">
       <div style="font-weight:600;font-size:.875rem">${u.blocked ? '\ud83d\udd12 ' : ''}${esc(u.nome)}</div>
       <div style="font-size:.75rem;color:var(--text-muted)">${n} obra${n !== 1 ? 's' : ''}</div>
     </div>`;
  }).join('');
}

export function renderAdminSidebar() {
  const colabs = Object.entries(state.allUsers).filter(([,u]) => u.role !== 'admin');
  const html   = colabSidebarHTML(colabs);
  const box    = $('adminColabSidebar');       if (box) box.innerHTML = html;
  const mob    = $('adminColabSidebarMobile'); if (mob) mob.innerHTML = html;
}

export function adminObraCardHTML(obra) {
  if (obra.deletedAt) return '';
  const it = Array.isArray(obra.itens) ? obra.itens : [];
  const vc = Number(obra.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac = Number(obra.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const p  = calcPctGeral(obra.resumo, it);
  const temCrono   = Array.isArray(obra.cronograma) && obra.cronograma.length > 0;
  const temMensal  = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const temAditivo = Array.isArray(obra.cronogramaAditivo) && obra.cronogramaAditivo.length > 0;
  return `<div class="obra-card" style="cursor:pointer" onclick="adminSelectObra('${obra.id}')">
    <div class="obra-card-header">
      <div><div class="obra-card-title">${esc(obra.nome || 'Sem nome')}</div>
      <div class="obra-card-sub">${it.length} itens | Aba: ${esc(obra.medicaoAtual || '-')}${temCrono ? ' | \ud83d\udcc5 Cronograma' : ''}${temMensal ? ' | \ud83d\udcc8 Mensal' : ''}${temAditivo ? ' | \ud83d\udccb Aditivo' : ''}</div></div>
      <div class="obra-card-pct">${pct(p)}</div></div>
    <div class="obra-progress-bar"><div class="obra-progress-fill" style="width:${Math.min(100,p)}%"></div></div>
    <div class="obra-card-footer">
      <span>CT/Aditivo: ${money(vc)}</span><span>Acumulado: ${money(ac)}</span><span>Saldo: ${money(vc-ac)}</span>
    </div></div>`;
}

export function renderAdminDetail() {
  const panel = $('adminDetailPanel'); if (!panel) return;
  if (state.chartAdmin2) { state.chartAdmin2.destroy(); state.chartAdmin2 = null; }
  if (!state.adminSelectedUid) { panel.innerHTML = '<p style="color:var(--text-muted);padding:1rem">Selecione um colaborador ao lado.</p>'; return; }
  const u = state.allUsers[state.adminSelectedUid];
  if (!u) { panel.innerHTML = ''; return; }
  const obrasList = (u.obras || []).filter(o => !o.deletedAt);
  let html = `<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
    <div style="font-weight:700;font-size:1.1rem">\ud83d\udc64 ${esc(u.nome)}${u.blocked ? ' <span style="font-size:.75rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.2rem .6rem;border-radius:999px">\ud83d\udd12</span>' : ''}</div>
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
  const it      = Array.isArray(obra.itens) ? obra.itens : [];
  const vc      = Number(obra.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac      = Number(obra.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const estaMed = Number(obra.resumo?.estaMedicao)          || it.reduce((a,i)=>a+Number(i.medicao||0),0);
  const p       = calcPctGeral(obra.resumo, it);
  const saldo   = vc - ac;
  const dataInicioStr  = fmtDate(obra.dataInicio);
  const totalMeses     = Array.isArray(obra.cronograma) ? obra.cronograma.length : 0;
  const dataFimISO     = calcDataFim(obra.dataInicio, totalMeses);
  const dataFimStr     = dataFimISO ? fmtDate(dataFimISO) : '-';
  const temMensal      = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const temCrono       = Array.isArray(obra.cronograma) && obra.cronograma.length > 0;
  const LS   = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS   = 'font-size:.95rem;font-weight:700;margin-top:.15rem';
  const VSSM = 'font-size:.82rem;font-weight:700;margin-top:.15rem;word-break:break-word';
  const curvaS2HTML = (temCrono && temMensal)
    ? `<div class="panel" style="margin-bottom:1.5rem">
         <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 Cronograma F\u00edsico-Financeiro</h3>
         <div class="chart-scroll-wrap" id="adminCurvaSAditivoWrap"><div class="chart-container"><canvas id="adminCurvaSAditivo"></canvas></div></div>
       </div>`
    : '';
  html +=
    `<div class="admin-stats-grid">
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Contratada</span><span class="stat-value" style="${VSSM}">${esc(obra.contratada||'-')}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Esta Medi\u00e7\u00e3o</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\ud83d\udcc5 In\u00edcio</span><span class="stat-value" style="${VS}">${dataInicioStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\ud83c\udfc1 T\u00e9rmino</span><span class="stat-value" style="${VS}">${dataFimStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Saldo</span><span class="stat-value" style="${VS}">${money(saldo)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     </div>
     <div class="panel" style="margin-bottom:1.5rem">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 \u00cdndice de Itens</h3>
       <div class="chart-scroll-wrap" id="adminCurvaSwrap"><div class="chart-container"><canvas id="adminCurvaS"></canvas></div></div>
     </div>
     ${curvaS2HTML}
     <div class="panel">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">\u00cdndice de Itens</h3>
       <div class="table-container"><table class="admin-table">
         <thead><tr>
           <th class="th-sticky" data-label="ITEM"></th>
           <th class="th-sticky" data-label="DESCRI\u00c7\u00c3O"></th>
           <th class="th-sticky" style="text-align:right" data-label="VALOR CT"></th>
           <th class="th-sticky" style="text-align:right" data-label="MED"></th>
           <th class="th-sticky" style="text-align:right" data-label="ACUMUL"></th>
           <th class="th-sticky" style="text-align:right" data-label="SALDO"></th>
           <th class="th-sticky" style="text-align:right" data-label="%"></th>
         </tr></thead>
         <tbody>${it.map(r => {
           const rp  = Number(r.percentualExecutado || 0);
           const rpc = rp >= 99.95 ? 'color:var(--success);font-weight:700' : 'font-weight:700';
           return `<tr>
             <td style="font-size:.82rem">${esc(r.item)}</td>
             <td class="td-desc" style="font-size:.82rem">${esc(r.descricao)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.valorContrato)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.medicao)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.acumulado)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.saldo)}</td>
             <td style="text-align:right;font-size:.82rem;${rpc}">${rp.toFixed(2)}%</td>
           </tr>`;
         }).join('')}</tbody>
       </table></div>
     </div>`;
  panel.innerHTML = html;
  requestAnimationFrame(() => {
    state.chartAdmin = renderCurvaS1('adminCurvaS', 'adminCurvaSwrap', it, state.chartAdmin);
    if (temCrono && temMensal) {
      state.chartAdmin2 = renderCurvaS2('adminCurvaSAditivo', 'adminCurvaSAditivoWrap', obra, state.chartAdmin2);
    }
  });
}

export function renderAdminViews() { renderAdminStats(); renderAdminSidebar(); renderColabList(); }
