import { $, state, parseMoney, baseName, EXCEL_EXTS, showToast, cleanup, money } from './state.js';
import { auth, db, ADMIN_SENHA } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { readExcelFile, normalizeRows } from './excel.js';
import {
  saveObra, deleteObra, scheduleSave, currentObra,
  renderAll, renderCurvaS, applySelected, setImportFileFn,
  updateDashboard,
  renderAdminViews, renderAdminDetail, renderColabList, renderAdminSidebar
} from './render.js';

export async function importFile(replace=false){
  const input=document.createElement('input');
  input.type='file';
  input.accept=['.xlsx','.xls','.xlsm','.xlsb','.xlam','.xla','.ods','.csv','.json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12','application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.oasis.opendocument.spreadsheet','text/csv','application/json'].join(',');
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    const ext=file.name.split('.').pop().toLowerCase();
    try{
      let obj,rows=[];
      if(EXCEL_EXTS.has(ext)){
        obj=await readExcelFile(file); rows=normalizeRows(obj.itens);
        if(obj.warnings?.length) console.warn('[Import]',obj.warnings.slice(0,5).join('\n'));
      } else if(ext==='json'){
        const text=await file.text(); obj=JSON.parse(text);
        rows=Array.isArray(obj)?normalizeRows(obj):normalizeRows(obj.itens);
        if(!rows.length&&!Array.isArray(obj)&&!Array.isArray(obj.itens)) throw new Error('JSON inv\u00e1lido.');
      } else { obj=await readExcelFile(file); rows=normalizeRows(obj.itens); }
      const obraId=replace&&state.selectedObraId?state.selectedObraId:('obra_'+Date.now());
      const obraNome=baseName(file.name)||obj?.nome||'Nova obra';
      const obra={ id:obraId, nome:obraNome, nomeProjeto:obj?.nomeProjeto||obj?.obra||obraNome,
        contratada:obj?.contratada||'', arquivoNome:file.name, origem:ext,
        medicaoAtual:obj?.medicaoAtual||'', itens:rows, resumo:obj?.resumo||{percentual:0} };
      await saveObra(obra);
      state.selectedObraId=obraId;
      showToast(`\u2705 ${rows.length} itens importados`);
    } catch(err){ showToast('\u274c '+err.message,true); console.error(err); }
  };
  input.click();
}

export function setupColabForm(){
  const form=$('addColabForm'); if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const nome=$('colabNome').value.trim(), email=$('colabEmail').value.trim(), senha=$('colabSenha').value;
    const msgEl=$('colabMsgError'), btn=$('addColabBtn');
    if(!nome||!email||!senha) return;
    btn.disabled=true; btn.textContent='Cadastrando...'; msgEl.style.display='none';
    const adminEmail=state.user.email;
    try{
      const cred=await createUserWithEmailAndPassword(auth,email,senha);
      await setDoc(doc(db,'users',cred.user.uid),{nome,email,role:'colaborador',criadoEm:Date.now(),disabled:false,blocked:false});
      await signOut(auth);
      await signInWithEmailAndPassword(auth,adminEmail,ADMIN_SENHA);
      $('colabNome').value=''; $('colabEmail').value=''; $('colabSenha').value='';
      showToast(`\u2705 "${nome}" cadastrado!`);
    }catch(err){ msgEl.textContent=err?.message||'Erro.'; msgEl.style.display='block'; }
    finally{ btn.disabled=false; btn.textContent='Cadastrar colaborador'; }
  });
}

export function setupNovaAtividade(){
  const recalc=()=>{
    const vc=parseMoney($('fValorContrato').value), acu=parseMoney($('fAcumulado').value);
    if(vc>0){ $('fSaldo').value=(vc-acu).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); $('fPct').value=(acu/vc*100).toFixed(2); }
    else{ $('fSaldo').value=''; $('fPct').value=''; }
  };
  ['fValorContrato','fMedicao','fAcumulado'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input',recalc); });
  const addRowBtn=$('addRow');
  if(addRowBtn) addRowBtn.onclick=()=>{
    const item=$('fItem').value.trim(), desc=$('fName').value.trim();
    if(!item&&!desc){ showToast('\u26a0\ufe0f Preencha item ou descri\u00e7\u00e3o.',true); return; }
    const vc=parseMoney($('fValorContrato').value), med=parseMoney($('fMedicao').value), acu=parseMoney($('fAcumulado').value);
    const saldo=vc>0?vc-acu:0, p=vc>0?+(acu/vc*100).toFixed(2):0;
    state.rows.push({item,descricao:desc,valorContrato:vc,medicao:med,acumulado:acu,saldo,percentualExecutado:p});
    const o=currentObra(); if(o){ o.itens=state.rows; saveObra(o); }
    renderAll();
    $('fItem').value=''; $('fName').value=''; $('fValorContrato').value=''; $('fMedicao').value=''; $('fAcumulado').value=''; $('fSaldo').value=''; $('fPct').value='';
    showToast('\u2705 Item adicionado.');
  };
}

export function bindEvents(){
  setImportFileFn(importFile);
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('loginEmail').value.trim(), senha=$('loginSenha').value, btn=$('loginBtn');
    btn.disabled=true; btn.textContent='Entrando...'; $('loginError').style.display='none';
    try{ await signInWithEmailAndPassword(auth,email,senha); }
    catch{ $('loginError').textContent='E-mail ou senha inv\u00e1lidos.'; $('loginError').style.display='block'; }
    finally{ btn.disabled=false; btn.textContent='Entrar'; }
  });
  const logoutAdmin=$('logoutBtnAdmin'); if(logoutAdmin) logoutAdmin.addEventListener('click',()=>{ cleanup(); signOut(auth); });
  const logoutUser=$('logoutBtnUser');   if(logoutUser)  logoutUser.addEventListener('click',()=>{ cleanup(); signOut(auth); });
  const toggleThemeBtn=$('toggleTheme');
  if(toggleThemeBtn) toggleThemeBtn.onclick=()=>{
    document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
    if(state.rows.length) state.chartUser=renderCurvaS('sCurveChart','sCurveScrollWrap',state.rows,state.chartUser);
  };
  const menuBtn=$('menuBtn');
  if(menuBtn) menuBtn.onclick=()=>{
    const aside=document.querySelector('#appView .app-aside');
    if(!aside) return;
    const open=aside.classList.toggle('aside-open');
    menuBtn.textContent=open?'\u2715':'\u2630';
  };
  const menuBtnAdmin=$('menuBtnAdmin');
  if(menuBtnAdmin) menuBtnAdmin.onclick=()=>{
    const aside=$('adminAside');
    if(!aside) return;
    const open=aside.classList.toggle('aside-open');
    menuBtnAdmin.textContent=open?'\u2715':'\u2630';
  };
  const adminToggleColab=$('adminToggleColab');
  if(adminToggleColab) adminToggleColab.onclick=()=>{ const p=$('adminColabPanel'); if(p) p.style.display=p.style.display==='none'?'block':'none'; };
  const loadFileBtn=$('loadFile');     if(loadFileBtn)  loadFileBtn.onclick=()=>importFile(false);
  const addObraBtn=$('addObraBtn');    if(addObraBtn)   addObraBtn.onclick=()=>importFile(false);
  const fillSampleBtn=$('fillSample'); if(fillSampleBtn) fillSampleBtn.onclick=()=>{
    if(!confirm('Limpar todos os itens?')) return;
    state.rows=[]; const o=currentObra(); if(o){ o.itens=[]; saveObra(o); } renderAll();
  };
  const exportCsvBtn=$('exportCsv');
  if(exportCsvBtn) exportCsvBtn.onclick=()=>{
    const fields=['item','descricao','valorContrato','medicao','acumulado','saldo','percentualExecutado'];
    const body=state.rows.map(r=>fields.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([fields.join(',')+' \n'+body],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cronograma.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const saveJsonBtn=$('saveJson');
  if(saveJsonBtn) saveJsonBtn.onclick=()=>{
    const o=currentObra(), name=($('projName')?.value||'').trim()||'projeto';
    const blob=new Blob([JSON.stringify({obra:name,medicaoAtual:o?.medicaoAtual||'',itens:state.rows},null,2)],{type:'application/json;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name.replace(/[^a-zA-Z0-9\-_]/g,'-').toLowerCase()+'.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  const projContratada=$('projContratada');
  if(projContratada) projContratada.addEventListener('input',()=>{
    const o=currentObra(); if(!o) return;
    o.contratada=projContratada.value.trim(); scheduleSave();
  });
  const tbody=$('tbody');
  if(tbody){
    tbody.addEventListener('input',e=>{
      const t=e.target, tr=t.closest('tr'); if(!tr) return;
      const i=+tr.dataset.i, k=t.dataset.k; if(!k) return;
      if(['valorContrato','medicao','acumulado','saldo','percentualExecutado'].includes(k))
        state.rows[i][k]=Number(t.textContent.replace(',','.').replace(/[^\d.-]/g,''))||0;
      else state.rows[i][k]=t.textContent.trim();
      updateDashboard(); scheduleSave();
    });
    tbody.addEventListener('focusout',e=>{
      const t=e.target, tr=t.closest('tr'); if(!tr) return;
      const i=+tr.dataset.i, k=t.dataset.k;
      if(k&&['valorContrato','medicao','acumulado','saldo'].includes(k)) t.textContent=money(state.rows[i][k]);
      else if(k==='percentualExecutado') t.textContent=Number(state.rows[i][k]).toFixed(2);
    });
    tbody.addEventListener('click',e=>{
      const b=e.target.closest('button[data-del]'); if(!b) return;
      state.rows.splice(+b.dataset.del,1);
      const o=currentObra(); if(o){ o.itens=state.rows; saveObra(o); }
      renderAll();
    });
  }
  window.addEventListener('scroll',()=>{ const b=$('btnTopo'); if(b) b.classList.toggle('visible',window.scrollY>200); });

  window.adminSelectColab  =uid=>{ state.adminSelectedUid=uid; state.adminSelectedObraId=null; renderAdminSidebar(); renderAdminDetail(); };
  window.adminDeselectColab=()=>{ state.adminSelectedUid=null; state.adminSelectedObraId=null; renderAdminSidebar(); renderAdminDetail(); };
  window.adminSelectObra   =id=>{ state.adminSelectedObraId=id||null; renderAdminDetail(); };
  window.toggleBloqueio=async(uid,isBlocked)=>{
    await updateDoc(doc(db,'users',uid),{blocked:!isBlocked});
    state.allUsers[uid].blocked=!isBlocked;
    renderColabList(); renderAdminSidebar();
    if(state.adminSelectedUid===uid) renderAdminDetail();
  };
  window.removeColab=async uid=>{
    if(!confirm('Remover colaborador?')) return;
    await updateDoc(doc(db,'users',uid),{disabled:true});
    delete state.allUsers[uid];
    if(state.adminSubs[uid]){ state.adminSubs[uid](); delete state.adminSubs[uid]; }
    if(state.adminSelectedUid===uid){ state.adminSelectedUid=null; state.adminSelectedObraId=null; }
    renderAdminViews(); renderAdminDetail();
    showToast('\u2705 Colaborador removido.');
  };
}
