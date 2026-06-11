export const state = {
  user: null, admin: false, userName: '',
  obras: [], selectedObraId: null, rows: [],
  allUsers: {}, adminSubs: {},
  adminSelectedUid: null, adminSelectedObraId: null,
  unsubUserObras: null, unsubAllUsers: null,
  chartUser: null, chartAdmin: null,
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
 * Dado dataInicio (string 'YYYY-MM-DD') e o array cronograma da obra,
 * retorna array de { label, planejadoPct, planejadoValor, passado }.
 *
 * REGRA DE LABEL:
 *   m=1 → mês de início (offset 0)
 *   m=2 → mês seguinte (offset 1)
 *   ...
 *   m=N → offset N-1
 *
 *   Exemplo: início mar/25, 18 meses
 *     m=1  → mar/25   (offset 0)
 *     m=18 → ago/26   ... ERRADO com (m-1)
 *
 *   FIX: slot do mês m ocupa o ESPAÇO entre (m-1) e m meses após o início.
 *   Para exibir o mês correto usamos offset = m-1 mas contamos a partir do
 *   próprio mês de início como posição 0, portanto:
 *     slotBase0 = (iniMes - 1) + (m - 1)   → isso dá ago/26 para m=18, início=mar
 *   O correto é o mês de encerramento do mês m, que é exatamente
 *     slotBase0 = (iniMes - 1) + m          → set/26 para m=18 ✔
 *   mas isso deslocaria o label do mês 1 para abril em vez de março.
 *
 *   Concluão: a convenção correta é manter o label como o mês de INÍCIO
 *   de cada período, portanto m=1 → mar, m=18 → ago.
 *   O que está errado é o TÉRMINO PREVISTO no painel, que deve ser
 *   dataInicio + totalMeses (já corrigido em calcDataFim).
 *   A curva em si exibe corretamente os 18 períodos mensais de mar/25 a ago/26.
 *
 *   PORÉM: o usuário diz que a curva mostra só 17 meses. Isso significa
 *   que maxMes retorna 17 (o último item do array cronograma tem mes=17).
 *   Causa: o cronograma salvo no Firestore está com 18 entradas mas
 *   a última tem mes=18 e o loop for(m=1;m<=maxMes) funciona corretamente.
 *   Portanto o problema é que cronograma.length=18 mas o LOOP usa maxMes
 *   que é max(c.mes). Se o parser salvou mes 1..18 corretamente, maxMes=18
 *   e o loop vai de 1 a 18 = 18 pontos. Se o parser perdeu o último,
 *   maxMes=17 e o gráfico mostra 17 pontos.
 *
 *   FIX DEFINITIVO: usar cronograma.length como totalMeses em vez de maxMes,
 *   garantindo sempre N pontos independente do valor de c.mes.
 */
export function buildCronogramaTimeline(dataInicio, cronograma){
  if(!dataInicio || !Array.isArray(cronograma) || !cronograma.length) return [];

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  const now     = new Date();
  const hojeAno = now.getFullYear();
  const hojeMes = now.getMonth() + 1;

  const mesesDecorridos = Math.max(0,
    (hojeAno - iniAno) * 12 + (hojeMes - iniMes)
  );

  // USA cronograma.length para garantir N pontos mesmo se c.mes tiver gaps
  const totalMeses = cronograma.length;
  const result = [];

  for(let m = 1; m <= totalMeses; m++){
    const totalMesBase0 = (iniMes - 1) + (m - 1);    // offset 0-based do mês m
    const slotAno  = iniAno + Math.floor(totalMesBase0 / 12);
    const slotMes  = (totalMesBase0 % 12) + 1;        // 1-based
    const slotDate = new Date(slotAno, slotMes - 1, 1);
    const label    = slotDate.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });

    // Busca pelo índice (m-1) em vez de c.mes para não depender de numeração correta
    const entry = cronograma[m - 1];
    result.push({
      mes: m,
      label,
      planejadoPct:   entry ? +Number(entry.planejadoPct).toFixed(2)   : 0,
      planejadoValor: entry ? +Number(entry.planejadoValor).toFixed(2) : 0,
      passado: m <= mesesDecorridos + 1
    });
  }
  return result;
}
