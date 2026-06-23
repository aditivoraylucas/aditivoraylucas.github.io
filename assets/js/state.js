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

/* ───────────────────────────────────────────────────────────────────────────────
   UTILITÁRIO: _cortarExecCauda

   Ancora a linha do EXECUTADO no último mês onde a linha SIMPLES
   (planejadoPct > 0) tem valor. Isso elimina de forma determinista
   a cauda vazia — mêses em branco no final do cronograma.

   Parâmetros:
     execAcum   — array de percentuais acumulados do executado (número|null)
                  Índice 0 = "Mês 0" (origem), índice i = mês i do cronograma.
     simplesPct — array paralelo ao cronograma com o planejadoPct de cada mês
                  (linha TOTAL SIMPLES). Quando o valor é > 0, o mês tem
                  serviço planejado. Índice i corresponde ao mês i+1
                  (porque execAcum[0] = origem, execAcum[1] = mês 1, etc.).

   Comportamento:
     1. Encontra o último mês onde simplesPct > 0  ← âncora
     2. Todos os pontos do execAcum após esse índice viram null
     3. Buracos NO MEIO (mês com simplesPct=0 entre dois meses com valor)
        não são afetados — só a cauda é cortada.
     4. PLANEJADO nunca passa por aqui — exibe todos os meses.
   ────────────────────────────────────────────────────────────────────────────── */
function _cortarExecCauda(execAcum, simplesPct) {
  if (!Array.isArray(execAcum) || execAcum.length === 0) return execAcum;

  const out = execAcum.slice();
  const n   = out.length; // inclui o ponto de origem (índice 0)

  // simplesPct[i] corresponde ao mês i+1, ou seja execAcum[índice i+1]
  // Precisamos do último índice em execAcum onde o mês tinha planejadoPct>0
  let limiteIdx = 0; // mínimo: deixa pelo menos a origem

  if (Array.isArray(simplesPct) && simplesPct.length > 0) {
    // Percorre de trás para frente: acha o último mês com planejadoPct > 0
    for (let i = simplesPct.length - 1; i >= 0; i--) {
      if (Number(simplesPct[i]) > 0) {
        // simplesPct[i] é o mês i+1 → índice i+1 no execAcum
        limiteIdx = Math.min(i + 1, n - 1);
        break;
      }
    }
  } else {
    // Fallback sem âncora: mantém o último não-nulo
    for (let i = n - 1; i >= 0; i--) {
      if (out[i] !== null && out[i] !== undefined) { limiteIdx = i; break; }
    }
  }

  // Anula tudo após o limite
  for (let i = limiteIdx + 1; i < n; i++) out[i] = null;
  return out;
}

/* ── Curva S por Serviço ───────────────────────────────────────────────────
 * Índice 0 = "Mês 0" (ponto de origem zerado).
 * A âncora do corte é o último mês com pct > 0 na linha do próprio item
 * (meses[].pct), que é o equivalente ao TOTAL SIMPLES para o serviço.
 * O planejado (planAcum) é devolvido completo, sem corte.
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

  // Âncora do item: pct planejado de cada mês deste serviço
  // simplesPct[i] = planejadoPct do mês i+1 (igual ao TOTAL SIMPLES mas por item)
  const itemSimplesPct = Array.from({ length: totalMeses }, (_, i) => {
    const slot = planMap[i + 1];
    return slot ? (Number(slot.pct) || 0) : 0;
  });

  const mesesExec = Array.isArray(itemCronogramaExecucao?.meses) ? itemCronogramaExecucao.meses : [];
  const execMap   = {};
  mesesExec.forEach(m => { execMap[m.mes] = m; });
  const temExecucaoMensal = mesesExec.length > 0;

  // Ponto de origem: Mês 0
  const labels          = ['M\u00eas 0'];
  const planMensal      = [0];
  const planAcum        = [0];   // PLANEJADO — nunca cortado
  const planValorMensal = [0];
  const planValorAcum   = [0];
  const execMensalRaw   = [0];
  const execAcumRaw     = [0];
  const execValorMensalRaw = [0];
  const execValorAcumRaw   = [0];

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

    // Planejado — todos os meses, sem corte
    const planSlot = planMap[m] || { pct: 0, valor: 0 };
    const mp = +Number(planSlot.pct   || 0).toFixed(4);
    const mv = +Number(planSlot.valor || 0).toFixed(2);
    acumPlanPct   += mp;
    acumPlanValor += mv;
    planMensal.push(mp);
    planAcum.push(+Math.min(acumPlanPct, 100).toFixed(2));
    planValorMensal.push(mv);
    planValorAcum.push(+acumPlanValor.toFixed(2));

    // Executado — apenas dentro do período decorrido
    if (temExecucaoMensal && m <= mesesDecorridos) {
      const execSlot = execMap[m] || { pct: 0, valor: 0 };
      const ep = +Number(execSlot.pct   || 0).toFixed(4);
      const ev = +Number(execSlot.valor || 0).toFixed(2);
      acumExecPct   += ep;
      acumExecValor += ev;
      execMensalRaw.push(ep);
      execAcumRaw.push(+Math.min(acumExecPct, 100).toFixed(2));
      execValorMensalRaw.push(ev);
      execValorAcumRaw.push(+acumExecValor.toFixed(2));
      mesAtualIdx = m;
    } else {
      execMensalRaw.push(null);
      execAcumRaw.push(null);
      execValorMensalRaw.push(null);
      execValorAcumRaw.push(null);
    }
  }

  // ── Corte da cauda: ancora no último mês com pct>0 do próprio item ──────
  // planAcum NÃO é alterado — exibe todos os meses.
  const execAcumFinal = _cortarExecCauda(execAcumRaw, itemSimplesPct);

  // Índice do último ponto válido após o corte
  let ultimoExecIdx = 0;
  for (let i = execAcumFinal.length - 1; i >= 0; i--) {
    if (execAcumFinal[i] !== null) { ultimoExecIdx = i; break; }
  }

  // Aplica o mesmo limite nos arrays auxiliares
  const execMensalFinal      = execMensalRaw.map((v, i)      => i <= ultimoExecIdx ? v : null);
  const execValorAcumFinal   = execValorAcumRaw.map((v, i)   => i <= ultimoExecIdx ? v : null);
  const execValorMensalFinal = execValorMensalRaw.map((v, i) => i <= ultimoExecIdx ? v : null);

  const mesAtualIdxFinal = Math.min(mesAtualIdx, ultimoExecIdx);

  // ── Execução acumulada global (badge de status) ──
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

  const anomalias = detectarAnomaliaServico({
    planMensal,
    execMensal: execMensalRaw,
    execAcumPctFinal,
    planAteAgora,
    mesesDecorridos,
    totalMeses
  });

  return {
    descricao:       itemCronograma.descricao || `Servi\u00e7o ${itemCronograma.item}`,
    item:            itemCronograma.item,
    labels,
    planMensal,
    planAcum,                        // PLANEJADO completo — sem corte
    planValorMensal,
    planValorAcum,
    execMensal:      execMensalFinal,
    execAcum:        execAcumFinal,  // EXECUTADO com cauda cortada pela âncora
    execValorMensal: execValorMensalFinal,
    execValorAcum:   execValorAcumFinal,
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

/* ── detectarAnomaliaServico ───────────────────────────────────────────── */
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
      mensagem: `Servi\u00e7o iniciado ${mesesDeAntecipacao} m\u00eas(es) antes do cronograma original.`,
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
        mensagem: `Execu\u00e7\u00e3o no m\u00eas ${i} n\u00e3o estava prevista no cronograma original.`,
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
        mensagem: `Execu\u00e7\u00e3o acumulada ${desvio.toFixed(1)}pp acima do planejado (limite: ${THRESHOLD_ADIANTADO}pp).`,
        severidade: 'aviso'
      });
    }
  }

  return anomalias;
}
