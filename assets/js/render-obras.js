import { $, state, esc, money, buildCronogramaTimeline } from './state.js';
import { renderCurvaS2Aditivo, renderIndicadorAtualizacao } from './render-charts.js';

let _importFileFn = () => {};
export function setImportFileFnObras(fn) { _importFileFn = fn; }

/* ── migra aditivos sem id ── */
export function migrarAditivosSemId(obra) {
  if (!Array.isArray(obra?.aditivos)) return;
  obra.aditivos.forEach(a => { if (!a.id) a.id = 'aditivo_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); });
}

/* ══ renderObrasBox ── seletor + Atualizar + Remover ══ */
export function renderObrasBox() {
  const wrap = $('seletorObrasWrap'); if (!wrap) return;
  const obras = Array.isArray(state.obras) ? state.obras : [];
  if (!obras.length) { wrap.innerHTML = ''; return; }

  const opts = obras.map(o =>
    `<option value="${esc(o.id)}" ${o.id === state.selectedObraId ? 'selected' : ''}>${esc(o.nomeProjeto || o.nome || o.id)}</option>`
  ).join('');

  wrap.innerHTML = `
    <label style="font-size:.75rem;color:var(--text-muted);font-weight:600">Obra ativa</label>
    <select id="obraSeletorSelect"
      style="width:100%;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--border,#e2e8f0);background:var(--surface,#fff);color:var(--text,#0f172a);font-size:.85rem;font-weight:600;cursor:pointer;outline:none;margin-bottom:.5rem;margin-top:.25rem">
      ${opts}
    </select>
    <button id="btnAtualizarObra" class="btn btn-sec" style="width:100%;margin-bottom:.4rem">
      &#128260; Atualizar
    </button>
    <button id="btnRemoverObra" class="btn btn-danger" style="width:100%;margin-bottom:.25rem">
      &#128465; Remover
    </button>`;

  const sel = $('obraSeletorSelect');
  if (sel) sel.onchange = () => { window._selecionarObra && window._selecionarObra(sel.value); };
  const btnAt = $('btnAtualizarObra');
  if (btnAt) btnAt.onclick = () => { window._atualizarObra && window._atualizarObra(); };
  const btnRm = $('btnRemoverObra');
  if (btnRm) btnRm.onclick = () => { window._removerObraAtiva && window._removerObraAtiva(); };
}

/* alias para compatibilidade */
export function renderSeletorObras() { renderObrasBox(); }

/* ══ renderCronogramaBox ══ */
export function renderCronogramaBox(obra) {
  const box = $('cronogramaBox'); if (!box) return;
  const btnRem = $('btnRemoverCronograma');

  if (!obra || !Array.isArray(obra.cronograma) || !obra.cronograma.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Nenhum cronograma importado.</p>';
    if (btnRem) btnRem.style.display = 'none';
    return;
  }

  if (btnRem) {
    btnRem.style.display = '';
    btnRem.onclick = () => { window._removerCronograma && window._removerCronograma(); };
  }

  const n = obra.cronograma.length;
  box.innerHTML = `<p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.25rem">&#128197; <strong>${n} meses</strong> importados</p>`;
}

/* ══ renderCronogramaMensalBox ══ */
export function renderCronogramaMensalBox(obra) {
  const box = $('cronogramaMensalBox'); if (!box) return;
  const btnRem = $('btnRemoverCronogramaMensal');
  const ind = $('indicadorAtualizacaoMensal'); if (ind) ind.innerHTML = '';

  if (!obra || !Array.isArray(obra.cronogramaExecucao) || !obra.cronogramaExecucao.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Nenhum cronograma de execu\u00e7\u00e3o importado.</p>';
    if (btnRem) btnRem.style.display = 'none';
    return;
  }

  if (btnRem) {
    btnRem.style.display = '';
    btnRem.onclick = () => { window._removerCronogramaMensal && window._removerCronogramaMensal(); };
  }

  renderIndicadorAtualizacao('indicadorAtualizacaoMensal', obra);

  const n = obra.cronogramaExecucao.length;
  box.innerHTML = `<p style="font-size:.82rem;color:var(--text-muted);margin-bottom:.25rem">&#128200; <strong>${n} meses</strong> importados</p>`;
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
    const nPrev    = Array.isArray(ad.cronograma)        ? ad.cronograma.length        : 0;
    const nMensal  = Array.isArray(ad.cronogramaExecucao) ? ad.cronogramaExecucao.length : 0;

    html += `
    <div class="aditivo-card" style="border:1px solid var(--border,#e2e8f0);border-radius:10px;margin-bottom:.75rem;overflow:hidden">
      <div style="padding:.65rem 1rem;background:var(--surface2,#f8fafc)">
        <input type="text" value="${esc(ad.nome)}" data-aditivo-nome="${esc(adId)}"
          style="width:100%;border:none;background:transparent;font-size:.88rem;font-weight:700;color:var(--text);outline:none;cursor:text;margin-bottom:.5rem" />
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.15rem">
          &#128197; Previsto: <strong>${nPrev ? nPrev + ' meses' : 'não importado'}</strong>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">
          &#128200; Mensal: <strong>${nMensal ? nMensal + ' meses' : 'não importado'}</strong>
        </div>
        <div style="display:flex;gap:.4rem;margin-bottom:.35rem">
          <button data-aditivo-action="previsto" data-aditivo-id="${esc(adId)}"
            class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.35rem .4rem">
            &#128197; Previsto
          </button>
          <button data-aditivo-action="mensal" data-aditivo-id="${esc(adId)}"
            class="btn btn-sec" style="flex:1;font-size:.75rem;padding:.35rem .4rem">
            &#128200; Mensal
          </button>
        </div>
        <button data-aditivo-action="remover" data-aditivo-id="${esc(adId)}"
          class="btn btn-danger" style="width:100%;font-size:.75rem;padding:.35rem .5rem">
          &#128465; Remover aditivo
        </button>
      </div>
    </div>`;
  });
  sec.innerHTML = html;
}
