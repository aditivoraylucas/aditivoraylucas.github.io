import { $, state, parseMoney, baseName, EXCEL_EXTS, showToast } from './state.js';
import { readExcelFile, normalizeRows } from './excel.js';
import { saveObra, currentObra, updateDashboard, renderCronogramaBox, renderCronogramaMensalBox, renderAditivosSection, renderAll } from './render.js';
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
        if(!rows.length&&!Array.isArray(obj)&&!Array.isArray(obj.itens)) throw new Error('JSON inv\u00e1lido.');
      } else { obj=await readExcelFile(file); rows=normalizeRows(obj.itens); }
      const obraId=replace&&state.selectedObraId?state.selectedObraId:('obra_'+Date.now());
      const obraNome=baseName(file.name)||obj?.nome||'Nova obra';
      const obra={ id:obraId, nome:obraNome, nomeProjeto:obj?.nomeProjeto||obj?.obra||obraNome,
        contratada:obj?.contratada||'', arquivoNome:file.name, origem:ext,
        medicaoAtual:obj?.medicaoAtual||'', itens:rows, resumo:obj?.resumo||{percentual:0} };
      if(replace){
        const ex=currentObra();
        if(ex?.cronograma)              obra.cronograma              = ex.cronograma;
        if(ex?.dataInicio)              obra.dataInicio              = ex.dataInicio;
        if(ex?.dataEmissao)             obra.dataEmissao             = ex.dataEmissao;
        if(ex?.cronogramaExecucao)      obra.cronogramaExecucao      = ex.cronogramaExecucao;
        if(ex?.aditivos)                obra.aditivos                = ex.aditivos;
        if(ex?.cronogramaAditivo)       obra.cronogramaAditivo       = ex.cronogramaAditivo;
        if(ex?.dataInicioAditivo)       obra.dataInicioAditivo       = ex.dataInicioAditivo;
        if(ex?.dataEmissaoAditivo)      obra.dataEmissaoAditivo      = ex.dataEmissaoAditivo;
        if(ex?.cronogramaItens)         obra.cronogramaItens         = ex.cronogramaItens;
        if(ex?.cronogramaItensExecucao) obra.cronogramaItensExecucao = ex.cronogramaItensExecucao;
        if(ex?.historicoExecucao)       obra.historicoExecucao       = ex.historicoExecucao;
      }
      await saveObra(obra);
      state.selectedObraId=obraId;
      showToast(`\u2705 ${rows.length} itens importados`);
    } catch(err){ showToast('\u274C '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronograma(){
  const o=currentObra();
  if(!o){ showToast('\u26A0\uFE0F Selecione uma obra antes de importar o cronograma.',true); return; }
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
      if(Array.isArray(itens)&&itens.length>0) o.cronogramaItens = itens;
      if(dataEmissao) o.dataEmissao = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emiss\u00e3o: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      const itensTxt   = Array.isArray(itens)&&itens.length>0 ? ` | ${itens.length} servi\u00e7os` : '';
      showToast(`\u2705 Cronograma do contrato importado: ${totalMeses} meses${emissaoTxt}${itensTxt}.`);
      renderCronogramaBox(); updateDashboard();
    } catch(err){ showToast('\u274C '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaMensal(){
  const o=currentObra();
  if(!o){ showToast('\u26A0\uFE0F Selecione uma obra antes de importar o cronograma mensal.',true); return; }
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

      // ── Validação: novo cronograma não pode ter menos meses que o anterior ──
      const totalAnterior = Array.isArray(o.cronogramaExecucao) ? o.cronogramaExecucao.length : 0;
      if(totalAnterior > 0 && totalMeses < totalAnterior){
        const ok = confirm(
          `\u26A0\uFE0F O novo cronograma tem ${totalMeses} meses, mas o anterior tinha ${totalAnterior} meses.\n` +
          `Isso pode indicar que o arquivo errado foi selecionado.\n\nDeseja continuar mesmo assim?`
        );
        if(!ok) return;
      }

      // ── Histórico: arquiva versão atual antes de sobrescrever ──
      if(Array.isArray(o.cronogramaItensExecucao) && o.cronogramaItensExecucao.length > 0){
        if(!Array.isArray(o.historicoExecucao)) o.historicoExecucao = [];
        // Limita a 6 versões para não inflar o documento
        if(o.historicoExecucao.length >= 6) o.historicoExecucao.shift();
        o.historicoExecucao.push({
          dataImportacao:          new Date().toISOString(),
          dataEmissao:             o.dataEmissaoExecucao || null,
          cronogramaExecucao:      o.cronogramaExecucao,
          cronogramaItensExecucao: o.cronogramaItensExecucao
        });
      }

      // ── Salva nova versão ──
      o.cronogramaExecucao = cronograma.map(m => ({ mes: m.mes, executadoPct: m.planejadoPct, executadoValor: m.planejadoValor }));
      if(Array.isArray(itens)&&itens.length>0) o.cronogramaItensExecucao = itens;
      if(dataEmissao) o.dataEmissaoExecucao = { mes: dataEmissao.mes, ano: dataEmissao.ano };

      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emiss\u00e3o: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      const itensTxt   = Array.isArray(itens)&&itens.length>0 ? ` | ${itens.length} servi\u00e7os` : '';
      const histTxt    = Array.isArray(o.historicoExecucao)&&o.historicoExecucao.length>0
        ? ` | ${o.historicoExecucao.length} vers\u00e3o(\u00f5es) no hist\u00f3rico` : '';
      showToast(`\u2705 Cronograma de execu\u00e7\u00e3o importado: ${totalMeses} meses${emissaoTxt}${itensTxt}${histTxt}.`);
      renderCronogramaMensalBox(); updateDashboard();
    } catch(err){ showToast('\u274C '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaPrevistoAditivo(aditivoId){
  const o=currentObra();
  if(!o||!aditivoId){ showToast('\u26A0\uFE0F Obra ou aditivo n\u00e3o encontrado.',true); return; }
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
      const ad=(o.aditivos||[]).find(a=>a.id===aditivoId);
      if(!ad) throw new Error('Aditivo n\u00e3o encontrado.');
      ad.cronograma = cronograma;
      if(dataEmissao) ad.dataEmissao = { mes: dataEmissao.mes, ano: dataEmissao.ano };
      await saveObra(o);
      const emissaoTxt = dataEmissao ? ` | Emiss\u00e3o: ${String(dataEmissao.mes).padStart(2,'0')}/${dataEmissao.ano}` : '';
      showToast(`\u2705 Previsto importado: ${totalMeses} meses${emissaoTxt}.`);
      renderAditivosSection(); updateDashboard();
    } catch(err){ showToast('\u274C '+err.message,true); console.error(err); }
  };
  input.click();
}

export function importCronogramaMensalAditivo(aditivoId){
  const o=currentObra();
  if(!o||!aditivoId){ showToast('\u26A0\uFE0F Obra ou aditivo n\u00e3o encontrado.',true); return; }
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
      const ad=(o.aditivos||[]).find(a=>a.id===aditivoId);
      if(!ad) throw new Error('Aditivo n\u00e3o encontrado.');
      ad.cronogramaExecucao = cronograma.map(m => ({ mes: m.mes, executadoPct: m.planejadoPct, executadoValor: m.planejadoValor }));
      await saveObra(o);
      showToast(`\u2705 Mensal do aditivo importado: ${totalMeses} meses.`);
      renderAditivosSection(); updateDashboard();
    } catch(err){ showToast('\u274C '+err.message,true); console.error(err); }
  };
  input.click();
}

export async function addNovoAditivo(){
  const o=currentObra();
  if(!o){ showToast('\u26A0\uFE0F Selecione uma obra antes de adicionar um aditivo.',true); return; }
  if(!o.aditivos) o.aditivos=[];
  o.aditivos.push({ id:'aditivo_'+Date.now(), nome:'Novo aditivo', cronograma:[], cronogramaExecucao:[], dataEmissao:null });
  await saveObra(o);
  showToast('\u2705 Aditivo criado.');
  renderAditivosSection(); updateDashboard();
}

export async function renomearAditivo(aditivoId, novoNome){
  const o=currentObra(); if(!o) return;
  const ad=(o.aditivos||[]).find(a=>a.id===aditivoId); if(!ad) return;
  ad.nome = novoNome.trim() || ad.nome;
  await saveObra(o); renderAditivosSection();
}

export async function removerAditivo(aditivoId){
  const o=currentObra(); if(!o) return;
  if(!confirm('Remover este aditivo e seu cronograma?')) return;
  o.aditivos=(o.aditivos||[]).filter(a=>a.id!==aditivoId);
  await saveObra(o);
  showToast('\u2705 Aditivo removido.');
  renderAditivosSection(); updateDashboard();
}
