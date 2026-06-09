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
 * Fix: usa ano/mês local explícito para evitar drift de fuso horário.
 * Fix: passado inclui o mês atual (m <= mesesDecorridos + 1).
 */
export function buildCronogramaTimeline(dataInicio, cronograma){
  if(!dataInicio || !Array.isArray(cronograma) || !cronograma.length) return [];

  // Parseia a data de início como ano/mês LOCAL (sem converter para UTC)
  const [iniAno, iniMes] = dataInicio.split('-').map(Number); // mes 1-based

  const now     = new Date();
  const hojeAno = now.getFullYear();
  const hojeMes = now.getMonth() + 1; // 1-based

  // Quantos meses se passaram desde o início até o mês atual (inclusive)
  const mesesDecorridos = Math.max(0,
    (hojeAno - iniAno) * 12 + (hojeMes - iniMes)
  );

  const maxMes = Math.max(...cronograma.map(c => c.mes));
  const result = [];

  for(let m = 1; m <= maxMes; m++){
    // Calcula o mês/ano deste slot sem usar setMonth (evita overflow)
    const totalMes = iniMes - 1 + (m - 1);       // 0-based offset
    const slotAno  = iniAno + Math.floor(totalMes / 12);
    const slotMes  = (totalMes % 12) + 1;          // 1-based
    const slotDate = new Date(slotAno, slotMes - 1, 1);
    const label    = slotDate.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });

    const entry = cronograma.find(c => c.mes === m);
    result.push({
      mes: m,
      label,
      planejadoPct:   entry ? +Number(entry.planejadoPct).toFixed(2)   : 0,
      planejadoValor: entry ? +Number(entry.planejadoValor).toFixed(2) : 0,
      passado: m <= mesesDecorridos + 1  // inclui mês atual
    });
  }
  return result;
}
