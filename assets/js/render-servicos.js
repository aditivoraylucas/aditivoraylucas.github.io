import { $, state, esc, money, buildCurvaServico } from './state.js';
import { renderCurvaServico } from './render-charts.js';

function _statusBadge(status) {
  const cfg = {
    em_dia:       { icon: '\u2705',         label: 'Em dia',       bg: 'rgba(16,185,129,.15)',  color: '#10b981' },
    adiantado:    { icon: '\u{1F680}',      label: 'Adiantado',    bg: 'rgba(99,102,241,.15)',  color: '#6366f1' },
    atrasado:     { icon: '\u26A0\uFE0F',   label: 'Atrasado',     bg: 'rgba(239,68,68,.15)',   color: '#ef4444' },
    nao_iniciado: { icon: '\u23F3',         label: 'N\u00e3o iniciado', bg: 'rgba(100,116,139,.12)', color: '#64748b' }
  };
  const c = cfg[status] || cfg.nao_iniciado;
  return `<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .6rem;border-radius:999px;font-size:.72rem;font-weight:600;background:${c.bg};color:${c.color}">${c.icon} ${c.label}</span>`;
}

function _anomaliasBadgesHTML(anomalias) {
  if (!Array.isArray(anomalias) || !anomalias.length) return '';
  const cfgSev = {
    alerta: { bg: 'rgba(239,68,68,.1)',  border: 'rgba(239,68,68,.35)',  color: '#dc2626', icon: '\ud83d\udea8' },
    aviso:  { bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.35)', color: '#d97706', icon: '\u26a0\ufe0f' }
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
  const planAteAgora      = (mesAtualIdx >= 0 && planAcum[mesAtualIdx]      != null) ? planAcum[mesAtualIdx]      : 0;
  const planValorAteAgora = (mesAtualIdx >= 0 && planValorAcum?.[mesAtualIdx] != null) ? planValorAcum[mesAtualIdx] : 0;
  const desvio      = +(execAcumPct - planAteAgora).toFixed(2);
  const desvioColor = desvio >= 0 ? '#10b981' : '#ef4444';
  const desvioSinal = desvio >= 0 ? '+' : '';
  const temLinhaReal   = Array.isArray(execAcum) && execAcum.some(v => v !== null && v > 0);
  const temAnomalias   = Array.isArray(anomalias) && anomalias.length > 0;
  const execBadge      = temLinhaReal ? `<span style="font-size:.68rem;background:rgba(16,185,129,.12);color:#10b981;padding:.1rem .4rem;border-radius:4px;margin-left:.3rem">\u{1F4C8} Real m\u00eas a m\u00eas</span>` : '';
  const anomaliaBadge  = temAnomalias ? `<span title="${anomalias.length} alerta(s) de cronograma" style="font-size:.82rem;cursor:default">\ud83d\udea8</span>` : '';
  const bordaCard      = temAnomalias ? 'rgba(239,68,68,.45)' : 'var(--border,#e2e8f0)';

  return `
  <div class="servico-card" style="border:1px solid ${bordaCard};border-radius:10px;margin-bottom:.75rem;overflow:hidden;background:var(--surface,#fff)">
    <button class="servico-card-header" aria-expanded="${isOpen}"
      style="width:100%;display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:none;border:none;cursor:pointer;text-align:left;transition:background .15s"
      onclick="this.setAttribute('aria-expanded',this.getAttribute('aria-expanded')==='true'?'false':'true');this.nextElementSibling.style.display=this.getAttribute('aria-expanded')==='true'?'':'none';"
    >
      <span style="font-size:.7rem;font-weight:700;color:var(--text-muted,#64748b);min-width:1.8rem">${esc(String(item))}</span>
      <span style="flex:1;font-size:.82rem;font-weight:600;color:var(--text,#0f172a)">${esc(descricao)}${execBadge}</span>
      ${anomaliaBadge}${_statusBadge(status)}
      <span style="font-size:.78rem;color:var(--text-muted,#64748b);white-space:nowrap">${execAcumPct.toFixed(1)}% exec.</span>
      <span style="font-size:.9rem;transition:transform .2s;display:inline-block">${isOpen ? '\u25B2' : '\u25BC'}</span>
    </button>
    ${temAnomalias ? _anomaliasBadgesHTML(anomalias) : ''}
    <div style="display:${isOpen ? '' : 'none'}">
      <div style="display:flex;gap:1rem;flex-wrap:wrap;padding:.5rem 1rem .25rem;border-top:1px solid var(--border,#e2e8f0)">
        <div style="font-size:.75rem;color:var(--text-muted)"><span style="font-weight:600;color:var(--text)">Planejado at\u00e9 hoje (%):</span> ${planAteAgora.toFixed(1)}%</div>
        <div style="font-size:.75rem;color:var(--text-muted)"><span style="font-weight:600;color:var(--text)">Planejado at\u00e9 hoje (R$):</span> ${money(planValorAteAgora)}</div>
        <div style="font-size:.75rem;color:var(--text-muted)"><span style="font-weight:600;color:var(--text)">Executado:</span> ${execAcumPct.toFixed(1)}%</div>
        <div style="font-size:.75rem"><span style="font-weight:600;color:var(--text)">Desvio:</span> <span style="color:${desvioColor};font-weight:700">${desvioSinal}${desvio}%</span></div>
        <div style="font-size:.75rem;color:var(--text-muted)"><span style="font-weight:600;color:var(--text)">Valor Contrato:</span> ${money(valorContrato)}</div>
        <div style="font-size:.75rem;color:var(--text-muted)"><span style="font-weight:600;color:var(--text)">Acumulado R$:</span> ${money(execAcumValor)}</div>
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}" style="padding:.5rem 1rem 1rem">
        <div class="chart-container" style="height:200px"><canvas id="${canvasId}"></canvas></div>
      </div>
    </div>
  </div>`;
}

/* ── Monta dadosAnterior a partir do histórico mais recente ── */
function _buildDadosAnterior(dataInicio, itemCrono, itensExecucao, totalMeses, historicoExecucao) {
  if (!Array.isArray(historicoExecucao) || !historicoExecucao.length) return null;
  const versaoAnterior = historicoExecucao[historicoExecucao.length - 1];
  if (!versaoAnterior) return null;

  const execMensalMap = {};
  if (Array.isArray(versaoAnterior.cronogramaItensExecucao)) {
    versaoAnterior.cronogramaItensExecucao.forEach(it => {
      execMensalMap[String(it.item).trim()] = it;
    });
  }

  const dados = buildCurvaServico(
    dataInicio, itemCrono, itensExecucao, totalMeses,
    versaoAnterior.dataEmissao || null,
    execMensalMap[String(itemCrono.item).trim()] || null
  );
  if (!dados) return null;

  let emissaoLabel = 'vers\u00e3o anterior';
  if (versaoAnterior.dataEmissao?.mes && versaoAnterior.dataEmissao?.ano) {
    emissaoLabel = new Date(versaoAnterior.dataEmissao.ano, versaoAnterior.dataEmissao.mes - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  return { execAcum: dados.execAcum, emissaoLabel };
}

export function renderCurvasPorServico(containerId, obra, prefix) {
  const container = $(containerId); if (!container) return;
  const chartsKey = `_servicoCharts_${prefix}`;
  if (state[chartsKey]) Object.values(state[chartsKey]).forEach(c => { try { c.destroy(); } catch(_){} });
  state[chartsKey] = {};
  container.innerHTML = '';

  const itensCrono      = Array.isArray(obra?.cronogramaItens)         ? obra.cronogramaItens         : [];
  const itensExecMensal = Array.isArray(obra?.cronogramaItensExecucao) ? obra.cronogramaItensExecucao : [];
  const itensExecucao   = Array.isArray(obra?.itens)                   ? obra.itens                   : [];
  const totalMeses      = Array.isArray(obra?.cronograma)              ? obra.cronograma.length       : 0;
  const dataInicio      = obra?.dataInicio || null;
  const dataEmissaoRef  = obra?.dataEmissaoExecucao || obra?.dataEmissao || null;
  const historicoExecucao = Array.isArray(obra?.historicoExecucao) ? obra.historicoExecucao : [];

  const execMensalMap = {};
  itensExecMensal.forEach(it => { execMensalMap[String(it.item).trim()] = it; });

  const painel = $('curvasPorServicoPanel');
  const badge  = $('curvasPorServicoBadge');
  if (!itensCrono.length || !totalMeses || !dataInicio) { if (painel) painel.style.display = 'none'; return; }
  if (painel) painel.style.display = '';
  if (badge) badge.textContent = `${itensCrono.length} servi\u00e7os${itensExecMensal.length > 0 ? ' \u2022 Real m\u00eas a m\u00eas' : ''}${historicoExecucao.length > 0 ? ' \u2022 \u{1F4DA} hist\u00f3rico' : ''}`;

  let html = '';
  itensCrono.forEach((itemCrono, idx) => {
    const dados = buildCurvaServico(dataInicio, itemCrono, itensExecucao, totalMeses, dataEmissaoRef, execMensalMap[String(itemCrono.item).trim()] || null);
    if (!dados) return;
    html += _servicoCardHTML(dados, `${prefix}_servico_canvas_${idx}`, `${prefix}_servico_wrap_${idx}`, false);
  });
  if (!html) { if (painel) painel.style.display = 'none'; return; }
  container.innerHTML = html;

  function renderNext(idx) {
    if (idx >= itensCrono.length) return;
    const itemCrono = itensCrono[idx];
    const dados = buildCurvaServico(dataInicio, itemCrono, itensExecucao, totalMeses, dataEmissaoRef, execMensalMap[String(itemCrono.item).trim()] || null);
    const cId = `${prefix}_servico_canvas_${idx}`;
    const wId = `${prefix}_servico_wrap_${idx}`;
    if (dados && $(cId)) {
      const dadosAnterior = _buildDadosAnterior(dataInicio, itemCrono, itensExecucao, totalMeses, historicoExecucao);
      state[chartsKey][idx] = renderCurvaServico(cId, wId, dados, state[chartsKey][idx] || null, dadosAnterior);
    }
    requestAnimationFrame(() => renderNext(idx + 1));
  }
  requestAnimationFrame(() => renderNext(0));
}
