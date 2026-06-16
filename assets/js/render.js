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

/**
 * _renderCurvaServico
 *
 * Quando dados.execAcum[] está disponível (cronogramaItensExecucao importado),
 * plota a LINHA REAL mês a mês (com null para meses futuros).
 * Caso contrário, plota apenas 1 ponto no mês atual (comportamento legado).
 */
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

  // Verifica se temos a linha real mês a mês
  const temLinhaReal = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);

  let execData;
  if (temLinhaReal) {
    // Linha real completa mês a mês (null para meses futuros)
    execData = execAcum.slice();
  } else {
    // Fallback legado: 1 ponto no mês atual
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
        // Ponto único (sem linha) quando não há cronograma de execução
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

function _servicoCardHTML(dados, canvasId, wrapId, isOpen) {
  const { descricao, item, execAcumPct, execAcumValor, valorContrato, planAcum, planValorAcum, mesAtualIdx, status, execAcum } = dados;
  const planAteAgora = (mesAtualIdx >= 0 && planAcum[mesAtualIdx] != null) ? planAcum[mesAtualIdx] : 0;
  const planValorAteAgora = (mesAtualIdx >= 0 && planValorAcum && planValorAcum[mesAtualIdx] != null) ? planValorAcum[mesAtualIdx] : 0;
  const desvio = +(execAcumPct - planAteAgora).toFixed(2);
  const desvioColor = desvio >= 0 ? '#10b981' : '#ef4444';
  const desvioSinal = desvio >= 0 ? '+' : '';
  const temDados = valorContrato > 0 || planAcum.some(v => v > 0);
  // Indica se já tem execução real mês a mês
  const temLinhaReal = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);
  const execBadge = temLinhaReal
    ? `<span style="font-size:.68rem;background:rgba(16,185,129,.12);color:#10b981;padding:.1rem .4rem;border-radius:4px;margin-left:.3rem">\u{1F4C8} Real mês a mês</span>`
    : '';

  return `
  <div class="servico-card" style="border:1px solid var(--border,#e2e8f0);border-radius:10px;margin-bottom:.75rem;overflow:hidden;background:var(--surface,#fff)">
    <button
      class="servico-card-header"
      aria-expanded="${isOpen}"
      style="width:100%;display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:none;border:none;cursor:pointer;text-align:left;transition:background .15s"
      onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded')==='true'?'false':'true'); this.nextElementSibling.style.display = this.getAttribute('aria-expanded')==='true' ? '' : 'none';"
    >
      <span style="font-size:.7rem;font-weight:700;color:var(--text-muted,#64748b);min-width:1.8rem">${esc(String(item))}</span>
      <span style="flex:1;font-size:.82rem;font-weight:600;color:var(--text,#0f172a)">${esc(descricao)}${execBadge}</span>
      ${_statusBadge(status)}
      <span style="font-size:.78rem;color:var(--text-muted,#64748b);white-space:nowrap">${execAcumPct.toFixed(1)}% exec.</span>
      <span style="font-size:.9rem;transition:transform .2s;display:inline-block">${isOpen ? '\u25B2' : '\u25BC'}</span>
    </button>
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

/**
 * renderCurvasPorServico
 *
 * Agora recebe obra.cronogramaItensExecucao (real mês a mês) e
 * passa para buildCurvaServico como 6º parâmetro.
 * O mês de referência usa obra.dataEmissaoExecucao (da planilha real),
 * com fallback para obra.dataEmissao (planilha prevista).
 */
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

  // Mês de referência: usa o dataEmissao da planilha real (execução)
  // com fallback para o dataEmissao da planilha prevista
  const dataEmissaoRef = obra?.dataEmissaoExecucao || obra?.dataEmissao || null;

  // Mapeia itens de execução mensal por item para lookup rápido
  const execMensalMap = {};
  itensExecMensal.forEach(it => {
    execMensalMap[String(it.item).trim()] = it;
  });

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
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${totalMeses} meses</strong> importados${nServicos ? ` · <strong style="color:var(--text)">${nServicos} serviços</strong>` : ''}</div>
       ${dataFimStr ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} Término previsto: <strong>${dataFimStr}</strong></div>` : ''}
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
      ? ` · Emissão: <strong>${String(o.dataEmissaoExecucao.mes).padStart(2,'0')}/${o.dataEmissaoExecucao.ano}</strong>`
      : '';
    box.innerHTML =
      `<div style="font-size:.8rem;color:var(--text-muted)">\u{1F4C8} <strong style="color:var(--text)">${o.cronogramaExecucao.length} meses</strong> importados${emissaoTxt}</div>
       ${temItens ? `<div style="font-size:.75rem;color:var(--text-muted)">\u{1F4CA} <strong style="color:var(--text)">${o.cronogramaItensExecucao.length} serviços</strong> com execução real mês a mês</div>` : ''}
       <button id="removeCronogramaMensalBtn" class="btn btn-danger" style="width:100%;margin-top:.5rem;font-size:.8rem">\u{1F5D1} Remover</button>`;
  } else {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma mensal importado.</p>';
  }
  const removeBtn = $('removeCronogramaMensalBtn');
  if (removeBtn) removeBtn.onclick = async () => {
    if (!confirm('Remover o cronograma mensal desta obra?')) return;
    delete o.cronogramaExecucao;
    delete o.cronogramaItensExecucao;
    delete o.dataEmissaoExecucao;
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
          <button data-aditivo-action="remover" data-aditivo-id="${ad.id}" class="btn btn-danger" style="padding:.25rem .45rem;font-size:.75rem">\u{1F5D1}</button>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button data-aditivo-action="previsto" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${temPrevisto ? `\u2705 Previsto (${nP}m)` : '\u{1F4CA} Importar Previsto'}
          </button>
          <button data-aditivo-action="mensal" data-aditivo-id="${ad.id}" class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.3rem .4rem">
            ${temMensal ? `\u2705 Mensal (${nM}m)` : '\u{1F4C8} Importar Mensal'}
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
        ${dataFimStr ? `<span style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} Término: <strong>${dataFimStr}</strong></span>` : ''}
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
  if ($('mainProjName'))       $('mainProjName').textContent       = o?.nomeProjeto || o?.nome || '-';
  if ($('mainProjContratada')) $('mainProjContratada').textContent = o?.contratada || '-';
  if ($('mainProjScope'))      $('mainProjScope').textContent      = o?.medicaoAtual || '-';

  state.chartUser = renderCurvaS1('sCurveChart', 'sCurveScrollWrap', itens, state.chartUser);

  const temCrono  = Array.isArray(o?.cronograma)         && o.cronograma.length         > 0;
  const temMensal = Array.isArray(o?.cronogramaExecucao) && o.cronogramaExecucao.length > 0;
  const panelS2   = $('sCurveAditivoPanel');

  if (temCrono && temMensal) {
    if (panelS2) panelS2.style.display = '';
    requestAnimationFrame(() => {
      state.chartUser2 = renderCurvaS2('sCurveAditivoChart', 'sCurveAditivoScrollWrap', o, state.chartUser2);
    });
  } else {
    if (panelS2) panelS2.style.display = 'none';
    if (state.chartUser2) { try { state.chartUser2.destroy(); } catch(_){} state.chartUser2 = null; }
  }

  renderAditivosCurvas();
  renderCurvasPorServico('curvasPorServicoContainer', o, 'colab');

  const cronoStatus = $('cronoStatus');
  if (cronoStatus) {
    if (temCrono && o?.dataInicio) {
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
          ? '\u{1F3C1} Término hoje'
          : `\u{1F5D3}\uFE0F ${diasRestantes} dias restantes`;
        cronoStatus.innerHTML = `<span style="color:${cor};font-weight:600">${txt}</span>`;
      } else { cronoStatus.innerHTML = ''; }
    } else { cronoStatus.innerHTML = ''; }
  }
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
    if (!idToDelete || !confirm(`Remover "${obraNome}"? Esta ação pode ser desfeita pelo administrador.`)) return;
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
  renderAditivosSection();
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
         ${u.blocked ? '<span style="margin-left:.5rem;font-size:.7rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.1rem .4rem;border-radius:999px">\u{1F512} Bloqueado</span>' : ''}
         <br><small style="color:var(--text-muted)">${esc(u.email)}</small></div>
       <div style="display:flex;gap:.4rem;flex-wrap:wrap">
         <button class="btn ${u.blocked ? 'btn-success' : 'btn-warning'}" style="padding:.3rem .65rem;font-size:.72rem" onclick="toggleBloqueio('${uid}',${u.blocked})">${u.blocked ? '\u2705 Desbloquear' : '\u{1F512} Bloquear'}</button>
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
  const temCrono   = Array.isArray(obra.cronograma)         && obra.cronograma.length         > 0;
  const temMensal  = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const nAditivos  = Array.isArray(obra.aditivos) ? obra.aditivos.length : 0;
  return `<div class="obra-card" style="cursor:pointer" onclick="adminSelectObra('${obra.id}')">
    <div class="obra-card-header">
      <div><div class="obra-card-title">${esc(obra.nome || 'Sem nome')}</div>
      <div class="obra-card-sub">${it.length} itens | Aba: ${esc(obra.medicaoAtual || '-')}${temCrono ? ' | \u{1F4C5} Cronograma' : ''}${temMensal ? ' | \u{1F4C8} Mensal' : ''}${nAditivos > 0 ? ` | \u{1F4CB} ${nAditivos} aditivo${nAditivos>1?'s':''}` : ''}</div></div>
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
  if (!obra) { panel.innerHTML = html + '<p style="color:var(--text-muted)">Obra não encontrada.</p>'; return; }
  const it      = Array.isArray(obra.itens) ? obra.itens : [];
  const vc      = Number(obra.resumo?.valorContratoAditivo) || it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac      = Number(obra.resumo?.acumuladoTotal)       || it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const estaMed = Number(obra.resumo?.estaMedicao)          || it.reduce((a,i)=>a+Number(i.medicao||0),0);
  const p       = calcPctGeral(obra.resumo, it);
  const saldo   = vc - ac;
  const dataInicioStr = fmtDate(obra.dataInicio);
  const totalMeses    = Array.isArray(obra.cronograma) ? obra.cronograma.length : 0;
  const dataFimISO    = calcDataFim(obra.dataInicio, totalMeses);
  const dataFimStr    = dataFimISO ? fmtDate(dataFimISO) : '-';
  const temMensal     = Array.isArray(obra.cronogramaExecucao) && obra.cronogramaExecucao.length > 0;
  const temCrono      = Array.isArray(obra.cronograma)         && obra.cronograma.length         > 0;
  const LS   = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS   = 'font-size:.95rem;font-weight:700;margin-top:.15rem';
  const VSSM = 'font-size:.82rem;font-weight:700;margin-top:.15rem;word-break:break-word';

  const curvaS2HTML = (temCrono && temMensal)
    ? `<div class="panel" style="margin-bottom:1.5rem">
         <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 Cronograma Físico-Financeiro (Contrato)</h3>
         <div class="chart-scroll-wrap" id="adminCurvaSAditivoWrap"><div class="chart-container"><canvas id="adminCurvaSAditivo"></canvas></div></div>
       </div>`
    : '';

  const aditivos = Array.isArray(obra.aditivos) ? obra.aditivos : [];
  let nContrato = totalMeses;
  let dataInicioBase = calcDataInicioProximo(obra.dataInicio, nContrato);
  const aditivosHTML = aditivos.filter(ad =>
    (Array.isArray(ad.cronograma) && ad.cronograma.length > 0) ||
    (Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length > 0)
  ).map(ad => {
    const nP = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    const canvasId = `adminCurvaS_ad_${ad.id}`;
    const wrapId   = `adminCurvaS_wrap_${ad.id}`;
    const di       = dataInicioBase;
    dataInicioBase = calcDataInicioProximo(dataInicioBase, nP) || dataInicioBase;
    const dataFimAd = (nP && di) ? fmtDate(calcDataFim(di, nP)) : null;
    return `<div class="panel" style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="font-size:.95rem;font-weight:700;margin:0">Curva S \u2014 ${esc(ad.nome || 'Aditivo')}</h3>
        ${dataFimAd ? `<span style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} Término: <strong>${dataFimAd}</strong></span>` : ''}
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}"><div class="chart-container"><canvas id="${canvasId}"></canvas></div></div>
    </div>`;
  }).join('');

  html +=
    `<div class="admin-stats-grid">
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Contratada</span><span class="stat-value" style="${VSSM}">${esc(obra.contratada||'-')}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Esta Medição</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\u{1F4C5} Início</span><span class="stat-value" style="${VS}">${dataInicioStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">\u{1F3C1} Término</span><span class="stat-value" style="${VS}">${dataFimStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Saldo</span><span class="stat-value" style="${VS}">${money(saldo)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     </div>
     <div class="panel" style="margin-bottom:1.5rem">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S \u2014 Índice de Itens</h3>
       <div class="chart-scroll-wrap" id="adminCurvaSwrap"><div class="chart-container"><canvas id="adminCurvaS"></canvas></div></div>
     </div>
     ${curvaS2HTML}
     ${aditivosHTML}
     <div class="panel">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Índice de Itens</h3>
       <div class="table-container"><table class="admin-table">
         <thead><tr>
           <th class="th-sticky" data-label="ITEM"></th>
           <th class="th-sticky" data-label="DESCRIÇÃO"></th>
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

  let dataInicioBaseCharts = calcDataInicioProximo(obra.dataInicio, totalMeses);
  requestAnimationFrame(() => {
    state.chartAdmin = renderCurvaS1('adminCurvaS', 'adminCurvaSwrap', it, state.chartAdmin);
    if (temCrono && temMensal) {
      state.chartAdmin2 = renderCurvaS2('adminCurvaSAditivo', 'adminCurvaSAditivoWrap', obra, state.chartAdmin2);
    }
    aditivos.forEach(ad => {
      const nP = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
      if (!nP && !(Array.isArray(ad.cronogramaExecucao) && ad.cronogramaExecucao.length)) return;
      const di = dataInicioBaseCharts;
      dataInicioBaseCharts = calcDataInicioProximo(dataInicioBaseCharts, nP) || dataInicioBaseCharts;
      renderCurvaS2Aditivo(`adminCurvaS_ad_${ad.id}`, `adminCurvaS_wrap_${ad.id}`, ad, di, null);
    });
  });
}

export function renderAdminViews() { renderAdminStats(); renderAdminSidebar(); renderColabList(); }
