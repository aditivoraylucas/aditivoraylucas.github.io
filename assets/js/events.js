import { $, state, parseMoney, baseName, EXCEL_EXTS, showToast, cleanup, money } from './state.js';
import { auth, db, ADMIN_SENHA } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { readExcelFile, normalizeRows } from './excel.js';
import {
  saveObra, deleteObra, scheduleSave, currentObra,
  renderAll, renderCurvaS1, renderCurvaS2, applySelected, setImportFileFn,
  updateDashboard, renderCronogramaBox, renderCronogramaMensalBox,
  renderAditivosSection,
  renderAdminViews, renderAdminDetail, renderColabList, renderAdminSidebar
} from './render.js';
import { parseCronogramaXLSX } from './cronograma.js';

export function importFile(replace=false){
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
        if(!rows.length&&!Array.isArray(obj)&&!Array.isArray(obj.itens)) throw new Error('JSON inválido.');
      } else { obj=await readExcelFile(file); rows=normalizeRows(obj.itens); }
      const obraId=replace&&state.selectedObraId?state.selectedObraId:('obra_'+Date.now());
      const obraNome=baseName(file.name)||obj?.nome||'Nova obra';
      const obra={ id:obraId, nome:obraNome, nomeProjeto:obj?.nomeProjeto||obj?.obra||obraNome,
        contratada:obj?.contratada||'', arquivoNome:file.name, origem:ext,
        medicaoAtual:obj?.medicaoAtual||'', itens:rows, resumo:obj?.resumo||{percentual:0} };
      if(replace){
        const existente=currentObra();
        if(existente?.cronograma)         obra.cronograma         = existente.cronograma;
        if(existente?.dataInicio)         obra.dataInicio         = existente.dataInicio;
        if(existente?.dataEmissao)        obra.dataEmissao        = existente.dataEmissao;
        if(existente?.cronogramaExecucao) obra.cronogramaExecucao = existente.cronogramaExecucao;
        if(existente?.aditivos)           obra.aditivos           = existente.aditivos;
        if(existente?.cronogramaAditivo)  obra.cronogramaAditivo  = existente.cronogramaAditivo;
        if(existente?.dataInicioAditivo)  obra.dataInicioAditivo  = existente.dataInicioAditivo;
        if(existente?.dataEmissaoAditivo) obra.dataEmissaoAditivo = existente.dataEmissaoAditivo;
        if(existente?.cronogramaItens)    obra.cronogramaItens    = existente.cronogramaItens;
      }
      await saveObra(obra);
      state.selectedObraId=obraId;
      showToast(`✅ ${rows.length} itens importados`);
    } catch(err){ showToast('❌ '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronograma(){
  const o=currentObra();
  if(!o){ showToast('⚠️ Selecione uma obra antes de importar o cronograma.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const { cronograma, totalMeses, itens, dataEmissao } = parseCronogramaXLSX(wb);
      o.cronograma = cronograma;
      // Salva os itens do cronograma para habilitar as Curvas S por serviço
      if(Array.isArray(itens) && itens.length > 0){
        o.cronogramaItens = itens;
      }
      if(dataEmissao) o.dataEmissao = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emissão: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      const itensTxt   = Array.isArray(itens) && itens.length > 0 ? ` | ${itens.length} serviços` : '';
      showToast(`✅ Cronograma do contrato importado: ${totalMeses} meses${emissaoTxt}${itensTxt}.`);
      renderCronogramaBox();
      updateDashboard();
    } catch(err){ showToast('❌ '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaMensal(){
  const o=currentObra();
  if(!o){ showToast('⚠️ Selecione uma obra antes de importar o cronograma mensal.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const { cronograma, totalMeses } = parseCronogramaXLSX(wb);
      o.cronogramaExecucao = cronograma.map(m => ({
        mes: m.mes,
        executadoPct:   m.planejadoPct,
        executadoValor: m.planejadoValor
      }));
      await saveObra(o);
      showToast(`✅ Cronograma mensal importado: ${totalMeses} meses.`);
      renderCronogramaMensalBox();
      updateDashboard();
    } catch(err){ showToast('❌ '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaPrevistoAditivo(aditivoId){
  const o=currentObra();
  if(!o||!aditivoId){ showToast('⚠️ Obra ou aditivo não encontrado.',true); return; }
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
      const ad = (o.aditivos||[]).find(a=>a.id===aditivoId);
      if(!ad) throw new Error('Aditivo não encontrado.');
      ad.cronograma = cronograma;
      if(dataEmissao) ad.dataEmissao = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emissão: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      showToast(`✅ Previsto importado: ${totalMeses} meses${emissaoTxt}.`);
      renderAditivosSection();
      updateDashboard();
    } catch(err){ showToast('❌ '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaMensalAditivo(aditivoId){
  const o=currentObra();
  if(!o||!aditivoId){ showToast('⚠️ Obra ou aditivo não encontrado.',true); return; }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  input.onchange=async e=>{
    if(!e.target.files.length) return;
    const file=e.target.files[0];
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const { cronograma, totalMeses } = parseCronogramaXLSX(wb);
      const ad = (o.aditivos||[]).find(a=>a.id===aditivoId);
      if(!ad) throw new Error('Aditivo não encontrado.');
      ad.cronogramaExecucao = cronograma.map(m => ({
        mes: m.mes,
        executadoPct:   m.planejadoPct,
        executadoValor: m.planejadoValor
      }));
      await saveObra(o);
      showToast(`✅ Mensal do aditivo importado: ${totalMeses} meses.`);
      renderAditivosSection();
      updateDashboard();
    } catch(err){ showToast('❌ '+err.message,true); console.error(err); }
  };
  input.click();
}

export async function addNovoAditivo(){
  const o=currentObra();
  if(!o){ showToast('⚠️ Selecione uma obra antes de adicionar um aditivo.',true); return; }
  if(!o.aditivos) o.aditivos=[];
  o.aditivos.push({
    id:                 'aditivo_'+Date.now(),
    nome:               'Novo aditivo',
    cronograma:         [],
    cronogramaExecucao: [],
    dataEmissao:        null
  });
  await saveObra(o);
  showToast('✅ Aditivo criado.');
  renderAditivosSection();
  updateDashboard();
}

export async function renomearAditivo(aditivoId, novoNome){
  const o=currentObra(); if(!o) return;
  const ad=(o.aditivos||[]).find(a=>a.id===aditivoId); if(!ad) return;
  ad.nome = novoNome.trim() || ad.nome;
  await saveObra(o);
  renderAditivosSection();
}

export async function removerAditivo(aditivoId){
  const o=currentObra(); if(!o) return;
  if(!confirm('Remover este aditivo e seu cronograma?')) return;
  o.aditivos=(o.aditivos||[]).filter(a=>a.id!==aditivoId);
  await saveObra(o);
  showToast('✅ Aditivo removido.');
  renderAditivosSection();
  updateDashboard();
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
      showToast('✅ Colaborador cadastrado!');
      form.reset();
    } catch(err){
      errBox.textContent=err.message; errBox.style.display='block';
    } finally { btn.disabled=false; btn.textContent='Cadastrar colaborador'; }
  });
}

export function bindEvents(){
  /* ── Expõe funções admin no window para uso via onclick inline no HTML gerado ── */
  window.adminSelectColab = (uid) => {
    state.adminSelectedUid  = uid;
    state.adminSelectedObraId = null;
    renderAdminSidebar();
    renderAdminDetail();
  };
  window.adminDeselectColab = () => {
    state.adminSelectedUid  = null;
    state.adminSelectedObraId = null;
    renderAdminSidebar();
    renderAdminDetail();
  };
  window.adminSelectObra = (obraId) => {
    state.adminSelectedObraId = obraId || null;
    renderAdminDetail();
  };
  window.toggleBloqueio = async (uid, bloqueado) => {
    try {
      await updateDoc(doc(db,'users',uid),{ blocked: !bloqueado });
      showToast(bloqueado ? '✅ Colaborador desbloqueado.' : '🔒 Colaborador bloqueado.');
    } catch(err){ showToast('❌ '+err.message,true); }
  };
  window.removeColab = async (uid) => {
    if(!confirm('Remover este colaborador permanentemente?')) return;
    try {
      await updateDoc(doc(db,'users',uid),{ disabled: true });
      showToast('✅ Colaborador removido.');
    } catch(err){ showToast('❌ '+err.message,true); }
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

  const logoutUser=$('logoutBtnUser');
  if(logoutUser) logoutUser.onclick=async()=>{ await signOut(auth); cleanup(); };
  const logoutAdmin=$('logoutBtnAdmin');
  if(logoutAdmin) logoutAdmin.onclick=async()=>{ await signOut(auth); cleanup(); };

  const themeBtn=$('toggleTheme');
  if(themeBtn) themeBtn.onclick=()=>{
    const html=document.documentElement;
    const dark=html.dataset.theme==='dark';
    html.dataset.theme=dark?'light':'dark';
    themeBtn.textContent=dark?'🌙':'☀️';
    updateDashboard();
  };

  // Corrigido: usa 'aside-open' (classe correta do CSS)
  const menuBtn=$('menuBtn');
  if(menuBtn) menuBtn.onclick=()=>{ const a=document.querySelector('.app-aside'); if(a) a.classList.toggle('aside-open'); };
  const menuBtnAdmin=$('menuBtnAdmin');
  if(menuBtnAdmin) menuBtnAdmin.onclick=()=>{ const a=$('adminAside'); if(a) a.classList.toggle('aside-open'); };

  const loadFileBtn=$('loadFile');  if(loadFileBtn) loadFileBtn.onclick=()=>importFile(false);
  const addObraBtn=$('addObraBtn'); if(addObraBtn)  addObraBtn.onclick=()=>importFile(false);
  setImportFileFn((replace)=>importFile(replace));

  const loadCrono=$('loadCronograma');
  if(loadCrono) loadCrono.onclick=()=>importCronograma();

  const loadMensal=$('loadCronogramaMensal');
  if(loadMensal) loadMensal.onclick=()=>importCronogramaMensal();

  const btnNovoAditivo=$('btnNovoAditivo');
  if(btnNovoAditivo) btnNovoAditivo.onclick=()=>addNovoAditivo();

  const aditivosBox=$('aditivosBox');
  if(aditivosBox){
    aditivosBox.addEventListener('click', e=>{
      const btn = e.target.closest('[data-aditivo-action]');
      if(!btn) return;
      const action = btn.dataset.aditivoAction;
      const id     = btn.dataset.aditivoId;
      if(action==='previsto') importCronogramaPrevistoAditivo(id);
      if(action==='mensal')   importCronogramaMensalAditivo(id);
      if(action==='remover')  removerAditivo(id);
    });
    aditivosBox.addEventListener('blur', async e=>{
      const inp = e.target.closest('[data-aditivo-nome]');
      if(!inp) return;
      const id = inp.dataset.aditivoNome;
      await renomearAditivo(id, inp.value);
    }, true);
  }

  const exportCsv=$('exportCsv');
  if(exportCsv) exportCsv.onclick=()=>{
    if(!state.rows.length){ showToast('Nenhum dado para exportar.',true); return; }
    const header=['Item','Descrição','Valor Contrato','Medição','Acumulado','Saldo','% Exec.'];
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
    const pct=vc>0?+(acu/vc*100).toFixed(2):0;
    state.rows.push({
      item:$('fItem').value.trim()||String(state.rows.length+1),
      descricao:$('fName').value.trim(),
      valorContrato:vc, medicao:med, acumulado:acu, saldo, percentualExecutado:pct
    });
    ['fItem','fName','fValorContrato','fMedicao','fAcumulado'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    scheduleSave(); renderAll();
  };

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

  const projDataInicio=$('projDataInicio');
  if(projDataInicio) projDataInicio.addEventListener('change',async()=>{
    const o=currentObra(); if(!o) return;
    o.dataInicio=projDataInicio.value;
    await saveObra(o);
    updateDashboard();
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
  if(vc) vc.addEventListener('input',update);
  if(med) med.addEventListener('input',update);
  if(acu) acu.addEventListener('input',update);
}
