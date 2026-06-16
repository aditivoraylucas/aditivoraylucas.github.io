import { $, state, esc, money, pct, calcPctGeral, buildCronogramaTimeline, buildCurvaServico, showToast } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { setObraIdNaUrl, limparObraIdDaUrl } from './url-state.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function saveObra(obra) {
  await setDoc(doc(db, 'users', state.user.uid, 'obras', obra.id), obra);
}

export async function deleteObra(id) {
  const obraRef  = doc(db, 'users', state.user.uid, 'obras', id);
  const snapshot = state.obras.find(o => o.id === id) ?? null;
  await updateDoc(obraRef, { deletedAt: serverTimestamp() });
  await registrarEvento({
    uid:           state.user.uid,
    entidade:      'obras',
    docId:         id,
    acao:          'OBRA_REMOVIDA',
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
  const mesBase0 = (mes - 1) + totalMeses;
  const fimAno   = ano + Math.floor(mesBase0 / 12);
  const fimMes   = (mesBase0 % 12) + 1;
  const ultimoDia = new Date(fimAno, fimMes, 0).getDate();
  const fimDia   = Math.min(dia, ultimoDia);
  return `${fimAno}-${String(fimMes).padStart(2,'0')}-${String(fimDia).padStart(2,'0')}`;
}

function calcDataInicioProximo(dataInicio, totalMeses) {
  if (!dataInicio || !totalMeses) return dataInicio || null;
  const [ano, mes] = dataInicio.split('-').map(Number);
  const base0 = (mes - 1) + totalMeses;
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
  if (precisaSalvar) await saveObra(o);
  return precisaSalvar;
}

/* ============================================================
   CURVA S1 — Índice de Itens
   ============================================================ */
export function renderCurvaS1(canvasId, wrapId, itens, prevChart) {
  const canvas = $(canvasId); if (!canvas) return prevChart;
  if (prevChart) prevChart.destroy();

  const dark   = document.documentElement.dataset.theme === 'dark';
  const gc     = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc     = dark ? '#94a3b8' : '#64748b';
  const mobile = window.innerWidth <= 900;
  const wrap   = $(wrapId);
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
   CURVA S2 — Genérica (contrato / aditivo)
   ============================================================ */
export function renderCurvaS2(canvasId, wrapId, obra, prevChart) {
  return _renderCurvaS2Generica(canvasId, wrapId, {
    cronograma:         Array.isArray(obra?.cronograma)         ? obra.cronograma         : [],
    cronogramaExecucao: Array.isArray(obra?.cronogramaExecucao) ? obra.cronogramaExecucao : [],
    dataInicio:         obra?.dataInicio || null,
    titulo:             'Contrato'
  }, prevChart);
}

export function renderCurvaS2Aditivo(canvasId, wrapId, aditivo, dataInicioAditivo, prevChart) {
  return _renderCurvaS2Generica(canvasId, wrapId, {
    cronograma:         Array.isArray(aditivo?.cronograma)         ? aditivo.cronograma         : [],
    cronogramaExecucao: Array.isArray(aditivo?.cronogramaExecucao) ? aditivo.cronogramaExecucao : [],
    dataInicio:         dataInicioAditivo || null,
    titulo:             aditivo?.nome || 'Aditivo'
  }, prevChart);
}

function _renderCurvaS2Generica(canvasId, wrapId, { cronograma, cronogramaExecucao, dataInicio, titulo }, prevChart) {
  const canvas = $(canvasId); if (!canvas) return prevChart;
  if (prevChart) { try { prevChart.destroy(); } catch(_){} }

  const dark   = document.documentElement.dataset.theme === 'dark';
  const gc     = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc     = dark ? '#94a3b8' : '#64748b';
  const mobile = window.innerWidth <= 900;
  const wrap   = $(wrapId);
  if (wrap) wrap.style.overflowX = 'auto';

  const n = cronograma.length;
  if (!n) return prevChart;

  function labelMes(offset) {
    if (!dataInicio) return `M${offset}`;
    const [iniAno, iniMes] = dataInicio.split('-').map(Number);
    const base0 = (iniMes - 1) + offset;
    const ano   = iniAno + Math.floor(base0 / 12);
    const mes   = (base0 % 12) + 1;
    return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  const labels   = Array.from({ length: n }, (_, i) => labelMes(i + 1));
  const planData = [];
  let acumPlan   = 0;
  for (let i = 0; i < n; i++) {
    acumPlan += Number(cronograma[i]?.planejadoPct) || 0;
    planData.push(+Math.min(acumPlan, 100).toFixed(2));
  }

  const execData = new Array(n).fill(null);
  let acumExec   = 0;
  for (let i = 0; i < cronogramaExecucao.length && i < n; i++) {
    acumExec += Number(cronogramaExecucao[i]?.executadoPct) || 0;
    execData[i] = +Math.min(acumExec, 100).toFixed(2);
  }

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Planejado — ${titulo} (%)`,
          data: planData,
          borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)',
          borderWidth: 2.5, pointRadius: mobile ? 2 : 3,
          pointBackgroundColor: '#f59e0b',
          tension: 0.35, fill: false, spanGaps: false
        },
        {
          label: 'Executado Real (%)',
          data: execData,
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2.5, pointRadius: mobile ? 2 : 4,
          pointBackgroundColor: '#10b981',
          tension: 0.35, fill: false, spanGaps: false
        }
      ]
    },
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
        legend: { labels: { color: tc, font: { size: mobile ? 9 : 11 }, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: {
          callbacks: {
            title: items => `\ud83d\udcc5 ${items[0].label}`,
            label: item => {
              const v = item.parsed.y;
              if (v === null || v === undefined) return null;
              return ` ${item.dataset.label}: ${Number(v).toFixed(1)}%`;
            },
            afterBody: items => {
              const plan = items.find(i => i.datasetIndex === 0)?.parsed.y;
              const exec = items.find(i => i.dataset.label?.startsWith('Executado'))?.parsed.y;
              if (plan == null || exec == null) return [];
              const dev  = +(exec - plan).toFixed(1);
              const icon = dev >= 0 ? '\u2705' : '\u26a0\ufe0f';
              const txt  = dev >= 0 ? `Adiantado ${dev}%` : `Atrasado ${Math.abs(dev)}%`;
              return ['\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', ` ${icon} ${txt}`];
            }
          },
          backgroundColor: dark ? '#1e293b' : '#fff',
          titleColor:      dark ? '#f8fafc' : '#0f172a',
          bodyColor:       dark ? '#94a3b8' : '#475569',
          borderColor:     dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1, padding: 10, cornerRadius: 8
        }
      }
    }
  });
}

export function renderCurvaS(canvasId, wrapId, itens, prev) {
  return renderCurvaS1(canvasId, wrapId, itens, prev);
}

/* ============================================================
   CURVA S POR SERVIÇO
   ============================================================ */

function _renderCurvaServico(canvasId, wrapId, dados, prevChart) {
  const canvas = $(canvasId); if (!canvas) return prevChart;
  if (prevChart) { try { prevChart.destroy(); } catch(_){} }

  const dark   = document.documentElement.dataset.theme === 'dark';
  const gc     = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc     = dark ? '#94a3b8' : '#64748b';
  const mobile = window.innerWidth <= 900;
  const wrap   = $(wrapId);
  if (wrap) wrap.style.overflowX = 'auto';

  const { labels, planAcum, execAcumPct, mesAtualIdx, mesesDecorridos } = dados;
  const n = labels.length;
  if (!n) return prevChart;

  const execData = new Array(n).fill(null);
  if (mesesDecorridos > 0 && mesAtualIdx >= 0 && execAcumPct > 0) {
    execData[mesAtualIdx] = execAcumPct;
  }

  const hojeAnnotation = mesesDecorridos > 0 && mesAtualIdx >= 0 ? {
    type: 'line',
    scaleID: 'x',
    value: mesAtualIdx,
    borderColor: 'rgba(239,68,68,0.6)',
    borderWidth: 1.5,
    borderDash: [4, 4],
    label: {
      display: true,
      content: 'Hoje',
      position: 'start',
      backgroundColor: '#ef4444',
      color: '#fff',
      font: { size: 9 },
      padding: { x: 4, y: 2 },
      borderRadius: 3
    }
  } : null;

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Planejado (%)',
          data: planAcum,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.08)',
          borderWidth: 2,
          pointRadius: mobile ? 1.5 : 2.5,
          pointBackgroundColor: '#f59e0b',
          tension: 0.35,
          fill: false
        },
        {
          label: 'Executado Real (%)',
          data: execData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.9)',
          borderWidth: 0,
          pointRadius: mobile ? 5 : 7,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          showLine: false,
          spanGaps: false
        }
      ]
    },
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
          ticks: { color: tc, font: { size: mobile ? 7 : 9 }, maxRotation: mobile ? 90 : 45 }
        }
      },
      plugins: {
        legend: { labels: { color: tc, font: { size: mobile ? 9 : 10 }, usePointStyle: true, pointStyleWidth: 8 } },
        annotation: hojeAnnotation ? { annotations: { hojeServico: hojeAnnotation } } : {},
        tooltip: {
          callbacks: {
            title: items => `\ud83d\udcc5 ${items[0].label}`,
            label: item => {
              const v = item.parsed.y;
              if (v === null || v === undefined) return null;
              return ` ${item.dataset.label}: ${Number(v).toFixed(1)}%`;
            },
            afterBody: items => {
              const plan = items.find(i => i.datasetIndex === 0)?.parsed.y;
              const exec = items.find(i => i.datasetIndex === 1)?.parsed.y;
              if (plan == null || exec == null) return [];
              const dev  = +(exec - plan).toFixed(1);
              const icon = dev >= 0 ? '\u2705' : '\u26a0\ufe0f';
              const txt  = dev >= 0 ? `Adiantado ${dev}%` : `Atrasado ${Math.abs(dev)}%`;
              return ['\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', ` ${icon} ${txt}`];
            }
          },
          backgroundColor: dark ? '#1e293b' : '#fff',
          titleColor:      dark ? '#f8fafc' : '#0f172a',
          bodyColor:       dark ? '#94a3b8' : '#475569',
          borderColor:     dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1, padding: 10, cornerRadius: 8
        }
      }
    }
  });
}

function _statusBadge(status) {
  const cfg = {
    em_dia:      { icon: '\u2705', label: 'Em dia',       bg: 'rgba(16,185,129,.15)',  color: '#10b981' },
    adiantado:   { icon: '\ud83d\ude80', label: 'Adiantado',   bg: 'rgba(99,102,241,.15)',  color: '#6366f1' },
    atrasado:    { icon: '\u26a0\ufe0f', label: 'Atrasado',    bg: 'rgba(239,68,68,.15)',   color: '#ef4444' },
    nao_iniciado:{ icon: '\u23f3', label: 'Não iniciado', bg: 'rgba(100,116,139,.12)', color: '#64748b' }
  };
  const c = cfg[status] || cfg.nao_iniciado;
  return `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .6rem;border-radius:999px;font-size:.72rem;font-weight:600;background:${c.bg};color:${c.color}">${c.icon} ${c.label}</span>`;
}

function _servicoCardHTML(dados, canvasId, wrapId, isOpen) {
  const { descricao, item, execAcumPct, execAcumValor, valorContrato, planAcum, mesAtualIdx, status } = dados;
  const planAteAgora = (mesAtualIdx >= 0 && planAcum[mesAtualIdx] != null) ? planAcum[mesAtualIdx] : 0;
  const desvio = +(execAcumPct - planAteAgora).toFixed(2);
  const desvioColor = desvio >= 0 ? '#10b981' : '#ef4444';
  const desvioSinal = desvio >= 0 ? '+' : '';
  const temDados = valorContrato > 0 || planAcum.some(v => v > 0);

  return `
  <div class="servico-card" style="border:1px solid var(--border,#e2e8f0);border-radius:10px;margin-bottom:.75rem;overflow:hidden;background:var(--surface,#fff)">
    <button
      class="servico-card-header"
      aria-expanded="${isOpen}"
      style="width:100%;display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:none;border:none;cursor:pointer;text-align:left;transition:background .15s"
      onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded')==='true'?'false':'true'); this.nextElementSibling.style.display = this.getAttribute('aria-expanded')==='true' ? '' : 'none';"
    >
      <span style="font-size:.7rem;font-weight:700;color:var(--text-muted,#64748b);min-width:1.8rem">${esc(String(item))}</span>
      <span style="flex:1;font-size:.82rem;font-weight:600;color:var(--text,#0f172a)">${esc(descricao)}</span>
      ${_statusBadge(status)}
      <span style="font-size:.78rem;color:var(--text-muted,#64748b);white-space:nowrap">${execAcumPct.toFixed(1)}% exec.</span>
      <span style="font-size:.9rem;transition:transform .2s;display:inline-block">${isOpen ? '\u25b2' : '\u25bc'}</span>
    </button>
    <div style="display:${isOpen ? '' : 'none'}">
      ${temDados ? `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;padding:.5rem 1rem .25rem;border-top:1px solid var(--border,#e2e8f0)">
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Planejado até hoje:</span> ${planAteAgora.toFixed(1)}%
        </div>
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Executado:</span> ${execAcumPct.toFixed(1)}%
        </div>
        <div style="font-size:.75rem">
          <span style="font-weight:600;color:var(--text)">Desvio:</span>
          <span style="color:${desvioColor};font-weight:700">${desvioSinal}${desvio}%</span>
        </div>
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Valor Contrato:</span> ${money(valorContrato)}
        </div>
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Acumulado R$:</span> ${money(execAcumValor)}
        </div>
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}" style="padding:.5rem 1rem 1rem">
        <div class="chart-container" style="height:200px"><canvas id="${canvasId}"></canvas></div>
      </div>` : `<div style="padding:.75rem 1rem;font-size:.8rem;color:var(--text-muted)">Sem dados de cronograma para este serviço.</div>`}
    </div>
  </div>`;
}

export function renderCurvasPorServico(containerId, obra, prefix) {
  const container = $(containerId); if (!container) return;

  const chartsKey = `_servicoCharts_${prefix}`;
  if (state[chartsKey]) {
    Object.values(state[chartsKey]).forEach(c => { try { c.destroy(); } catch(_){} });
  }
  state[chartsKey] = {};
  container.innerHTML = '';

  const itensCrono    = Array.isArray(obra?.cronogramaItens) ? obra.cronogramaItens : [];
  const itensExecucao = Array.isArray(obra?.itens)           ? obra.itens           : [];
  const totalMeses    = Array.isArray(obra?.cronograma)      ? obra.cronograma.length : 0;
  const dataInicio    = obra?.dataInicio || null;

  // Mostra/oculta o painel pai
  const painel = $('curvasPorServicoPanel');
  const badge  = $('curvasPorServicoBadge');
  if (!itensCrono.length || !totalMeses || !dataInicio) {
    if (painel) painel.style.display = 'none';
    return;
  }
  if (painel) painel.style.display = '';
  if (badge)  badge.textContent = `${itensCrono.length} serviços`;

  let html = '';
  itensCrono.forEach((itemCrono, idx) => {
    const canvasId = `${prefix}_servico_canvas_${idx}`;
    const wrapId   = `${prefix}_servico_wrap_${idx}`;
    const isOpen   = idx === 0;
    const dados    = buildCurvaServico(dataInicio, itemCrono, itensExecucao, totalMeses);
    if (!dados) return;
    html += _servicoCardHTML(dados, canvasId, wrapId, isOpen);
  });

  if (!html) {
    if (painel) painel.style.display = 'none';
    return;
  }

  container.innerHTML = html;

  function renderNext(idx) {
    if (idx >= itensCrono.length) return;
    const itemCrono = itensCrono[idx];
    const canvasId  = `${prefix}_servico_canvas_${idx}`;
    const wrapId    = `${prefix}_servico_wrap_${idx}`;
    const dados     = buildCurvaServico(dataInicio, itemCrono, itensExecucao, totalMeses);
    if (dados && $(canvasId)) {
      state[chartsKey][idx] = _renderCurvaServico(
        canvasId, wrapId, dados, state[chartsKey][idx] || null
      );
    }
    requestAnimationFrame(() => renderNext(idx + 1));
  }
  requestAnimationFrame(() => renderNext(0));
}

/* ============================================================
   DEMAIS FUNÇÕES EXISTENTES (sem alteração)
   ============================================================ */
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
      `<div style="font-size:.8rem;color:var(--text-muted)">\ud83d\udcca <strong style="color:var(--text)">${totalMeses} meses</strong> importados${nServicos ? ` · <strong style="color:var(--text)">${nServicos} serviços</strong>` : ''}</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\ud83c\udfc1 Término previsto: <strong>${dataFimStr}</strong></div>` : ''}
       <button id="removeCronogramaBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\ud83d\uddd1 Remover</button>`;
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

export function renderAditivosSection() {
  const box = $('aditivosBox'); if (!box) return;
  const o = currentObra();
  if (!o) { box.innerHTML = ''; return; }

  const precisaMigrar = Array.isArray(o.aditivos) && o.aditivos.some(ad => !ad.id);
  if (precisaMigrar) {
    migrarAditivosSemId(o).then(() => renderAditivosSection());
    return;
  }

  const aditivos = Array.isArray(o.aditivos) ? o.aditivos : [];

  if (!aditivos.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.78rem;margin:.25rem 0">Nenhum aditivo criado.</p>';
    return;
  }

  box.innerHTML = aditivos.map(ad => {
    const temPrevisto = Array.isArray(ad.cronograma) && ad.cronograma.length > 0;
    const temMensal   = Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length > 0;
    const nP = temPrevisto ? ad.cronograma.length : 0;
    const nM = temMensal   ? ad.cronogramaExecucao.length : 0;
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:.65rem .75rem;margin-bottom:.6rem;background:var(--surface)">
        <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem">
          <input
            type="text"
            data-aditivo-nome="${ad.id}"
            value="${esc(ad.nome || 'Aditivo')}"
            style="flex:1;font-size:.82rem;font-weight:600;border:1px solid var(--border);border-radius:5px;padding:.25rem .4rem;background:var(--bg);color:var(--text)"
          />
          <button data-aditivo-action="remover" data-aditivo-id="${ad.id}" class="btn btn-danger" style="padding:.25rem .45rem;font-size:.75rem">\ud83d\uddd1</button>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button data-aditivo-action="previsto" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${temPrevisto ? `\u2705 Previsto (${nP}m)` : '\ud83d\udcca Importar Previsto'}
          </button>
          <button data-aditivo-action="mensal" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${temMensal ? `\u2705 Mensal (${nM}m)` : '\ud83d\udcc8 Importar Mensal'}
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

    const temPrevisto = nPrev > 0;
    const temMensal   = Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length > 0;
    if (!temPrevisto && !temMensal) return;

    const canvasId = `curvaS_aditivo_${ad.id}`;
    const wrapId   = `curvaS_aditivo_wrap_${ad.id}`;

    const dataFimStr = (temPrevisto && dataInicioAd)
      ? fmtDate(calcDataFim(dataInicioAd, nPrev))
      : null;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginBottom = '1.5rem';
    panel.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="font-size:.95rem;font-weight:700;margin:0">Curva S \u2014 ${esc(ad.nome || 'Aditivo')}</h3>
        ${dataFimStr ? `<span style="font-size:.75rem;color:var(--text-muted)">\ud83c\udfc1 Término: <strong>${dataFimStr}</strong></span>` : ''}
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}"><div class="chart-container"><canvas id="${canvasId}"></canvas></div></div>`;
    container.appendChild(panel);

    requestAnimationFrame(() => {
      state._aditivoCharts[ad.id] = renderCurvaS2Aditivo(
        canvasId, wrapId, ad, dataInicioAd,
        state._aditivoCharts[ad.id] || null
      );
    });
  });
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
    `<div class="stat-card"><span class="stat-label" style="${LS}">Esta Medição</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>`;
  if ($('countAll'))  $('countAll').textContent  = money(vc);
  if ($('countDone')) $('countDone').textContent = money(ac);
  if ($('countPct'))  $('countPct').textContent  = pct(p);

  const banner = $('projBanner');
  if (banner) {
    const mn = $('mainProjName');       if (mn) mn.textContent = o?.nomeProjeto || o?.nome || '—';
    const mc = $('mainProjContratada'); if (mc) mc.textContent = o?.contratada || '—';
    const ms = $('mainProjScope');      if (ms) ms.textContent = o?.medicaoAtual || '—';
  }

  renderTable();
  renderCronogramaBox();
  renderCronogramaMensalBox();
  renderAditivosSection();

  // Curva S1 — Índice de Itens
  state._curvaS1 = renderCurvaS1('sCurveChart', 'sCurveScrollWrap', itens, state._curvaS1 || null);

  // Curva S2 — Contrato planejado x executado real
  const temCronoContrato = Array.isArray(o?.cronograma) && o.cronograma.length > 0;
  const temExecContrato  = Array.isArray(o?.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const sCurvePanel = $('sCurveAditivoPanel');
  if (sCurvePanel) sCurvePanel.style.display = (temCronoContrato || temExecContrato) ? '' : 'none';
  if (temCronoContrato || temExecContrato) {
    state._curvaS2 = renderCurvaS2('sCurveAditivoChart', 'sCurveAditivoScrollWrap', o, state._curvaS2 || null);
  }

  // Curvas S dos Aditivos
  renderAditivosCurvas();

  // Curvas S por Serviço ← NOVO
  renderCurvasPorServico('curvasPorServicoContainer', o, 'colab');

  // Banner de status do cronograma
  const cronoStatus = $('cronoStatus');
  if (cronoStatus) {
    if (temCronoContrato && o?.dataInicio) {
      const nMeses   = o.cronograma.length;
      const dataFim  = calcDataFim(o.dataInicio, nMeses);
      const diasRestantes = dataFim
        ? Math.ceil((new Date(dataFim + 'T00:00:00') - new Date()) / 86400000)
        : null;
      if (diasRestantes !== null) {
        const cor  = diasRestantes < 0 ? 'var(--danger)' : diasRestantes < 30 ? '#f59e0b' : 'var(--success)';
        const txt  = diasRestantes < 0
          ? `⚠️ Prazo vencido há ${Math.abs(diasRestantes)} dias`
          : diasRestantes === 0
          ? '🏁 Término hoje'
          : `🗓️ ${diasRestantes} dias restantes`;
        cronoStatus.innerHTML = `<span style="color:${cor};font-weight:600">${txt}</span>`;
      } else { cronoStatus.innerHTML = ''; }
    } else { cronoStatus.innerHTML = ''; }
  }
}
