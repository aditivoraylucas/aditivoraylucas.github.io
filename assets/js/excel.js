import { norm, isNum, baseName, EXCEL_EXTS } from './state.js';

/* ---------------------------------------------------------------
   detectSheet — usa aba BM/MED mais recente ou a última
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   detectColumns

   REGRAS (conforme especificação do usuário):
   1. Encontra a linha de cabeçalho que contém a palavra "ITEM"
   2. Varre TODO o bloco de cabeçalho (até 15 linhas acima da
      primeira linha de dados numéricos) para localizar:
        • coluna NO PERIODO  (= coluna de medição)
        • coluna ACUMULADO
        • coluna SALDO
        Regra 5/6: usa SEMPRE a ocorrência que está associada à
        linha do ITEM (não do cabeçalho superior)
   3. Valor de contrato = última coluna numérica encontrada
      ANTES de "NO PERIODO" (mais à direita, regra 9)
   4. Descrição = primeira coluna texto após ITEM e antes de VC
--------------------------------------------------------------- */
function detectColumns(data){
  const RE_ITEM  = /^(item|n[°º\.°]|num\.?|no\.?)$/i;
  const RE_MED   = /no[\s.]*(per[ií]odo|mes|m[eê]s)|^no[\s.]*per[ií]odo$|esta[\s.]*medi|^realizado$|^medi[\s\S]{0,8}$/i;
  const RE_ACUM  = /acumulado|^acum\.?$/i;
  const RE_SALDO = /^saldo$/i;
  const RE_VC    = /valor.*(unit[aá]r|contrato|ct|total)|vl\.?\s*(unit|ct|contrato)|vlr\.?\s*(unit|ct|contrato)/i;

  // 1. Encontra linha do ITEM e coluna ITEM
  let itemRowIdx = -1, itemCol = -1;
  for(let r = 0; r < Math.min(80, data.length); r++){
    const row = data[r] || [];
    for(let c = 0; c < Math.min(20, row.length); c++){
      if(RE_ITEM.test(norm(row[c]))){
        itemRowIdx = r; itemCol = c; break;
      }
    }
    if(itemRowIdx >= 0) break;
  }
  // fallback: primeira linha cujo col0 seja dígito inteiro
  if(itemRowIdx < 0){
    for(let r = 0; r < Math.min(80, data.length); r++){
      const row = data[r] || [];
      for(let c = 0; c < Math.min(5, row.length); c++){
        if(/^\d+$/.test(String(row[c]??'').trim())){
          itemRowIdx = Math.max(0, r-1); itemCol = c; break;
        }
      }
      if(itemRowIdx >= 0) break;
    }
  }

  const cols = { item: itemCol, desc:-1, vc:-1, med:-1, acum:-1, saldo:-1 };
  if(itemRowIdx < 0) return cols;

  // 2. Monta bloco de cabeçalho: da linha ITEM até 2 linhas abaixo
  //    (para pegar a sub-linha "NO PERIODO | ACUMULADO | SALDO")
  //    + até 15 linhas acima (para pegar rótulos de colunas mescladas)
  const blockStart = Math.max(0, itemRowIdx - 15);
  const blockEnd   = Math.min(data.length - 1, itemRowIdx + 2);

  // Mapa: coluna → melhor label encontrado no bloco
  const labelMap = {}; // c → norm text
  for(let r = blockStart; r <= blockEnd; r++){
    const row = data[r] || [];
    for(let c = 0; c < row.length; c++){
      const t = norm(row[c]);
      if(!t || c === itemCol) continue;
      // preferência: linha mais próxima do itemRowIdx vence
      if(!labelMap[c] || r >= (labelMap[c].row ?? -1)){
        labelMap[c] = { text: t, row: r };
      }
    }
  }

  // 3. Detecta med/acum/saldo e coleta TODAS as colunas valor
  //    Regra 6: usa a ocorrência da linha ITEM ou sub-linha imediata
  //    (prioridade pela linha mais próxima de itemRowIdx)
  let medCandidates = [], acumCandidates = [], saldoCandidates = [], vcCandidates = [];

  for(let r = blockStart; r <= blockEnd; r++){
    const row = data[r] || [];
    const dist = Math.abs(r - itemRowIdx); // distância da linha ITEM
    for(let c = 0; c < row.length; c++){
      const t = norm(row[c]);
      if(!t || c === itemCol) continue;
      if(RE_MED.test(t))   medCandidates.push({c, dist, r});
      if(RE_ACUM.test(t))  acumCandidates.push({c, dist, r});
      if(RE_SALDO.test(t)) saldoCandidates.push({c, dist, r});
      if(RE_VC.test(t))    vcCandidates.push({c, dist, r, t});
    }
  }

  // Ordena por distância (mais perto do itemRowIdx = melhor)
  const closest = arr => arr.sort((a,b) => a.dist - b.dist || a.r - b.r)[0];

  const medBest  = closest(medCandidates);
  const acumBest = closest(acumCandidates);
  const saldoBest= closest(saldoCandidates);

  if(medBest)  cols.med  = medBest.c;
  if(acumBest) cols.acum = acumBest.c;
  if(saldoBest)cols.saldo= saldoBest.c;

  // 4. Valor de contrato = última coluna VC encontrada
  //    que esteja ANTES de "NO PERIODO" (mais à esquerda que med)
  //    Regra 9: usa a mais à direita dentre as elegíveis
  const medCol = cols.med >= 0 ? cols.med : 9999;
  const vcElegiveis = vcCandidates.filter(v => v.c < medCol);
  if(vcElegiveis.length){
    // pega a de maior coluna (mais à direita = mais recente/atualizada)
    vcElegiveis.sort((a,b) => b.c - a.c);
    cols.vc = vcElegiveis[0].c;
  }

  // 5. Descrição = primeira coluna texto entre itemCol e vc
  if(cols.desc < 0 && itemCol >= 0){
    const fdr = data[itemRowIdx + 1] || data[itemRowIdx] || [];
    const lim = cols.vc > 0 ? cols.vc : itemCol + 15;
    for(let c = itemCol + 1; c < lim; c++){
      if(!isNum(fdr[c]) && String(fdr[c]??'').trim()){ cols.desc = c; break; }
    }
    // fallback: primeira col string no próprio bloco header
    if(cols.desc < 0){
      for(const [c, info] of Object.entries(labelMap)){
        const ci = Number(c);
        if(ci > itemCol && ci < lim && !/^\d/.test(info.text)){
          cols.desc = ci; break;
        }
      }
    }
  }

  // 6. Fallback numérico para campos ainda não encontrados
  const firstDataRow = data[itemRowIdx + 1] || [];
  const missing = ['vc','med','acum','saldo'].filter(k => cols[k] < 0);
  if(missing.length > 0){
    const usedCols = new Set(Object.values(cols).filter(v => v >= 0));
    const numCols = [];
    for(let c = (itemCol >= 0 ? itemCol : 0) + 1; c < firstDataRow.length; c++){
      if(!usedCols.has(c) && isNum(firstDataRow[c]) && Number(firstDataRow[c]) > 0) numCols.push(c);
    }
    missing.forEach((k, i) => { if(numCols[i] !== undefined) cols[k] = numCols[i]; });
  }

  return cols;
}

/* ---------------------------------------------------------------
   findValorContrato — busca no cabeçalho (linhas acima dos itens)
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   findEstaMedicao — busca valor mon. de "Esta Medição" no cabeçalho
--------------------------------------------------------------- */
function findEstaMedicao(rows){
  const RE = /esta[\s.]*medi|medi[çc][aã]o[\s.]*atual|medi[çc][aã]o[\s.]*n[°º]/i;
  for(let r = 0; r < rows.length; r++){
    const row = rows[r] || [];
    for(let c = 0; c < row.length; c++){
      const cell = String(row[c] ?? '').trim();
      if(!cell || !RE.test(cell)) continue;
      for(let cc = c + 1; cc < Math.min(c + 10, row.length); cc++){
        const v = Number(row[cc]); if(v > 0) return v;
      }
      for(let rr = r + 1; rr <= r + 4 && rr < rows.length; rr++){
        const v = Number(rows[rr]?.[c]); if(v > 0) return v;
        for(let cc = c - 1; cc <= c + 3; cc++){
          if(cc < 0) continue;
          const v2 = Number(rows[rr]?.[cc]); if(v2 > 0) return v2;
        }
      }
    }
  }
  return 0;
}

/* ---------------------------------------------------------------
   extractMetaFromHeaders
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   normalizeRows — normaliza lista vinda do Firebase
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   readExcelFile — entry point principal
--------------------------------------------------------------- */
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

  // Primeira linha com item inteiro ("1", "2"...)
  let firstDataRowIdx=-1;
  for(let r=0; r<data.length; r++){
    if(/^\d+$/.test(String(data[r][itemCol]??'').trim())){
      firstDataRowIdx=r; break;
    }
  }

  const meta=extractMetaFromHeaders(data,firstDataRowIdx);
  const items=[], warnings=[];

  for(let r=0; r<data.length; r++){
    const row=data[r]||[];
    const itemStr=String(row[itemCol]??'').trim();

    // REGRA: coleta apenas itens inteiros (1, 2, 3...) — não 1.1, 2.3
    if(!/^\d+$/.test(itemStr)) continue;

    // Descrição
    let descricao='';
    if(cols.desc>=0) descricao=String(row[cols.desc]??'').trim();
    if(!descricao){
      const lim=cols.vc>0?cols.vc:itemCol+15;
      for(let c=itemCol+1; c<lim; c++){
        const v=String(row[c]??'').trim();
        if(v&&!isNum(row[c])){ descricao=v; break; }
      }
    }

    const vc  =cols.vc  >=0?(Number(row[cols.vc]  )||0):0;
    const med =cols.med >=0?(Number(row[cols.med]) ||0):0;
    const acum=cols.acum>=0?(Number(row[cols.acum])||0):0;
    let saldo =cols.saldo>=0?(Number(row[cols.saldo])||0):0;
    if(!saldo&&vc>0) saldo=vc-acum;

    const p=vc>0?+(acum/vc*100).toFixed(2):0;

    if(!descricao) warnings.push(`Item ${itemStr}: descrição não encontrada`);
    if(!vc&&!acum) warnings.push(`Item ${itemStr}: valores zerados`);

    items.push({
      item: itemStr,
      descricao,
      valorContrato: +vc.toFixed(2),
      medicao:       +med.toFixed(2),
      acumulado:     +acum.toFixed(2),
      saldo:         +saldo.toFixed(2),
      percentualExecutado: p
    });
  }

  if(!items.length) throw new Error(`Nenhum item numérico inteiro encontrado na aba "${sheetName}".`);

  const sumVC  =items.reduce((a,i)=>a+i.valorContrato,0);
  const sumAcum=items.reduce((a,i)=>a+i.acumulado,0);
  const vca=meta.valorContratoAditivo||sumVC;
  const acu=meta.acumuladoTotal>0?meta.acumuladoTotal:sumAcum;
  const estaMed=meta.estaMedicao>0?meta.estaMedicao:items.reduce((a,i)=>a+i.medicao,0);

  return {
    nome:baseName(file.name),
    nomeProjeto:wb.Props?.Title||baseName(file.name)||'Nova obra',
    medicaoAtual:sheetName,
    contratada:meta.contratada||'',
    itens:items,
    warnings,
    resumo:{
      total:sumVC,
      acumulado:sumAcum,
      percentual:vca>0?+(acu/vca*100).toFixed(2):0,
      valorContratoAditivo:vca,
      acumuladoTotal:acu,
      estaMedicao:+estaMed.toFixed(2)
    }
  };
}
