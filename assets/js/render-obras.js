import { $, state, esc, money, buildCronogramaTimeline } from './state.js';
import { renderCurvaS2, renderCurvaS2Aditivo, renderIndicadorAtualizacao } from './render-charts.js';

let _importFileFn = () => {};
export function setImportFileFnObras(fn) { _importFileFn = fn; }

/* ── migra aditivos sem id ── */
export function migrarAditivosSemId(obra) {
  if (!Array.isArray(obra?.aditivos)) return;
  obra.aditivos.forEach(a => { if (!a.id) a.id = 'aditivo_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); });
}

/* ══ renderObrasBox ══ */
export function renderObrasBox(obra) {
  const box = $('obrasBox'); if (!box) return;
  if (!obra) { box.innerHTML = '<p style="color:var(--text-muted)">Nenhuma obra selecionada.</p>'; return; }

  const itens    = Array.isArray(obra.itens)    ? obra.itens    : [];
  const resumo   = obra.resumo   || {};
  const aditivos = Array.isArray(obra.aditivos) ? obra.aditivos : [];

  const totalContrato  = itens.reduce((s, i) => s + (Number(i.valorContrato)  || 0), 0);
  const totalAcumulado = itens.reduce((s, i) => s + (Number(i.acumulado)      || 0), 0);
  const totalMedicao   = itens.reduce((s, i) => s + (Number(i.valorMedicao)   || 0), 0);
  const pctGeral       = totalContrato > 0 ? (totalAcumulado / totalContrato * 100).toFixed(2) : '0.00';

  const vca  = Number(resumo.valorContratoAditivo) || totalContrato;
  const acuR = Number(resumo.acumuladoTotal)       || totalAcumulado;
  const pctR = vca > 0 ? (acuR / vca * 100).toFixed(2) : pctGeral;

  const contratada   = esc(obra.contratada   || '\u2014');
  const nomeProjeto  = esc(obra.nomeProjeto  || obra.nome || '\u2014');
  const medicaoAtual = esc(obra.medicaoAtual || '\u2014');

  let aditivosHtml = '';
  if (aditivos.length) {
    aditivosHtml = `<div style="margin-top:.5rem;font-size:.78rem;color:var(--text-muted)">
      <strong>${aditivos.length} aditivo(s):</strong> ${aditivos.map(a => esc(a.nome)).join(' &bull; ')}
    </div>`;
  }

  box.innerHTML = `
  <div style="display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;padding:.25rem 0 .5rem">
    <div><span style="font-size:.7rem;color:var(--text-muted)">Contratada</span><br><strong style="font-size:.88rem">${contratada}</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">Projeto</span><br><strong style="font-size:.88rem">${nomeProjeto}</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">Medi\u00e7\u00e3o Atual</span><br><strong style="font-size:.88rem">${medicaoAtual}</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">Valor Contrato</span><br><strong style="font-size:.88rem">${money(totalContrato)}</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">Acumulado</span><br><strong style="font-size:.88rem;color:#10b981">${money(totalAcumulado)}</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">% Executado</span><br><strong style="font-size:.88rem;color:#6366f1">${pctR}%</strong></div>
    <div><span style="font-size:.7rem;color:var(--text-muted)">Medi\u00e7\u00e3o</span><br><strong style="font-size:.88rem">${money(totalMedicao)}</strong></div>
  </div>${aditivosHtml}`;
}

/* ══ renderCronogramaBox ══ */
export function renderCronogramaBox(obra) {
  const box = $('cronogramaBox'); if (!box) return;
  if (!obra || !Array.isArray(obra.cronograma) || !obra.cronograma.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Nenhum cronograma importado.</p>';
    return;
  }
  const timeline   = buildCronogramaTimeline(obra.dataInicio, obra.cronograma, obra.dataEmissao);
  const emissao    = obra.dataEmissao;
  const emissaoTxt = emissao ? `<span style="font-size:.72rem;color:var(--text-muted);margin-left:.5rem">Emiss\u00e3o: ${String(emissao.mes).padStart(2,'0')}/${emissao.ano}</span>` : '';

  box.innerHTML = `
  <div style="margin-bottom:.5rem;display:flex;align-items:center;flex-wrap:wrap;gap:.4rem">
    <strong style="font-size:.82rem">Cronograma F\u00edsico-Financeiro</strong>${emissaoTxt}
  </div>
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:.78rem">
    <thead><tr style="background:var(--surface2,#f8fafc)">
      <th style="padding:.35rem .5rem;text-align:left;color:var(--text-muted)">M\u00eas</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Plan. (%)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Acum. (%)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Plan. (R$)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Acum. (R$)</th>
    </tr></thead>
    <tbody>
    ${timeline.map((t, idx) => {
      const acumPct   = timeline.slice(0, idx+1).reduce((s, r) => s + r.planejadoPct,   0);
      const acumValor = timeline.slice(0, idx+1).reduce((s, r) => s + r.planejadoValor, 0);
      const past = t.passado ? 'background:rgba(16,185,129,.04)' : '';
      return `<tr style="border-top:1px solid var(--border,#e2e8f0);${past}">
        <td style="padding:.3rem .5rem;font-weight:${t.passado?'600':'400'};color:${t.passado?'var(--text)':'var(--text-muted)'}">${t.label}</td>
        <td style="padding:.3rem .5rem;text-align:right">${t.planejadoPct.toFixed(2)}%</td>
        <td style="padding:.3rem .5rem;text-align:right;color:#6366f1">${acumPct.toFixed(2)}%</td>
        <td style="padding:.3rem .5rem;text-align:right">${money(t.planejadoValor)}</td>
        <td style="padding:.3rem .5rem;text-align:right;color:#6366f1">${money(acumValor)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

/* ══ renderCronogramaMensalBox ══ */
export function renderCronogramaMensalBox(obra) {
  const box = $('cronogramaMensalBox'); if (!box) return;
  if (!obra || !Array.isArray(obra.cronogramaExecucao) || !obra.cronogramaExecucao.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Nenhum cronograma de execu\u00e7\u00e3o importado.</p>';
    const ind = $('indicadorAtualizacaoMensal'); if (ind) ind.innerHTML = '';
    return;
  }

  renderIndicadorAtualizacao('indicadorAtualizacaoMensal', obra);

  const execucao   = obra.cronogramaExecucao;
  const emissao    = obra.dataEmissaoExecucao;
  const emissaoTxt = emissao ? `<span style="font-size:.72rem;color:var(--text-muted);margin-left:.5rem">Emiss\u00e3o: ${String(emissao.mes).padStart(2,'0')}/${emissao.ano}</span>` : '';

  box.innerHTML = `
  <div style="margin-bottom:.5rem;display:flex;align-items:center;flex-wrap:wrap;gap:.4rem">
    <strong style="font-size:.82rem">Execu\u00e7\u00e3o Mensal</strong>${emissaoTxt}
  </div>
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:.78rem">
    <thead><tr style="background:var(--surface2,#f8fafc)">
      <th style="padding:.35rem .5rem;text-align:left;color:var(--text-muted)">M\u00eas</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Exec. (%)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Acum. (%)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Exec. (R$)</th>
      <th style="padding:.35rem .5rem;text-align:right;color:var(--text-muted)">Acum. (R$)</th>
    </tr></thead>
    <tbody>
    ${execucao.map((e, idx) => {
      const acumPct   = execucao.slice(0, idx+1).reduce((s, r) => s + (Number(r.executadoPct)   || 0), 0);
      const acumValor = execucao.slice(0, idx+1).reduce((s, r) => s + (Number(r.executadoValor) || 0), 0);
      return `<tr style="border-top:1px solid var(--border,#e2e8f0)">
        <td style="padding:.3rem .5rem;color:var(--text-muted)">M${e.mes}</td>
        <td style="padding:.3rem .5rem;text-align:right">${Number(e.executadoPct  ||0).toFixed(2)}%</td>
        <td style="padding:.3rem .5rem;text-align:right;color:#10b981">${acumPct.toFixed(2)}%</td>
        <td style="padding:.3rem .5rem;text-align:right">${money(e.executadoValor||0)}</td>
        <td style="padding:.3rem .5rem;text-align:right;color:#10b981">${money(acumValor)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

/* ══ renderAditivosSection ══ */
export function renderAditivosSection(obra, prefix) {
  const sec = $('aditivosBox'); if (!sec) return;
  migrarAditivosSemId(obra);
  const aditivos = Array.isArray(obra?.aditivos) ? obra.aditivos : [];
  if (!aditivos.length) { sec.innerHTML = ''; return; }

  let html = '';
  aditivos.forEach((ad, i) => {
    const adId     = ad.id || ('aditivo_idx_' + i);
    const temCrono = Array.isArray(ad.cronograma) && ad.cronograma.length > 0;
    const emissao  = ad.dataEmissao;
    const emissaoTxt = emissao ? `<span style="font-size:.7rem;color:var(--text-muted);margin-left:.4rem">Emiss\u00e3o: ${String(emissao.mes).padStart(2,'0')}/${emissao.ano}</span>` : '';

    html += `
    <div class="aditivo-card" style="border:1px solid var(--border,#e2e8f0);border-radius:10px;margin-bottom:.75rem;overflow:hidden">
      <div style="display:flex;align-items:center;gap:.6rem;padding:.65rem 1rem;background:var(--surface2,#f8fafc)">
        <input type="text" value="${esc(ad.nome)}" data-aditivo-id="${esc(adId)}"
          style="flex:1;border:none;background:transparent;font-size:.85rem;font-weight:600;color:var(--text);outline:none;cursor:text"
          onchange="window._renomearAditivo && window._renomearAditivo('${esc(adId)}', this.value)" />
        ${emissaoTxt}
        <button onclick="window._importCronogramaPrevistoAditivo && window._importCronogramaPrevistoAditivo('${esc(adId)}')"
          style="font-size:.72rem;padding:.25rem .6rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer">
          \u{1F4C5} Previsto
        </button>
        <button onclick="window._importCronogramaMensalAditivo && window._importCronogramaMensalAditivo('${esc(adId)}')"
          style="font-size:.72rem;padding:.25rem .6rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer">
          \u{1F4C8} Mensal
        </button>
        <button onclick="window._removerAditivo && window._removerAditivo('${esc(adId)}')"
          style="font-size:.72rem;padding:.25rem .6rem;border-radius:6px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);color:#ef4444;cursor:pointer">
          \u{1F5D1}\uFE0F
        </button>
      </div>
      ${temCrono
        ? `<div class="chart-scroll-wrap" id="chartWrapAditivo_${adId}" style="padding:.5rem 1rem 1rem">
             <div class="chart-container" style="height:200px"><canvas id="chartAditivo_${adId}"></canvas></div>
           </div>`
        : `<div style="padding:.65rem 1rem;font-size:.8rem;color:var(--text-muted)">Sem cronograma importado.</div>`}
    </div>`;
  });
  sec.innerHTML = html;

  const chartsKey = `_aditivoCharts_${prefix}`;
  if (state[chartsKey]) Object.values(state[chartsKey]).forEach(c => { try { c.destroy(); } catch(_){} });
  state[chartsKey] = {};
  aditivos.forEach(ad => {
    if (!Array.isArray(ad.cronograma) || !ad.cronograma.length) return;
    const adId = ad.id;
    state[chartsKey][adId] = renderCurvaS2Aditivo(
      `chartAditivo_${adId}`, `chartWrapAditivo_${adId}`,
      ad, obra.dataInicio || null,
      state[chartsKey][adId] || null
    );
  });
}

/* ══ renderSeletorObras — APENAS seletor + botoes Atualizar/Remover ══ */
export function renderSeletorObras() {
  const wrap = $('seletorObrasWrap'); if (!wrap) return;
  const obras = Array.isArray(state.obras) ? state.obras : [];
  if (!obras.length) { wrap.innerHTML = ''; return; }

  const opts = obras.map(o =>
    `<option value="${esc(o.id)}" ${o.id === state.selectedObraId ? 'selected' : ''}>${esc(o.nomeProjeto || o.nome || o.id)}</option>`
  ).join('');

  wrap.innerHTML = `
    <select id="obraSeletorSelect"
      style="width:100%;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--border,#e2e8f0);background:var(--surface,#fff);color:var(--text,#0f172a);font-size:.85rem;font-weight:600;cursor:pointer;outline:none;margin-bottom:.4rem">
      ${opts}
    </select>
    <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
      <button id="btnAtualizarObra"
        style="flex:1;font-size:.75rem;padding:.35rem .5rem;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer">
        \u{1F501} Atualizar
      </button>
      <button id="btnRemoverObra"
        style="flex:1;font-size:.75rem;padding:.35rem .5rem;border-radius:7px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);color:#ef4444;cursor:pointer">
        \u{1F5D1}\uFE0F Remover
      </button>
    </div>`;

  const sel = $('obraSeletorSelect');
  if (sel) sel.onchange = () => { window._selecionarObra && window._selecionarObra(sel.value); };
  const btnAt = $('btnAtualizarObra');
  if (btnAt) btnAt.onclick = () => { window._atualizarObra && window._atualizarObra(); };
  const btnRm = $('btnRemoverObra');
  if (btnRm) btnRm.onclick = () => { window._removerObraAtiva && window._removerObraAtiva(); };
}
