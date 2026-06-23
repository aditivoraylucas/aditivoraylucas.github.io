import { $, state, esc, money, pct } from './state.js';

/* ============================================================
   UTILITÁRIO — corta a cauda vazia do executado

   Lógica de REPETIÇÃO DO ACUMULADO (mais robusta que > 0):
     - Percorre do fim para o início.
     - Enquanto o valor for igual ao anterior (acumulado parou
       de crescer) E essa repetição se estende até o último
       elemento → é cauda vazia → vira null.
     - Para quando encontra um valor que CRESCEU em relação
       ao seguinte → esse é o último mês real.
     - Buracos NO MEIO são preservados: a repetição só é
       considerada "cauda" se persistir até o fim do array.
     - Planejado NUNCA é passado aqui — exibe todos os meses.
   ============================================================ */
function _cortarExecCauda(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;

  const out = arr.slice();
  const n   = out.length;

  // Encontra o índice do último valor não-nulo
  let ultimoReal = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (out[i] !== null && out[i] !== undefined) { ultimoReal = i; break; }
  }
  if (ultimoReal < 0) return out; // tudo null → devolve como está

  // Percorre da cauda para o início:
  // Enquanto o valor atual === valor do próximo (acumulado repetindo),
  // substitui por null — pois o cronograma parou.
  // Para quando o valor cresce (mês com execução real).
  let corte = ultimoReal; // índice do último mês a manter
  for (let i = ultimoReal; i > 0; i--) {
    const curr = out[i];
    const prev = out[i - 1];
    if (curr === prev || (curr !== null && prev !== null && Math.abs(Number(curr) - Number(prev)) < 0.001)) {
      // acumulado repetiu → candidato a corte
      corte = i - 1;
    } else {
      // acumulado cresceu → este é o limite real
      break;
    }
  }

  // Anula tudo após o índice de corte
  for (let i = corte + 1; i < n; i++) out[i] = null;
  return out;
}

/* ============================================================
   CURVA S1 — Índice de Itens (barras)
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

export function renderCurvaS(canvasId, wrapId, itens, prev) {
  return renderCurvaS1(canvasId, wrapId, itens, prev);
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

function _tooltipDesvio(dark) {
  return {
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
  };
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

  // ── PLANEJADO: todos os meses, sem corte algum ───────────────
  const labels = Array.from({ length: n }, (_, i) => labelMes(i + 1));
  let acumPlan = 0;
  const planAcum = cronograma.map(s => {
    acumPlan += +Number(s?.planejadoPct || 0).toFixed(4);
    return +Math.min(acumPlan, 100).toFixed(2);
  });

  // ── EXECUTADO: acumula → corta cauda por repetição ──────────
  // Só preenche o índice se o acumulado cresceu (delta > 0).
  // Meses com delta = 0 ficam com o mesmo valor acumulado do anterior,
  // o que a lógica de repetição detecta e anula na cauda.
  const execAcumRaw = new Array(n).fill(null);
  let acumExec = 0;
  const lenExec = Math.min(cronogramaExecucao.length, n);
  for (let i = 0; i < lenExec; i++) {
    const delta = Number(cronogramaExecucao[i]?.executadoPct) || 0;
    acumExec += delta;
    execAcumRaw[i] = +Math.min(acumExec, 100).toFixed(2);
  }
  // Aplica corte por repetição — só no executado
  const execAcum = _cortarExecCauda(execAcumRaw);

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Planejado \u2014 ${titulo} (%)`,
          data: planAcum,             // planejado completo — todos os meses
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.06)',
          borderWidth: 2.5,
          pointRadius: mobile ? 2 : 3,
          pointBackgroundColor: '#f59e0b',
          tension: 0.35,
          fill: false,
          spanGaps: false
        },
        {
          label: 'Executado Real (%)',
          data: execAcum,             // executado com cauda cortada
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2.5,
          pointRadius: mobile ? 2 : 4,
          pointBackgroundColor: '#10b981',
          tension: 0.35,
          fill: false,
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
          ticks: { color: tc, font: { size: mobile ? 8 : 10 }, maxRotation: mobile ? 90 : 45 }
        }
      },
      plugins: {
        legend: {
          labels: { color: tc, font: { size: mobile ? 9 : 11 }, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: _tooltipDesvio(dark)
      }
    }
  });
}

/* ============================================================
   CURVA S POR SERVIÇO — gráfico individual
   ATENÇÃO: buildCurvaServico (state.js) já entrega execAcum
   com a cauda cortada. NÃO aplicar _cortarExecCauda aqui
   de novo para evitar duplo corte.
   ============================================================ */
export function renderCurvaServico(canvasId, wrapId, dados, prevChart, dadosAnterior) {
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

  // execAcum já vem cortado de buildCurvaServico — usa direto
  const temLinhaReal = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);
  let execData;
  let pontoIdx;
  if (temLinhaReal) {
    execData = execAcum; // já cortado em state.js — sem duplo corte
  } else {
    execData = new Array(n).fill(null);
    pontoIdx = Math.min(mesesDecorridos, n - 1);
    if (pontoIdx > 0 && execAcumPct > 0) execData[pontoIdx] = execAcumPct;
  }

  const hojeIdx = temLinhaReal
    ? (mesesDecorridos > 0 && mesAtualIdx >= 0 ? mesAtualIdx : null)
    : (pontoIdx > 0 ? pontoIdx : null);

  const execDataset = temLinhaReal
    ? { label: 'Executado Real (%)', data: execData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 2.5, pointRadius: mobile ? 2 : 3, pointBackgroundColor: '#10b981', tension: 0.35, fill: false, spanGaps: false }
    : { label: 'Executado Acum. (%)', data: execData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.9)', borderWidth: 0, pointRadius: mobile ? 5 : 7, pointBackgroundColor: '#10b981', pointBorderColor: '#fff', pointBorderWidth: 2, showLine: false, spanGaps: false };

  const datasets = [
    // planAcum: planejado completo, sem corte
    { label: 'Planejado (%)', data: planAcum, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 2, pointRadius: mobile ? 1.5 : 2.5, pointBackgroundColor: '#f59e0b', tension: 0.35, fill: false },
    execDataset
  ];

  if (dadosAnterior) {
    const execAcumAnt = Array.isArray(dadosAnterior.execAcum) ? dadosAnterior.execAcum : [];
    const antData     = new Array(n).fill(null);
    for (let i = 0; i < execAcumAnt.length && i < n; i++) {
      antData[i] = execAcumAnt[i] !== null ? execAcumAnt[i] : null;
    }
    const temAntDados = antData.some(v => v !== null && v > 0);
    if (temAntDados) {
      const emissaoAnt = dadosAnterior.emissaoLabel || 'Vers\u00e3o anterior';
      // antData já vem de dados históricos já processados — aplica corte por repetição
      datasets.splice(1, 0, {
        label: `Exec. anterior (${emissaoAnt})`,
        data: _cortarExecCauda(antData),
        borderColor: dark ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.45)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.35,
        fill: false,
        spanGaps: false
      });
    }
  }

  const hojeAnnotation = hojeIdx !== null ? {
    type: 'line', scaleID: 'x', value: hojeIdx,
    borderColor: 'rgba(239,68,68,0.6)', borderWidth: 1.5, borderDash: [4, 4],
    label: { display: true, content: 'Hoje', position: 'start', backgroundColor: '#ef4444', color: '#fff', font: { size: 9 }, padding: { x: 4, y: 2 }, borderRadius: 3 }
  } : null;

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: gc }, ticks: { color: tc, callback: v => v + '%', font: { size: mobile ? 9 : 11 } } },
        x: { grid: { display: false }, ticks: { color: tc, font: { size: mobile ? 7 : 9 }, maxRotation: mobile ? 90 : 45 } }
      },
      plugins: {
        legend: { labels: { color: tc, font: { size: mobile ? 9 : 10 }, usePointStyle: true, pointStyleWidth: 8 } },
        annotation: hojeAnnotation ? { annotations: { hojeServico: hojeAnnotation } } : {},
        tooltip: _tooltipDesvio(dark)
      }
    }
  });
}

/* ============================================================
   INDICADOR DE ÚLTIMA ATUALIZAÇÃO MENSAL
   ============================================================ */
export function renderIndicadorAtualizacao(containerId, obra) {
  const el = $(containerId); if (!el) return;
  const emissao   = obra?.dataEmissaoExecucao;
  const historico = Array.isArray(obra?.historicoExecucao) ? obra.historicoExecucao : [];
  if (!emissao) { el.innerHTML = ''; return; }

  const mesLabel = new Date(emissao.ano, emissao.mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const histLabel = historico.length > 0
    ? `<span style="font-size:.7rem;color:var(--text-muted,#64748b);margin-left:.5rem">\u{1F4DA} ${historico.length} vers\u00e3o(\u00f5es) anteriores salvas</span>`
    : '';

  el.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .75rem;border-radius:999px;
      background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);font-size:.75rem;font-weight:600;color:#10b981">
      \u{1F501} Atualizado: ${mesLabel}
    </div>${histLabel}`;
}
