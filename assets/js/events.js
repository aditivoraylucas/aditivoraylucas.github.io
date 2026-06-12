import { $, state, parseMoney, baseName, EXCEL_EXTS, showToast, cleanup, money } from './state.js';
import { auth, db, ADMIN_SENHA } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { readExcelFile, normalizeRows } from './excel.js';
import {
  saveObra, deleteObra, scheduleSave, currentObra,
  renderAll, renderCurvaS1, renderCurvaS2, applySelected, setImportFileFn,
  updateDashboard, renderCronogramaBox, renderCronogramaAditivoBox,
  renderCronogramaMensalBox,
  renderAdminViews, renderAdminDetail, renderColabList, renderAdminSidebar
} from './render.js';
import { parseCronogramaXLSX } from './cronograma.js';

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

      if(replace){
        const existente=currentObra();
        if(existente?.cronograma)              obra.cronograma             = existente.cronograma;
        if(existente?.dataInicio)              obra.dataInicio             = existente.dataInicio;
        if(existente?.dataEmissao)             obra.dataEmissao            = existente.dataEmissao;
        if(existente?.cronogramaExecucao)      obra.cronogramaExecucao     = existente.cronogramaExecucao;
        if(existente?.cronogramaAditivo)       obra.cronogramaAditivo      = existente.cronogramaAditivo;
        if(existente?.dataInicioAditivo)       obra.dataInicioAditivo      = existente.dataInicioAditivo;
        if(existente?.dataEmissaoAditivo)      obra.dataEmissaoAditivo     = existente.dataEmissaoAditivo;
      }

      await saveObra(obra);
      state.selectedObraId=obraId;
      showToast(`\u2705 ${rows.length} itens importados`);
    } catch(err){ showToast('\u274c '+err.message,true); console.error(err); }
  };
  input.click();
}

export async function importCronograma(){
  const o=currentObra();
  if(!o){ showToast('\u26a0\ufe0f Selecione uma obra antes de importar o cronograma.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const { cronograma, totalMeses, dataEmissao } = parseCronogramaXLSX(wb);
      o.cronograma  = cronograma;
      if(dataEmissao) o.dataEmissao = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emiss\u00e3o: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      showToast(`\u2705 Cronograma do contrato importado: ${totalMeses} meses${emissaoTxt}.`);
      renderCronogramaBox();
      updateDashboard();
    } catch(err){ showToast('\u274c '+err.message,true); console.error(err); }
  };
  input.click();
}

export async function importCronogramaMensal(){
  const o=currentObra();
  if(!o){ showToast('\u26a0\ufe0f Selecione uma obra antes de importar o cronograma mensal.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      // Reutiliza o mesmo parser — a coluna planejadoPct vira executadoPct
      const { cronograma, totalMeses } = parseCronogramaXLSX(wb);
      // Remapeia: planejadoPct => executadoPct (execu\u00e7\u00e3o real mensal)
      o.cronogramaExecucao = cronograma.map(m => ({
        mes: m.mes,
        executadoPct:   m.planejadoPct,
        executadoValor: m.planejadoValor
      }));
      await saveObra(o);
      showToast(`\u2705 Cronograma mensal importado: ${totalMeses} meses.`);
      renderCronogramaMensalBox();
      updateDashboard();
    } catch(err){ showToast('\u274c '+err.message,true); console.error(err); }
  };
  input.click();
}

export async function importCronogramaAditivo(){
  const o=currentObra();
  if(!o){ showToast('\u26a0\ufe0f Selecione uma obra antes de importar o cronograma de aditivo.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const { cronograma, totalMeses, dataEmissao } = parseCronogramaXLSX(wb);
      o.cronogramaAditivo  = cronograma;
      if(dataEmissao) o.dataEmissaoAditivo = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      if(!o.dataInicioAditivo) o.dataInicioAditivo = o.dataInicio || null;
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emiss\u00e3o: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      showToast(`\u2705 Cronograma de aditivo importado: ${totalMeses} meses${emissaoTxt}.`);
      renderCronogramaAditivoBox();
      updateDashboard();
    } catch(err){ showToast('\u274c '+err.message,true); console.error(err); }
  };
  input.click();
}

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
  /* ---- Login / Logout ---- */
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

  const logoutUser=$('logoutBtnUser');
  if(logoutUser) logoutUser.onclick=async()=>{ await signOut(auth); cleanup(); };
  const logoutAdmin=$('logoutBtnAdmin');
  if(logoutAdmin) logoutAdmin.onclick=async()=>{ await signOut(auth); cleanup(); };

  /* ---- Tema ---- */
  const themeBtn=$('toggleTheme');
  if(themeBtn) themeBtn.onclick=()=>{
    const html=document.documentElement;
    const dark=html.dataset.theme==='dark';
    html.dataset.theme=dark?'light':'dark';
    themeBtn.textContent=dark?'\ud83c\udf19':'\u2600\ufe0f';
    updateDashboard();
  };

  /* ---- Menu lateral ---- */
  const menuBtn=$('menuBtn');
  if(menuBtn) menuBtn.onclick=()=>{ const a=document.querySelector('.app-aside'); if(a) a.classList.toggle('open'); };
  const menuBtnAdmin=$('menuBtnAdmin');
  if(menuBtnAdmin) menuBtnAdmin.onclick=()=>{ const a=$('adminAside'); if(a) a.classList.toggle('open'); };

  /* ---- Importar Excel / Nova Obra ---- */
  const loadFileBtn=$('loadFile');   if(loadFileBtn) loadFileBtn.onclick=()=>importFile(false);
  const addObraBtn=$('addObraBtn');  if(addObraBtn)  addObraBtn.onclick=()=>importFile(false);
  setImportFileFn((replace)=>importFile(replace));

  /* ---- Cronograma do Contrato ---- */
  const loadCrono=$('loadCronograma');
  if(loadCrono) loadCrono.onclick=()=>importCronograma();

  /* ---- Cronograma Mensal (execu\u00e7\u00e3o real) ---- */
  const loadMensal=$('loadCronogramaMensal');
  if(loadMensal) loadMensal.onclick=()=>importCronogramaMensal();

  /* ---- Cronograma de Aditivo ---- */
  const loadAditivo=$('loadCronogramaAditivo');
  if(loadAditivo) loadAditivo.onclick=()=>importCronogramaAditivo();

  /* ---- Exportar CSV ---- */
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

  /* ---- Salvar JSON ---- */
  const saveJson=$('saveJson');
  if(saveJson) saveJson.onclick=()=>{
    const o=currentObra()||{};
    const blob=new Blob([JSON.stringify({...o,itens:state.rows},null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(o.nome||'obra')+'.json'; a.click();
  };

  /* ---- Limpar itens ---- */
  const fillSample=$('fillSample');
  if(fillSample) fillSample.onclick=async()=>{
    if(!confirm('Limpar todos os itens da obra atual?')) return;
    state.rows=[];
    const o=currentObra(); if(o){ o.itens=[]; await saveObra(o); }
    renderAll();
  };

  /* ---- Adicionar linha ---- */
  const addRowBtn=$('addRow');
  if(addRowBtn) addRowBtn.onclick=()=>{
    const vc=parseMoney($('fValorContrato').value);
    const med=parseMoney($('fMedicao').value);
    const acu=parseMoney($('fAcumulado').value);
    const saldo=vc-acu;
    const pct=vc>0?+(acu/vc*100).toFixed(2):0;
    state.rows.push({
      item:$('fItem').value.trim()||String(state.rows.length+1),
      descricao:$('fName').value.trim(),
      valorContrato:vc, medicao:med, acumulado:acu, saldo, percentualExecutado:pct
    });
    ['fItem','fName','fValorContrato','fMedicao','fAcumulado'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    scheduleSave(); renderAll();
  };

  /* ---- Editar c\u00e9lulas da tabela ---- */
  const tbody=$('tbody');
  if(tbody){
    tbody.addEventListener('blur',e=>{
      const td=e.target.closest('[data-k]'); if(!td) return;
      const tr=td.closest('[data-i]'); if(!tr) return;
      const i=+tr.dataset.i; const k=td.dataset.k;
      const raw=td.textContent.trim();
      const r=state.rows[i]; if(!r) return;
      if(['valorContrato','medicao','acumulado','saldo','percentualExecutado'].includes(k)){
        r[k]=parseMoney(raw);
      } else { r[k]=raw; }
      if(k==='valorContrato'||k==='acumulado'||k==='medicao'){
        const vc=Number(r.valorContrato)||0;
        const ac=Number(r.acumulado)||0;
        r.saldo=vc-ac;
        r.percentualExecutado=vc>0?+(ac/vc*100).toFixed(2):0;
        renderAll();
      }
      scheduleSave();
    },true);
    tbody.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-del]'); if(!btn) return;
      const i=+btn.dataset.del;
      state.rows.splice(i,1);
      scheduleSave(); renderAll();
    });
  }

  /* ---- Data de in\u00edcio da obra ---- */
  const projDataInicio=$('projDataInicio');
  if(projDataInicio) projDataInicio.addEventListener('change',async()=>{
    const o=currentObra(); if(!o) return;
    o.dataInicio=projDataInicio.value;
    await saveObra(o);
    updateDashboard();
  });

  /* ---- Admin: painel colaboradores ---- */
  const adminToggle=$('adminToggleColab');
  if(adminToggle) adminToggle.onclick=()=>{
    const p=$('adminColabPanel');
    if(p) p.style.display=p.style.display==='none'?'block':'none';
  };

  /* ---- Topo (mobile) ---- */
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
  if(vc) vc.addEventListener('input',update);
  if(med) med.addEventListener('input',update);
  if(acu) acu.addEventListener('input',update);
}
