import { $, state, parseMoney, showToast, money, cleanup } from './state.js';
import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  saveObra, deleteObra, scheduleSave, currentObra,
  renderAll, applySelected, setImportFileFn,
  updateDashboard, renderAdminViews, renderAdminDetail, renderColabList, renderAdminSidebar
} from './render.js';
import {
  importFile, importCronograma, importCronogramaMensal,
  importCronogramaPrevistoAditivo, importCronogramaMensalAditivo,
  addNovoAditivo, renomearAditivo, removerAditivo
} from './events-import.js';

export { importFile };

export function setupColabForm(){
  const form=$('addColabForm'); if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const nome=$('colabNome').value.trim(),
          email=$('colabEmail').value.trim(),
          senha=$('colabSenha').value;
    const errBox=$('colabMsgError');
    errBox.style.display='none';
    const btn=$('addColabBtn'); btn.disabled=true; btn.textContent='Aguarde...';
    try{
      const cred=await createUserWithEmailAndPassword(auth,email,senha);
      await setDoc(doc(db,'users',cred.user.uid),{nome,email,role:'colaborador',blocked:false,createdAt:new Date().toISOString()});
      showToast('\u2705 Colaborador cadastrado!');
      form.reset();
    } catch(err){
      errBox.textContent=err.message; errBox.style.display='block';
    } finally { btn.disabled=false; btn.textContent='Cadastrar colaborador'; }
  });
}

export function bindEvents(){
  // ── seletor de obras ──
  window._selecionarObra = (obraId) => {
    const obra = (state.obras || []).find(o => o.id === obraId);
    if (!obra) return;
    state.selectedObraId = obraId;
    applySelected(obra);
    renderAll();
  };

  // ── atualizar obra ativa (reimporta Excel) ──
  window._atualizarObra = () => { importFile(true); };

  // ── remover obra ativa ──
  window._removerObraAtiva = async () => {
    const obra = currentObra(); if (!obra) return;
    const nome = obra.nomeProjeto || obra.nome || 'esta obra';
    if (!confirm(`Remover "${nome}" permanentemente?`)) return;
    try {
      await deleteObra(obra.id);
      const restantes = (state.obras || []).filter(o => o.id !== obra.id);
      state.selectedObraId = restantes[0]?.id ?? null;
      if (state.selectedObraId) applySelected(restantes[0]);
      renderAll();
      showToast('\u2705 Obra removida.');
    } catch(err) { showToast('\u274C ' + err.message, true); }
  };

  window.adminSelectColab = uid => {
    state.adminSelectedUid=uid; state.adminSelectedObraId=null;
    renderAdminSidebar(); renderAdminDetail();
  };
  window.adminDeselectColab = () => {
    state.adminSelectedUid=null; state.adminSelectedObraId=null;
    renderAdminSidebar(); renderAdminDetail();
  };
  window.adminSelectObra = obraId => {
    state.adminSelectedObraId=obraId||null; renderAdminDetail();
  };
  window.toggleBloqueio = async (uid, bloqueado) => {
    try {
      await updateDoc(doc(db,'users',uid),{ blocked: !bloqueado });
      showToast(bloqueado ? '\u2705 Colaborador desbloqueado.' : '\u{1F512} Colaborador bloqueado.');
    } catch(err){ showToast('\u274C '+err.message,true); }
  };
  window.removeColab = async uid => {
    if(!confirm('Remover este colaborador permanentemente?')) return;
    try {
      await updateDoc(doc(db,'users',uid),{ disabled: true });
      showToast('\u2705 Colaborador removido.');
    } catch(err){ showToast('\u274C '+err.message,true); }
  };

  const loginForm=$('loginForm');
  if(loginForm) loginForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('loginBtn'); btn.disabled=true; btn.textContent='Entrando...';
    const errBox=$('loginError'); errBox.style.display='none';
    try{
      await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginSenha').value);
    } catch(err){
      errBox.textContent='E-mail ou senha incorretos.'; errBox.style.display='block';
    } finally { btn.disabled=false; btn.textContent='Entrar'; }
  });

  const logoutUser=$('logoutBtnUser');  if(logoutUser)  logoutUser.onclick =async()=>{ await signOut(auth); cleanup(); };
  const logoutAdmin=$('logoutBtnAdmin'); if(logoutAdmin) logoutAdmin.onclick=async()=>{ await signOut(auth); cleanup(); };

  const themeBtn=$('toggleTheme');
  if(themeBtn) themeBtn.onclick=()=>{
    const html=document.documentElement, dark=html.dataset.theme==='dark';
    html.dataset.theme=dark?'light':'dark';
    themeBtn.textContent=dark?'\u{1F319}':'\u2600\uFE0F';
    updateDashboard();
  };

  const menuBtn=$('menuBtn');
  if(menuBtn) menuBtn.onclick=()=>{ const a=document.querySelector('.app-aside'); if(a) a.classList.toggle('aside-open'); };
  const menuBtnAdmin=$('menuBtnAdmin');
  if(menuBtnAdmin) menuBtnAdmin.onclick=()=>{ const a=$('adminAside'); if(a) a.classList.toggle('aside-open'); };

  const loadFileBtn=$('loadFile');   if(loadFileBtn)  loadFileBtn.onclick =()=>importFile(false);
  const addObraBtn=$('addObraBtn');  if(addObraBtn)   addObraBtn.onclick  =()=>importFile(false);
  setImportFileFn(replace=>importFile(replace));

  const loadCrono=$('loadCronograma');       if(loadCrono)   loadCrono.onclick  =()=>importCronograma();
  const loadMensal=$('loadCronogramaMensal'); if(loadMensal)  loadMensal.onclick =()=>importCronogramaMensal();
  const btnNovoAditivo=$('btnNovoAditivo');   if(btnNovoAditivo) btnNovoAditivo.onclick=()=>addNovoAditivo();

  const aditivosBox=$('aditivosBox');
  if(aditivosBox){
    aditivosBox.addEventListener('click',e=>{
      const btn=e.target.closest('[data-aditivo-action]'); if(!btn) return;
      const action=btn.dataset.aditivoAction, id=btn.dataset.aditivoId;
      if(action==='previsto') importCronogramaPrevistoAditivo(id);
      if(action==='mensal')   importCronogramaMensalAditivo(id);
      if(action==='remover')  removerAditivo(id);
    });
    aditivosBox.addEventListener('blur',async e=>{
      const inp=e.target.closest('[data-aditivo-nome]'); if(!inp) return;
      await renomearAditivo(inp.dataset.aditivoNome, inp.value);
    },true);
  }

  const exportCsv=$('exportCsv');
  if(exportCsv) exportCsv.onclick=()=>{
    if(!state.rows.length){ showToast('Nenhum dado para exportar.',true); return; }
    const header=['Item','Descri\u00e7\u00e3o','Valor Contrato','Medi\u00e7\u00e3o','Acumulado','Saldo','% Exec.'];
    const rows=state.rows.map(r=>[r.item,r.descricao,r.valorContrato,r.medicao,r.acumulado,r.saldo,r.percentualExecutado]);
    const csv=[header,...rows].map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download='medicao.csv'; a.click();
  };

  const saveJson=$('saveJson');
  if(saveJson) saveJson.onclick=()=>{
    const o=currentObra()||{};
    const blob=new Blob([JSON.stringify({...o,itens:state.rows},null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(o.nome||'obra')+'.json'; a.click();
  };

  const fillSample=$('fillSample');
  if(fillSample) fillSample.onclick=async()=>{
    if(!confirm('Limpar todos os itens da obra atual?')) return;
    state.rows=[];
    const o=currentObra(); if(o){ o.itens=[]; await saveObra(o); }
    renderAll();
  };

  const addRowBtn=$('addRow');
  if(addRowBtn) addRowBtn.onclick=()=>{
    const vc=parseMoney($('fValorContrato').value);
    const med=parseMoney($('fMedicao').value);
    const acu=parseMoney($('fAcumulado').value);
    const saldo=vc-acu;
    const p=vc>0?+(acu/vc*100).toFixed(2):0;
    state.rows.push({
      item:$('fItem').value.trim()||String(state.rows.length+1),
      descricao:$('fName').value.trim(),
      valorContrato:vc, medicao:med, acumulado:acu, saldo, percentualExecutado:p
    });
    ['fItem','fName','fValorContrato','fMedicao','fAcumulado'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    scheduleSave(); renderAll();
  };

  const tbody=$('tbody');
  if(tbody){
    tbody.addEventListener('blur',e=>{
      const td=e.target.closest('[data-k]'); if(!td) return;
      const tr=td.closest('[data-i]'); if(!tr) return;
      const i=+tr.dataset.i, k=td.dataset.k;
      const raw=td.textContent.trim();
      const r=state.rows[i]; if(!r) return;
      if(['valorContrato','medicao','acumulado','saldo','percentualExecutado'].includes(k)){
        r[k]=parseMoney(raw);
      } else { r[k]=raw; }
      if(k==='valorContrato'||k==='acumulado'||k==='medicao'){
        const vc=Number(r.valorContrato)||0, ac=Number(r.acumulado)||0;
        r.saldo=vc-ac;
        r.percentualExecutado=vc>0?+(ac/vc*100).toFixed(2):0;
        renderAll();
      }
      scheduleSave();
    },true);
    tbody.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-del]'); if(!btn) return;
      state.rows.splice(+btn.dataset.del,1);
      scheduleSave(); renderAll();
    });
  }

  const projDataInicio=$('projDataInicio');
  if(projDataInicio) projDataInicio.addEventListener('change',async()=>{
    const o=currentObra(); if(!o) return;
    o.dataInicio=projDataInicio.value;
    await saveObra(o); updateDashboard();
  });

  const adminToggle=$('adminToggleColab');
  if(adminToggle) adminToggle.onclick=()=>{
    const p=$('adminColabPanel');
    if(p) p.style.display=p.style.display==='none'?'block':'none';
  };

  window.addEventListener('scroll',()=>{
    const btn=$('btnTopo'); if(btn) btn.style.display=window.scrollY>300?'flex':'none';
  });
}

export function setupNovaAtividade(){
  const vc=$('fValorContrato'), med=$('fMedicao'), acu=$('fAcumulado');
  const update=()=>{
    if(!vc||!med||!acu) return;
    const v=parseMoney(vc.value), a=parseMoney(acu.value);
    const saldoEl=$('fSaldo'), pctEl=$('fPct');
    if(saldoEl) saldoEl.value=money(v-a);
    if(pctEl)   pctEl.value=(v>0?+(a/v*100).toFixed(2):0)+'%';
  };
  if(vc)  vc.addEventListener('input',update);
  if(med) med.addEventListener('input',update);
  if(acu) acu.addEventListener('input',update);
}
