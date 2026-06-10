import { norm, isNum, baseName, EXCEL_EXTS } from './state.js';

function detectSheet(wb){
  const matches = wb.SheetNames.filter(n => /^(BM|MED)\s*\d+/i.test(n));
  if(matches.length){
    return matches.sort((a,b)=>{
      const na=parseInt(a.match(/\d+/)?.[0]||0), nb=parseInt(b.match(/\d+/)?.[0]||0);
      return na-nb;
    }).at(-1);
  }
  return wb.SheetNames.at(-1);
}

function detectColumns(data){
  const RE_ITEM = /^(item|n[°º\.°]|num\.?|no\.?)$/i;
  const RE = {
    desc:  /discrimina|descri[çc]|servic[oa]|servi[çc]|especific|designa/i,
    // Medição: exige que a célula seja especificamente sobre a medição do período,
    // NÃO bate em "acumulado", "saldo", etc.
    med:   /no[\s.]*(per[ií]odo|mes|m[eê]s)|^medic[aã]o$|^realizado$|esta[\s.]*medi[çc]|med\.?\s*atual|med\.?\s*(do\s*)?(per[ií]odo|m[eê]s)|^medi[çc][aã]o\s*(do\s*per[ií]odo)?$/i,
    // Acumulado: só bate em células que contêm explicitamente "acumulado" ou "acum"
    acum:  /^acumulado$|\bacumulado\b|^acum\.?$/i,
    saldo: /saldo/i
  };
  const VC_PATTERNS = [
    { pri: 1, re: /valor\s*(unit[aá]r|unit\.)?\b/i },
    { pri: 1, re: /vl\.?\s*unit|vlr\.?\s*unit/i },
    { pri: 2, re: /vl\.?\s*(do\s*)?(contrato|ct)\b|vlr\.?\s*(do\s*)?(contrato|ct)\b|v\.?\s*contrato\b|\bvl\s*ct\b/i },
    { pri: 3, re: /valor\s+(de\s+)?contrato\b(?!\s+(com|atualizado|reajuste|aditivo))/i },
    { pri: 3, re: /valor\s+total\s+(do\s+)?contrato\b(?!\s+(com|atualizado|reajuste|aditivo))/i },
    { pri: 4, re: /valor\s*(total\s*)?(do\s*)?contrato\s*(com\s*)?(atualizado|reajuste)/i },
    { pri: 5, re: /valor\s*ct\s*[\/\\]\s*ta/i },
    { pri: 5, re: /valor\s*(de\s+)?contrato\s*(com\s*)?(aditivo|\bta\b)/i },
  ];
  let headerRowIdx = -1, itemCol = -1;
  for(let r = 0; r < Math.min(80, data.length); r++){
    const row = data[r] || [];
    for(let c = 0; c < Math.min(15, row.length); c++){
      if(RE_ITEM.test(norm(row[c]))){
        headerRowIdx = r; itemCol = c; break;
      }
    }
    if(headerRowIdx >= 0) break;
  }
  if(headerRowIdx < 0){
    for(let r = 0; r < Math.min(80, data.length); r++){
      const row = data[r] || [];
      for(let c = 0; c < Math.min(5, row.length); c++){
        if(/^\d+$/.test(String(row[c]??'').trim())){
          headerRowIdx = Math.max(0, r - 1); itemCol = c; break;
        }
      }
      if(headerRowIdx >= 0) break;
    }
  }
  const cols = { item: itemCol, desc:-1, vc:-1, med:-1, acum:-1, saldo:-1 };
  let vcPri = -1;
  if(headerRowIdx < 0) return cols;
  const blockStart = Math.max(0, headerRowIdx - 4);
  const headerBlock = [];
  for(let r = blockStart; r <= headerRowIdx; r++){
    const row = data[r] || [];
    if(r < headerRowIdx && /^\d+$/.test(String(row[itemCol]??'').trim())) continue;
    headerBlock.push(row);
  }
  for(const row of headerBlock){
    for(let c = 0; c < row.length; c++){
      const t = norm(row[c]);
      if(!t || c === itemCol) continue;
      if(RE.desc.test(t)  && cols.desc  < 0) cols.desc  = c;
      // Acumulado tem prioridade: testa ANTES de med para não colidir
      if(RE.acum.test(t)  && cols.acum  < 0){ cols.acum  = c; continue; }
      if(RE.med.test(t)   && cols.med   < 0) cols.med   = c;
      if(RE.saldo.test(t) && cols.saldo < 0) cols.saldo = c;
      for(const {pri, re} of VC_PATTERNS){
        if(re.test(t)){
          if(pri >= vcPri){ cols.vc = c; vcPri = pri; }
          break;
        }
      }
    }
  }
  const firstDataRow = data[headerRowIdx + 1] || [];
  const missing = ['vc','med','acum','saldo'].filter(k => cols[k] < 0);
  if(missing.length > 0){
    const usedCols = new Set(Object.values(cols).filter(v => v >= 0));
    const numCols = [];
    for(let c = (itemCol >= 0 ? itemCol : 0) + 1; c < firstDataRow.length; c++){
      if(!usedCols.has(c) && isNum(firstDataRow[c]) && Number(firstDataRow[c]) > 0) numCols.push(c);
    }
    // Ordem esperada na planilha: vc → med → acum → saldo
    missing.forEach((k, i) => { if(numCols[i] !== undefined) cols[k] = numCols[i]; });
  }
  if(cols.desc < 0 && itemCol >= 0){
    const fdr = data[headerRowIdx + 1] || [];
    const vcLimit = cols.vc > 0 ? cols.vc : itemCol + 12;
    for(let c = itemCol + 1; c < vcLimit; c++){
      if(!isNum(fdr[c]) && String(fdr[c]??'').trim()){ cols.desc = c; break; }
    }
  }
  return cols;
}

function findValorContrato(rows){
  const PATTERNS = [
    [1, /valor\s*ct\s*[\/\\]\s*ta/i],
    [2, /^valor\s+de\s+contrato$/i],
    [3, /valor\s+de\s+contrato\s+atualizado/i],
    [4, /valor\s+de\s+contrato\s+com\s+aditivo/i],
    [5, /valor\s+de\s+contrato\s+com\s+reajuste(?!\s+e)/i],
    [6, /valor\s+de\s+contrato\s+com\s+reajuste\s+e\s+aditivo/i],
  ];
  const candidates = [];
  function tryGetValue(rows, r, c){
    const row = rows[r] || [];
    for(let cc = c+1; cc < Math.min(c+16, row.length); cc++){ const v = Number(row[cc]); if(v > 100) return v; }
    for(let rr = r+1; rr <= r+5 && rr < rows.length; rr++){
      const v = Number(rows[rr]?.[c]); if(v > 100) return v;
      for(const cc of [c-1, c+1, c+2]){
        if(cc < 0) continue;
        const v2 = Number(rows[rr]?.[cc]); if(v2 > 100) return v2;
      }
    }
    return 0;
  }
  for(let r = 0; r < rows.length; r++){
    const row = rows[r] || [];
    for(let c = 0; c < row.length; c++){
      const cell = String(row[c] ?? '').trim(); if(!cell) continue;
      for(const [pri, re] of PATTERNS){
        if(re.test(cell)){ const v = tryGetValue(rows, r, c); if(v > 100) candidates.push({ pri, v }); }
      }
    }
  }
  if(!candidates.length) return 0;
  candidates.sort((a,b) => a.pri - b.pri || b.v - a.v);
  return candidates[0].v;
}

/**
 * Converte um valor de célula para número, suportando:
 *  - Número nativo do Excel (já float)
 *  - Formato BR: "120.326,47"  → 120326.47
 *  - Formato US: "120,326.47"  → 120326.47
 *  - Inteiro simples: "120326"
 */
function parseValor(raw){
  if(raw === '' || raw === null || raw === undefined) return 0;
  if(typeof raw === 'number') return raw;
  const s = String(raw).trim();
  const clean = s.replace(/[R$\s]/g, '');
  if(/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(clean)){
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }
  if(/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)){
    return parseFloat(clean.replace(/,/g, ''));
  }
  if(/^\d+,\d+$/.test(clean)){
    return parseFloat(clean.replace(',', '.'));
  }
  return parseFloat(clean) || 0;
}

/**
 * Extrai o valor de "Esta Medição" do cabeçalho.
 */
function findEstaMedicao(rows){
  const RE = /esta[\s.]*medi[çc]|última[\s.]*medi[çc]|medi[çc][aã]o[\s.]*atual|valor[\s.]*desta[\s.]*medi[çc]/i;

  for(let r = 0; r < rows.length; r++){
    const row = rows[r] || [];
    for(let c = 0; c < row.length; c++){
      const cell = String(row[c] ?? '').trim();
      if(!cell || !RE.test(cell)) continue;

      const v1 = parseValor(rows[r + 1]?.[c]);
      if(v1 > 0) return v1;

      const v2 = parseValor(rows[r + 2]?.[c]);
      if(v2 > 0) return v2;
    }
  }

  return 0;
}

function extractMetaFromHeaders(data, firstDataRowIdx){
  const RE_ACUM = /acumulado/i, RE_CONT=/contratada/i;
  let acu=0, contratada='';
  const rows = firstDataRowIdx>0 ? data.slice(0,firstDataRowIdx) : data.slice(0,Math.min(50,data.length));
  const vca = findValorContrato(rows);
  const estaMedicao = findEstaMedicao(rows);
  let acumColHeader=-1, acumRowHeader=-1;
  for(let r=0; r<rows.length; r++){
    const row=rows[r]||[]; let hasAcum=false, hasMedOrSaldo=false, acumC=-1;
    for(let c=0; c<row.length; c++){
      const t=norm(row[c]); if(!t) continue;
      if(RE_ACUM.test(t)){ hasAcum=true; acumC=c; }
      if(/esta[\s.]*medi|medi.?atual/i.test(t)||/saldo/i.test(t)) hasMedOrSaldo=true;
    }
    if(hasAcum&&hasMedOrSaldo){ acumColHeader=acumC; acumRowHeader=r; break; }
  }
  if(acumColHeader>=0&&acumRowHeader>=0){
    for(let rr=acumRowHeader+1; rr<=acumRowHeader+5&&rr<rows.length; rr++){
      const v=Number(rows[rr]?.[acumColHeader]); if(v>0){ acu=v; break; }
    }
    if(!acu){
      for(let rr=acumRowHeader+1; rr<=acumRowHeader+5&&rr<rows.length; rr++){
        for(const cc of [acumColHeader-1,acumColHeader+1]){
          if(cc<0) continue; const v=Number(rows[rr]?.[cc]); if(v>0){ acu=v; break; }
        }
        if(acu) break;
      }
    }
  }
  if(!acu){
    for(let r=0; r<rows.length; r++){
      const row=rows[r]||[];
      for(let c=0; c<row.length; c++){
        const cell=String(row[c]??'').trim();
        if(RE_ACUM.test(cell)){
          for(let rr=r+1; rr<=r+3&&rr<rows.length; rr++){ const v=Number(rows[rr]?.[c]); if(v>0){ acu=v; break; } }
          if(!acu){ for(let cc=c+1; cc<Math.min(c+8,row.length); cc++){ const v=Number(row[cc]); if(v>0){ acu=v; break; } } }
        }
        if(acu) break;
      }
      if(acu) break;
    }
  }
  for(let r=0; r<rows.length; r++){
    const row=rows[r]||[];
    for(let c=0; c<row.length; c++){
      const cell=String(row[c]??'').trim(); if(!cell) continue;
      if(RE_CONT.test(cell)){
        const after=cell.replace(/^.*contratada\s*:/i,'').trim();
        if(after&&after.length>1) contratada=after;
        else{ for(let cc=c+1; cc<Math.min(c+6,row.length); cc++){ const v=String(row[cc]??'').trim(); if(v&&!isNum(v)){ contratada=v; break; } } }
      }
    }
  }
  return { valorContratoAditivo:vca, acumuladoTotal:acu, contratada, estaMedicao };
}

export function normalizeRows(list){
  return Array.isArray(list)?list.map(item=>({
    item:item?.item??'',
    descricao:item?.descricao??item?.descricaoServico??item?.name??'',
    valorContrato:Number(item?.valorContrato??item?.valor_contrato??0)||0,
    medicao:Number(item?.medicao??0)||0,
    acumulado:Number(item?.acumulado??0)||0,
    saldo:Number(item?.saldo??0)||0,
    percentualExecutado:Number(item?.percentualExecutado??item?.percentual_executado??0)||0
  })):[];
}

export async function readExcelFile(file){
  const buffer=await file.arrayBuffer();
  const wb=XLSX.read(new Uint8Array(buffer),{type:'array',cellDates:false,cellNF:false,cellText:false});
  const sheetName=detectSheet(wb);
  if(!sheetName) throw new Error('Nenhuma aba encontrada na planilha.');
  const ws=wb.Sheets[sheetName];
  const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  if(!data.length) throw new Error(`A aba "${sheetName}" está vazia.`);
  const cols=detectColumns(data);
  const itemCol=cols.item>=0?cols.item:0;
  let firstDataRowIdx=-1;
  for(let r=0; r<data.length; r++){ if(/^\d+$/.test(String(data[r][itemCol]??'').trim())){ firstDataRowIdx=r; break; } }
  const meta=extractMetaFromHeaders(data,firstDataRowIdx);
  const items=[], warnings=[];
  for(let r=0; r<data.length; r++){
    const row=data[r]||[];
    const itemStr=String(row[itemCol]??'').trim();
    if(!/^\d+$/.test(itemStr)) continue;
    let descricao='';
    if(cols.desc>=0) descricao=String(row[cols.desc]??'').trim();
    if(!descricao){
      const lim=cols.vc>0?cols.vc:itemCol+12;
      for(let c=itemCol+1; c<lim; c++){ const v=String(row[c]??'').trim(); if(v&&!isNum(row[c])){ descricao=v; break; } }
    }
    const vc  =cols.vc  >=0?(Number(row[cols.vc]  )||0):0;
    const med =cols.med >=0?(Number(row[cols.med]) ||0):0;
    const acum=cols.acum>=0?(Number(row[cols.acum])||0):0;
    let saldo =cols.saldo>=0?(Number(row[cols.saldo])||0):0;
    if(!saldo&&vc>0) saldo=vc-acum;
    const p=vc>0?+(acum/vc*100).toFixed(2):0;
    if(!descricao) warnings.push(`Item ${itemStr}: descrição não encontrada`);
    if(!vc&&!acum) warnings.push(`Item ${itemStr}: valores zerados`);
    items.push({ item:itemStr, descricao, valorContrato:+vc.toFixed(2), medicao:+med.toFixed(2), acumulado:+acum.toFixed(2), saldo:+saldo.toFixed(2), percentualExecutado:p });
  }
  if(!items.length) throw new Error(`Nenhum item numérico encontrado na aba "${sheetName}".`);
  const sumVC=items.reduce((a,i)=>a+i.valorContrato,0);
  const sumAcum=items.reduce((a,i)=>a+i.acumulado,0);
  const vca=meta.valorContratoAditivo||sumVC;
  const acu=meta.acumuladoTotal>0?meta.acumuladoTotal:sumAcum;
  const estaMed = meta.estaMedicao > 0 ? meta.estaMedicao : items.reduce((a,i)=>a+i.medicao,0);
  return {
    nome:baseName(file.name), nomeProjeto:wb.Props?.Title||baseName(file.name)||'Nova obra',
    medicaoAtual:sheetName, contratada:meta.contratada||'',
    itens:items, warnings,
    resumo:{
      total:sumVC, acumulado:sumAcum,
      percentual:vca>0?+(acu/vca*100).toFixed(2):0,
      valorContratoAditivo:vca, acumuladoTotal:acu,
      estaMedicao: +estaMed.toFixed(2)
    }
  };
}
