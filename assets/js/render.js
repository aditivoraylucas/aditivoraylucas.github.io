import { $, state, esc, money, pct, calcPctGeral, buildCronogramaTimeline, buildCurvaServico, showToast } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { setObraIdNaUrl, limparObraIdDaUrl } from './url-state.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function saveObra(obra) {
  if (!state.user?.uid) return;
  await setDoc(doc(db, 'users', state.user.uid, 'obras', obra.id), obra);
}

export async function deleteObra(id) {
  if (!state.user?.uid) return;
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
  if (precisaSalvar && state.user?.uid) await saveObra(o);
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
            title: items => `\u{1F4C5} ${items[0].label}`,
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
              const icon = dev >= 0 ? '\u2705' : '\u26A0\uFE0F';
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

  const { labels, planAcum, execAcum, execAcumPct, mesAtualIdx, mesesDecorridos } = dados;
  const n = labels.length;
  if (!n) return prevChart;

  const temLinhaReal = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);

  let execData;
  if (temLinhaReal) {
    execData = execAcum.slice();
  } else {
    execData = new Array(n).fill(null);
    if (mesesDecorridos > 0 && mesAtualIdx >= 0 && execAcumPct > 0) {
      execData[mesAtualIdx] = execAcumPct;
    }
  }

  const execDataset = temLinhaReal
    ? {
        label: 'Executado Real (%)',
        data: execData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.08)',
        borderWidth: 2.5,
        pointRadius: mobile ? 2 : 3,
        pointBackgroundColor: '#10b981',
        tension: 0.35,
        fill: false,
        spanGaps: false
      }
    : {
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
      };

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
        execDataset
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
            title: items => `\u{1F4C5} ${items[0].label}`,
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
              const icon = dev >= 0 ? '\u2705' : '\u26A0\uFE0F';
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
    adiantado:   { icon: '\u{1F680}', label: 'Adiantado',   bg: 'rgba(99,102,241,.15)',  color: '#6366f1' },
    atrasado:    { icon: '\u26A0\uFE0F', label: 'Atrasado',    bg: 'rgba(239,68,68,.15)',   color: '#ef4444' },
    nao_iniciado:{ icon: '\u23F3', label: 'Não iniciado', bg: 'rgba(100,116,139,.12)', color: '#64748b' }
  };
  const c = cfg[status] || cfg.nao_iniciado;
  return `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .6rem;border-radius:999px;font-size:.72rem;font-weight:600;background:${c.bg};color:${c.color}">${c.icon} ${c.label}</span>`;
}

/* ── _anomaliasBadgesHTML ─────────────────────────────────────────────────────
 * Renderiza os alertas de anomalia abaixo do header do card de serviço.
 * Cada anomalia tem uma cor e ícone conforme severidade.
 */
function _anomaliasBadgesHTML(anomalias) {
  if (!Array.isArray(anomalias) || !anomalias.length) return '';
  const cfgSev = {
    alerta: { bg: 'rgba(239,68,68,.1)',    border: 'rgba(239,68,68,.35)',    color: '#dc2626', icon: '🚨' },
    aviso:  { bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.35)',   color: '#d97706', icon: '⚠️' }
  };
  return `<div style="display:flex;flex-wrap:wrap;gap:.35rem;padding:.4rem 1rem .5rem;border-top:1px dashed var(--border,#e2e8f0)">
    ${anomalias.map(a => {
      const c = cfgSev[a.severidade] || cfgSev.aviso;
      return `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .65rem;border-radius:6px;font-size:.72rem;font-weight:500;background:${c.bg};border:1px solid ${c.border};color:${c.color}">${c.icon} ${esc(a.mensagem)}</span>`;
    }).join('')}
  </div>`;
}

function _servicoCardHTML(dados, canvasId, wrapId, isOpen) {
  const { descricao, item, execAcumPct, execAcumValor, valorContrato, planAcum, planValorAcum, mesAtualIdx, status, execAcum, anomalias } = dados;
  const planAteAgora = (mesAtualIdx >= 0 && planAcum[mesAtualIdx] != null) ? planAcum[mesAtualIdx] : 0;
  const planValorAteAgora = (mesAtualIdx >= 0 && planValorAcum && planValorAcum[mesAtualIdx] != null) ? planValorAcum[mesAtualIdx] : 0;
  const desvio = +(execAcumPct - planAteAgora).toFixed(2);
  const desvioColor = desvio >= 0 ? '#10b981' : '#ef4444';
  const desvioSinal = desvio >= 0 ? '+' : '';
  const temDados = valorContrato > 0 || planAcum.some(v => v > 0);
  const temLinhaReal = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);
  const execBadge = temLinhaReal
    ? `<span style="font-size:.68rem;background:rgba(16,185,129,.12);color:#10b981;padding:.1rem .4rem;border-radius:4px;margin-left:.3rem">\u{1F4C8} Real mês a mês</span>`
    : '';
  const temAnomalias = Array.isArray(anomalias) && anomalias.length > 0;
  // Ícone de atenção no header quando há anomalia
  const anomaliaHeaderBadge = temAnomalias
    ? `<span title="${anomalias.length} alerta(s) de cronograma" style="font-size:.82rem;cursor:default">🚨</span>`
    : '';

  return `
  <div class="servico-card" style="border:1px solid ${temAnomalias ? 'rgba(239,68,68,.45)' : 'var(--border,#e2e8f0)'};border-radius:10px;margin-bottom:.75rem;overflow:hidden;background:var(--surface,#fff)">
    <button
      class="servico-card-header"
      aria-expanded="${isOpen}"
      style="width:100%;display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:none;border:none;cursor:pointer;text-align:left;transition:background .15s"
      onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded')==='true'?'false':'true'); this.nextElementSibling.style.display = this.getAttribute('aria-expanded')==='true' ? '' : 'none';"
    >
      <span style="font-size:.7rem;font-weight:700;color:var(--text-muted,#64748b);min-width:1.8rem">${esc(String(item))}</span>
      <span style="flex:1;font-size:.82rem;font-weight:600;color:var(--text,#0f172a)">${esc(descricao)}${execBadge}</span>
      ${anomaliaHeaderBadge}
      ${_statusBadge(status)}
      <span style="font-size:.78rem;color:var(--text-muted,#64748b);white-space:nowrap">${execAcumPct.toFixed(1)}% exec.</span>
      <span style="font-size:.9rem;transition:transform .2s;display:inline-block">${isOpen ? '\u25B2' : '\u25BC'}</span>
    </button>
    ${temAnomalias ? _anomaliasBadgesHTML(anomalias) : ''}
    <div style="display:${isOpen ? '' : 'none'}">
      ${temDados ? `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;padding:.5rem 1rem .25rem;border-top:1px solid var(--border,#e2e8f0)">
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Planejado até hoje (%):</span> ${planAteAgora.toFixed(1)}%
        </div>
        <div style="font-size:.75rem;color:var(--text-muted)">
          <span style="font-weight:600;color:var(--text)">Planejado até hoje (R$):</span> ${money(planValorAteAgora)}
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

  const itensCrono      = Array.isArray(obra?.cronogramaItens)         ? obra.cronogramaItens         : [];
  const itensExecMensal = Array.isArray(obra?.cronogramaItensExecucao) ? obra.cronogramaItensExecucao : [];
  const itensExecucao   = Array.isArray(obra?.itens)                   ? obra.itens                   : [];
  const totalMeses      = Array.isArray(obra?.cronograma)              ? obra.cronograma.length       : 0;
  const dataInicio      = obra?.dataInicio || null;
  const dataEmissaoRef  = obra?.dataEmissaoExecucao || obra?.dataEmissao || null;

  const execMensalMap = {};
  itensExecMensal.forEach(it => { execMensalMap[String(it.item).trim()] = it; });

  const painel = $('curvasPorServicoPanel');
  const badge  = $('curvasPorServicoBadge');
  if (!itensCrono.length || !totalMeses || !dataInicio) {
    if (painel) painel.style.display = 'none';
    return;
  }
  if (painel) painel.style.display = '';
  if (badge) {
    const temReal = itensExecMensal.length > 0;
    badge.textContent = `${itensCrono.length} serviços${temReal ? ' • Real mês a mês' : ''}`;
  }

  let html = '';
  itensCrono.forEach((itemCrono, idx) => {
    const canvasId = `${prefix}_servico_canvas_${idx}`;
    const wrapId   = `${prefix}_servico_wrap_${idx}`;
    const isOpen   = idx === 0;
    const itemExecMensal = execMensalMap[String(itemCrono.item).trim()] || null;
    const dados = buildCurvaServico(
      dataInicio, itemCrono, itensExecucao, totalMeses, dataEmissaoRef, itemExecMensal
    );
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
    const itemCrono      = itensCrono[idx];
    const canvasId       = `${prefix}_servico_canvas_${idx}`;
    const wrapId         = `${prefix}_servico_wrap_${idx}`;
    const itemExecMensal = execMensalMap[String(itemCrono.item).trim()] || null;
    const dados = buildCurvaServico(
      dataInicio, itemCrono, itensExecucao, totalMeses, dataEmissaoRef, itemExecMensal
    );
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
   DEMAIS FUNÇÕES
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
    const p = Number(r.percent