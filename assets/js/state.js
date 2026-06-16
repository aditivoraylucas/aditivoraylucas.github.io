export const state = {
  user: null, admin: false, userName: '',
  obras: [], selectedObraId: null, rows: [],
  allUsers: {}, adminSubs: {},
  adminSelectedUid: null, adminSelectedObraId: null,
  unsubUserObras: null, unsubAllUsers: null,
  chartUser: null,  chartUser2: null,
  chartAdmin: null, chartAdmin2: null,
  saveTimer: null, colabFormReady: false
};

export const $        = id => document.getElementById(id);
export const fmtMoney = v  => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
export const esc      = s  => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const parseMoney = s => Number(String(s||'').replace(/[R$\s.]/g,'').replace(',','.')) || 0;
export const norm     = v  => String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export const isNum    = v  => v !== '' && !isNaN(Number(v)) && isFinite(Number(v));
export const baseName = n  => String(n||'').replace(/\.[^.]+$/,'');
export const money    = fmtMoney;
export const pct      = n  => `${Number(n||0).toFixed(2)}%`;

export const EXCEL_EXTS = new Set(['xls','xlsx','xlsm','xlsb','xlam','xla','ods','csv']);

export function currentObra(){ return state.obras.find(o => o.id === state.selectedObraId); }
export function calcPctGeral(resumo, itens){
  const vca = Number(resumo?.valorContratoAditivo) || 0;
  const acu = Number(resumo?.acumuladoTotal) || 0;
  if(vca > 0 && acu > 0) return +(acu/vca*100).toFixed(2);
  const tv = (itens||[]).reduce((a,i)=>a+(Number(i.valorContrato)||0),0);
  const ta = (itens||[]).reduce((a,i)=>a+(Number(i.acumulado)||0),0);
  return tv > 0 ? +(ta/tv*100).toFixed(2) : 0;
}
export function showView(name){
  ['loginView','appView','adminView'].forEach(v => $(v).style.display = 'none');
  $(name).style.display = name === 'loginView' ? 'flex' : 'block';
}
export function showToast(msg, isError=false){
  let t = $('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast'+(isError?' toast-error':''); t.style.opacity = '1';
  clearTimeout(t._timer); t._timer = setTimeout(()=>{ t.style.opacity='0'; }, isError?5000:3500);
}
export function cleanup(adminSubs, allUsers){
  if(state.unsubUserObras) state.unsubUserObras();
  if(state.unsubAllUsers)  state.unsubAllUsers();
  Object.values(adminSubs||state.adminSubs).forEach(fn => fn && fn());
  state.adminSubs = {}; state.allUsers = {};
  state.adminSelectedUid = null; state.adminSelectedObraId = null;
}

/* ── Cronograma Físico-Financeiro ── */
/**
 * buildCronogramaTimeline(dataInicio, cronograma, dataEmissao?)
 *
 * dataEmissao (opcional): { mes, ano } extraído da planilha.
 *   - Se fornecido, o mês de referência do "Hoje" é dataEmissao.mes/dataEmissao.ano.
 *   - Apenas mês e ano importam; o dia é ignorado.
 *   - Ex: dataEmissao 29/03/2026 → referência = mês 3 de 2026.
 *   - Fallback: mês/ano atual do sistema.
 */
export function buildCronogramaTimeline(dataInicio, cronograma, dataEmissao){
  if(!dataInicio || !Array.isArray(cronograma) || !cronograma.length) return [];

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  let refAno, refMes;
  if(dataEmissao && dataEmissao.mes && dataEmissao.ano){
    refMes = dataEmissao.mes;
    refAno = dataEmissao.ano;
  } else {
    const now = new Date();
    refMes = now.getMonth() + 1;
    refAno = now.getFullYear();
  }

  const mesesDecorridos = Math.max(0,
    (refAno - iniAno) * 12 + (refMes - iniMes)
  );

  const totalMeses = cronograma.length;
  const result = [];

  for(let m = 1; m <= totalMeses; m++){
    const totalMesBase0 = (iniMes - 1) + m;
    const slotAno  = iniAno + Math.floor(totalMesBase0 / 12);
    const slotMes  = (totalMesBase0 % 12) + 1;
    const slotDate = new Date(slotAno, slotMes - 1, 1);
    const label    = slotDate.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });

    const entry = cronograma[m - 1];
    result.push({
      mes: m,
      label,
      planejadoPct:   entry ? +Number(entry.planejadoPct).toFixed(2)   : 0,
      planejadoValor: entry ? +Number(entry.planejadoValor).toFixed(2) : 0,
      passado: m <= mesesDecorridos
    });
  }
  return result;
}

/* ── Curva S por Serviço ─────────────────────────────────────────────────────────────────
 *
 * buildCurvaServico(dataInicio, itemCronograma, itensExecucao, totalMeses, dataEmissaoObra?)
 *
 * Parâmetros:
 *   dataInicio      — string 'YYYY-MM-DD' — data de início da obra
 *   itemCronograma  — objeto salvo no Firebase:
 *                     { item, descricao, pesoTotal, valorTotal, meses: [{mes, pct, valor}, ...] }
 *   itensExecucao   — array de itens de medição (o.itens) com
 *                     { item, descricao, valorContrato, acumulado, percentualExecutado, ... }
 *   totalMeses      — número total de meses do cronograma
 *   dataEmissaoObra — (opcional) { mes, ano } para calcular mês de referência
 *                     da planilha; se omitido usa data atual do sistema
 *
 * Retorna:
 *   {
 *     descricao,          — nome do serviço
 *     item,               — número do item
 *     labels[],           — labels de mês (ex: 'abr. 25')
 *     planMensal[],       — % planejado de cada mês (não acumulado)
 *     planAcum[],         — % planejado acumulado
 *     planValorMensal[],  — R$ planejado de cada mês
 *     planValorAcum[],    — R$ planejado acumulado
 *     execAcumPct,        — % real executado acumulado deste serviço
 *     execAcumValor,      — R$ real executado acumulado deste serviço
 *     valorContrato,      — R$ total do item (de valorTotal do cronograma ou itensExecucao)
 *     pesoTotal,          — peso (%) do item no total do contrato
 *     status,             — 'em_dia' | 'atrasado' | 'adiantado' | 'nao_iniciado'
 *     mesAtualIdx,        — índice (0-based) do mês atual no array
 *     mesesDecorridos,    — quantos meses já decorreram desde o início da obra
 *   }
 */
export function buildCurvaServico(dataInicio, itemCronograma, itensExecucao, totalMeses, dataEmissaoObra) {
  if (!dataInicio || !itemCronograma) return null;

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  // Mês de referência: usa dataEmissao da planilha se disponível, senão data atual
  let refAno, refMes;
  if (dataEmissaoObra && dataEmissaoObra.mes && dataEmissaoObra.ano) {
    refMes = dataEmissaoObra.mes;
    refAno = dataEmissaoObra.ano;
  } else {
    const now = new Date();
    refMes = now.getMonth() + 1;
    refAno = now.getFullYear();
  }
  const mesesDecorridos = Math.max(0, (refAno - iniAno) * 12 + (refMes - iniMes));

  // Mapeia os meses do item pelo número do mês (1-based)
  const mesesItem = Array.isArray(itemCronograma.meses) ? itemCronograma.meses : [];
  const mesesMap  = {};
  mesesItem.forEach(m => { mesesMap[m.mes] = m; });

  const labels           = [];
  const planMensal       = [];
  const planAcum         = [];
  const planValorMensal  = [];
  const planValorAcum    = [];
  let   acumPct          = 0;
  let   acumValor        = 0;
  let   mesAtualIdx      = 0;

  for (let m = 1; m <= totalMeses; m++) {
    const base0 = (iniMes - 1) + m;
    const sAno  = iniAno + Math.floor(base0 / 12);
    const sMes  = (base0 % 12) + 1;
    labels.push(new Date(sAno, sMes - 1, 1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }));

    const slot = mesesMap[m] || { pct: 0, valor: 0 };
    const mp   = +Number(slot.pct   || 0).toFixed(4);
    const mv   = +Number(slot.valor || 0).toFixed(2);
    acumPct   += mp;
    acumValor += mv;
    planMensal.push(mp);
    planAcum.push(+Math.min(acumPct, 100).toFixed(2));
    planValorMensal.push(mv);
    planValorAcum.push(+acumValor.toFixed(2));

    if (m <= mesesDecorridos) mesAtualIdx = m - 1;
  }

  // Execução real: busca o item correspondente em itensExecucao
  const execItem      = (itensExecucao || []).find(r =>
    String(r.item).trim() === String(itemCronograma.item).trim()
  );
  const execAcumPct   = execItem ? +Number(execItem.percentualExecutado || 0).toFixed(2) : 0;
  const execAcumValor = execItem ? +Number(execItem.acumulado           || 0).toFixed(2) : 0;

  // valorContrato: prioridade —
  //   1º valorTotal do cronograma (salvo pelo parser atualizado)
  //   2º valorContrato do item de execução
  //   3º soma dos valores mensais planejados (planValorAcum final)
  const valorContrato = +Number(
    itemCronograma.valorTotal ||
    execItem?.valorContrato   ||
    planValorAcum[planValorAcum.length - 1] ||
    0
  ).toFixed(2);

  const pesoTotal = +Number(itemCronograma.pesoTotal || 0).toFixed(4);

  // Status: compara execução acumulada real vs planejada até o mês atual
  const planAteAgora = planAcum[mesAtualIdx] || 0;
  let status = 'nao_iniciado';
  if (planAteAgora > 0 || execAcumPct > 0) {
    if (execAcumPct === 0 && planAteAgora > 0) status = 'atrasado';
    else if (execAcumPct >= planAteAgora - 0.01) status = execAcumPct > planAteAgora + 0.01 ? 'adiantado' : 'em_dia';
    else status = 'atrasado';
  }

  return {
    descricao:       itemCronograma.descricao || `Serviço ${itemCronograma.item}`,
    item:            itemCronograma.item,
    labels,
    planMensal,
    planAcum,
    planValorMensal,
    planValorAcum,
    execAcumPct,
    execAcumValor,
    valorContrato,
    pesoTotal,
    status,
    mesAtualIdx,
    mesesDecorridos
  };
}
