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
    const base0   = (iniMes - 1) + (m - 1);
    const slotAno = iniAno + Math.floor(base0 / 12);
    const slotMes = (base0 % 12) + 1;
    const label   = new Date(slotAno, slotMes - 1, 1)
                      .toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });
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

/* ── UTILITÁRIO: corta a cauda vazia do executado ──────────────────────────
 *
 * Regra: percorre do fim para o início o array de execução acumulada.
 * Substitui por null todos os valores após o último índice com valor > 0.
 * Buracos NO MEIO são mantidos (null/zero entre valores reais).
 * O planejado NÃO é alterado — exibe todos os meses do cronograma.
 *
 * Usado em buildCurvaServico para o array execAcum de cada item.
 */
function _cortarExecCauda(arr) {
  if (!Array.isArray(arr) || !arr.length) return arr;
  let ultimo = -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && v !== undefined && Number(v) > 0) { ultimo = i; break; }
  }
  if (ultimo < 0) return arr.map(() => null);
  return arr.map((v, i) => i <= ultimo ? v : null);
}

/* ── Curva S por Serviço ────────────────────────────────────────────────────
 * Índice 0 de todos os arrays = "Mês 0" (ponto de origem zerado).
 * mesesDecorridos limitado a totalMeses para não gerar labels além do cronograma.
 * Labels: m=1 → mês de início da obra (base0 = (iniMes-1)+(m-1))
 */
export function buildCurvaServico(dataInicio, itemCronograma, itensExecucao, totalMeses, dataEmissaoObra, itemCronogramaExecucao) {
  if (!dataInicio || !itemCronograma) return null;

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  let refAno, refMes;
  if (dataEmissaoObra && dataEmissaoObra.mes && dataEmissaoObra.ano) {
    refMes = dataEmissaoObra.mes;
    refAno = dataEmissaoObra.ano;
  } else {
    const now = new Date();
    refMes = now.getMonth() + 1;
    refAno = now.getFullYear();
  }

  const mesesDecorridos = Math.min(
    totalMeses,
    Math.max(0, (refAno - iniAno) * 12 + (refMes - iniMes) + 1)
  );

  const mesesItem = Array.isArray(itemCronograma.meses) ? itemCronograma.meses : [];
  const planMap   = {};
  mesesItem.forEach(m => { planMap[m.mes] = m; });

  const mesesExec = Array.isArray(itemCronogramaExecucao?.meses) ? itemCronogramaExecucao.meses : [];
  const execMap   = {};
  mesesExec.forEach(m => { execMap[m.mes] = m; });
  const temExecucaoMensal = mesesExec.length > 0;

  // Ponto de origem: Mês 0 (índice 0 em todos os arrays)
  const labels          = ['Mês 0'];
  const planMensal      = [0];
  const planAcum        = [0];
  const planValorMensal = [0];
  const planValorAcum   = [0];
  const execMensal      = [0];
  const execAcum        = [0];
  const execValorMensal = [0];
  const execValorAcum   = [0];

  let acumPlanPct   = 0;
  let acumPlanValor = 0;
  let acumExecPct   = 0;
  let acumExecValor = 0;
  let mesAtualIdx   = 0;

  for (let m = 1; m <= totalMeses; m++) {
    const base0 = (iniMes - 1) + (m - 1);
    const sAno  = iniAno + Math.floor(base0 / 12);
    const sMes  = (base0 % 12) + 1;
    labels.push(new Date(sAno, sMes - 1, 1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }));

    const planSlot = planMap[m] || { pct: 0, valor: 0 };
    const mp = +Number(planSlot.pct   || 0).toFixed(4);
    const mv = +Number(planSlot.valor || 0).toFixed(2);
    acumPlanPct   += mp;
    acumPlanValor += mv;
    planMensal.push(mp);
    planAcum.push(+Math.min(acumPlanPct, 100).toFixed(2));
    planValorMensal.push(mv);
    planValorAcum.push(+acumPlanValor.toFixed(2));

    if (temExecucaoMensal) {
      if (m <= mesesDecorridos) {
        const execSlot = execMap[m] || { pct: 0, valor: 0 };
        const ep = +Number(execSlot.pct   || 0).toFixed(4);
        const ev = +Number(execSlot.valor || 0).toFixed(2);
        acumExecPct   += ep;
        acumExecValor += ev;
        execMensal.push(ep);
        execAcum.push(+Math.min(acumExecPct, 100).toFixed(2));
        execValorMensal.push(ev);
        execValorAcum.push(+acumExecValor.toFixed(2));
        mesAtualIdx = m;
      } else {
        execMensal.push(null);
        execAcum.push(null);
        execValorMensal.push(null);
        execValorAcum.push(null);
      }
    } else {
      execMensal.push(null);
      execAcum.push(null);
      execValorMensal.push(null);
      execValorAcum.push(null);
    }
  }

  // ── Corte da cauda vazia: apenas no executado ────────────────────────────
  // O planejado (planAcum) NÃO é alterado — exibe todos os meses do cronograma.
  // O executado (execAcum) tem os meses após o último valor real substituídos por null.
  const execAcumFinal        = _cortarExecCauda(execAcum);
  const execMensalFinal      = _cortarExecCauda(execMensal);
  const execValorAcumFinal2  = _cortarExecCauda(execValorAcum);
  const execValorMensalFinal = _cortarExecCauda(execValorMensal);

  // mesAtualIdx pode ter ficado além do novo limite — clamp
  const execAcumFinalLen = execAcumFinal.filter(v => v !== null).length;
  const mesAtualIdxFinal = Math.min(mesAtualIdx, execAcumFinalLen);

  // ── Execução acumulada global (para o badge de status) ──
  let execAcumPctFinal   = acumExecPct;
  let execAcumValorFinal = acumExecValor;
  if (!temExecucaoMensal) {
    const execItem = (itensExecucao || []).find(r =>
      String(r.item).trim() === String(itemCronograma.item).trim()
    );
    execAcumPctFinal   = execItem ? +Number(execItem.percentualExecutado || 0).toFixed(2) : 0;
    execAcumValorFinal = execItem ? +Number(execItem.acumulado           || 0).toFixed(2) : 0;
  }

  const execItemFallback = (itensExecucao || []).find(r =>
    String(r.item).trim() === String(itemCronograma.item).trim()
  );
  const valorContrato = +Number(
    itemCronograma.valorTotal ||
    execItemFallback?.valorContrato   ||
    planValorAcum[planValorAcum.length - 1] ||
    0
  ).toFixed(2);

  const pesoTotal = +Number(itemCronograma.pesoTotal || 0).toFixed(4);

  // planAteAgora usa planAcum original (antes de qualquer corte) para status correto
  const planAteAgora = planAcum[mesAtualIdx] || 0;
  let status = 'nao_iniciado';
  if (planAteAgora > 0 || execAcumPctFinal > 0) {
    if (execAcumPctFinal === 0 && planAteAgora > 0) {
      status = 'atrasado';
    } else if (execAcumPctFinal >= planAteAgora - 0.01) {
      status = execAcumPctFinal > planAteAgora + 0.01 ? 'adiantado' : 'em_dia';
    } else {
      status = 'atrasado';
    }
  }

  // anomalias usam arrays originais (antes do corte de cauda)
  const anomalias = detectarAnomaliaServico({
    planMensal,
    execMensal,
    execAcumPctFinal,
    planAteAgora,
    mesesDecorridos,
    totalMeses
  });

  return {
    descricao:       itemCronograma.descricao || `Serviço ${itemCronograma.item}`,
    item:            itemCronograma.item,
    labels,           // planejado usa todos os labels (sem corte)
    planMensal,
    planAcum,         // planejado completo, sem corte
    planValorMensal,
    planValorAcum,
    execMensal:      execMensalFinal,
    execAcum:        execAcumFinal,       // executado com cauda cortada
    execValorMensal: execValorMensalFinal,
    execValorAcum:   execValorAcumFinal2,
    execAcumPct:     execAcumPctFinal,
    execAcumValor:   execAcumValorFinal,
    valorContrato,
    pesoTotal,
    status,
    anomalias,
    mesAtualIdx:     mesAtualIdxFinal,
    mesesDecorridos
  };
}

/* ── detectarAnomaliaServico ──────────────────────────────────────────────── */
const THRESHOLD_ADIANTADO = 15;

export function detectarAnomaliaServico({ planMensal, execMensal, execAcumPctFinal, planAteAgora, mesesDecorridos, totalMeses }) {
  const anomalias = [];
  if (!Array.isArray(planMensal) || !Array.isArray(execMensal)) return anomalias;

  let primeiroPlanIdx = -1;
  for (let i = 1; i < planMensal.length; i++) {
    if ((planMensal[i] || 0) > 0) { primeiroPlanIdx = i; break; }
  }

  let primeiroExecIdx = -1;
  for (let i = 1; i < execMensal.length; i++) {
    if ((execMensal[i] || 0) > 0) { primeiroExecIdx = i; break; }
  }

  if (primeiroExecIdx !== -1 && primeiroPlanIdx !== -1 && primeiroExecIdx < primeiroPlanIdx) {
    const mesesDeAntecipacao = primeiroPlanIdx - primeiroExecIdx;
    anomalias.push({
      tipo: 'INICIADO_ANTES_DO_PREVISTO',
      mensagem: `Serviço iniciado ${mesesDeAntecipacao} mês(es) antes do cronograma original.`,
      severidade: 'alerta'
    });
  }

  const inicioRef = primeiroPlanIdx > 0 ? primeiroPlanIdx : 1;
  const fimVerificacao = Math.min(execMensal.length - 1, mesesDecorridos);
  for (let i = inicioRef; i <= fimVerificacao; i++) {
    const ep = execMensal[i] || 0;
    const pp = planMensal[i] || 0;
    if (ep > 0 && pp === 0) {
      anomalias.push({
        tipo: 'EXECUTADO_FORA_DO_CRONOGRAMA',
        mensagem: `Execução no mês ${i} não estava prevista no cronograma original.`,
        severidade: 'alerta'
      });
      break;
    }
  }

  if (planAteAgora > 0 && execAcumPctFinal > 0) {
    const desvio = execAcumPctFinal - planAteAgora;
    if (desvio > THRESHOLD_ADIANTADO) {
      anomalias.push({
        tipo: 'MUITO_ADIANTADO',
        mensagem: `Execução acumulada ${desvio.toFixed(1)}pp acima do planejado (limite: ${THRESHOLD_ADIANTADO}pp).`,
        severidade: 'aviso'
      });
    }
  }

  return anomalias;
}
