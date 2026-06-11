/**
 * cronograma.js — parser exclusivo para planilha Cronograma Físico-Financeiro.
 * Não altera nem importa nenhuma lógica de medição existente.
 */
export function parseCronogramaXLSX(workbook){
  // Tenta achar aba com nome parecido com "cronograma"
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes('cronograma')
  ) || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // --- Extrai "Data de emissão" do cabeçalho da planilha
  // Procura nas primeiras 20 linhas por uma célula com "data de emissão" (ou "emissao")
  // e lê a data na mesma célula ou na célula seguinte da linha (suporta mesclada ou não)
  let dataEmissao = null;
  const reEmissao = /data\s*de\s*emiss[aã]o/i;
  const reData    = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  outer:
  for(let ri = 0; ri < Math.min(20, raw.length); ri++){
    const row = raw[ri];
    for(let ci = 0; ci < row.length; ci++){
      const cell = String(row[ci]);
      if(reEmissao.test(cell)){
        // Tenta extrair a data da mesma célula
        let m = cell.match(reData);
        if(m){
          dataEmissao = _parseDataBR(m[1], m[2], m[3]);
          break outer;
        }
        // Tenta nas células seguintes da mesma linha
        for(let ci2 = ci + 1; ci2 < Math.min(ci + 5, row.length); ci2++){
          const c2 = String(row[ci2]);
          m = c2.match(reData);
          if(m){ dataEmissao = _parseDataBR(m[1], m[2], m[3]); break outer; }
          // Pode vir como número serial do Excel
          const num = Number(row[ci2]);
          if(!isNaN(num) && num > 40000 && num < 60000){
            dataEmissao = _excelSerialToDate(num);
            break outer;
          }
        }
        break outer;
      }
    }
  }

  // Fallback: usa mês/ano atual
  if(!dataEmissao){
    const hoje = new Date();
    dataEmissao = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
  }

  // --- Localiza linha de cabeçalho dos meses (contém pelo menos 4 células numéricas 1..N)
  let mesHeaderRowIdx = -1;
  let mesColMap = {}; // mes (1..N) => índice da coluna de '%'
  for(let ri = 0; ri < raw.length; ri++){
    const row = raw[ri];
    const numericos = row.filter(c => c !== '' && !isNaN(Number(c)) && Number(c) >= 1 && Number(c) <= 36);
    if(numericos.length >= 3){
      mesHeaderRowIdx = ri;
      row.forEach((c, ci) => {
        const n = Number(c);
        if(c !== '' && !isNaN(n) && n >= 1 && n <= 36){
          mesColMap[n] = ci; // coluna % do mês n
        }
      });
      break;
    }
  }
  if(mesHeaderRowIdx < 0) throw new Error('Linha de meses não encontrada na planilha.');

  const meses = Object.keys(mesColMap).map(Number).sort((a,b)=>a-b);

  // --- Localiza coluna ITEM (primeira coluna com cabeçalho parecido ou simplesmente col 0)
  let itemCol = 0;
  for(let ri = 0; ri < mesHeaderRowIdx; ri++){
    const row = raw[ri];
    const idx = row.findIndex(c => String(c).toLowerCase().trim() === 'item');
    if(idx >= 0){ itemCol = idx; break; }
  }

  // --- Lê itens: linhas após mesHeaderRow+1 (pula linha de %/R$)
  const dataStartRow = mesHeaderRowIdx + 2;
  const itens = [];
  for(let ri = dataStartRow; ri < raw.length; ri++){
    const row = raw[ri];
    const itemVal = row[itemCol];
    if(String(itemVal).toLowerCase().includes('total')) break;
    if(itemVal === '' || itemVal === null || itemVal === undefined) continue;
    const numItem = Number(itemVal);
    if(isNaN(numItem) || numItem <= 0) continue;

    const mesesItem = meses.map(m => {
      const pctCol = mesColMap[m];
      const valCol = pctCol + 1;
      const p = Number(row[pctCol]) || 0;
      const v = Number(row[valCol]) || 0;
      return { mes: m, pct: p, valor: v };
    });

    itens.push({
      item: numItem,
      descricao: String(row[itemCol + 1] || '').trim(),
      meses: mesesItem
    });
  }

  if(!itens.length) throw new Error('Nenhum item encontrado na planilha de cronograma.');

  // --- Agrega por mês
  const porMes = {};
  meses.forEach(m => { porMes[m] = { planejadoPct: 0, planejadoValor: 0 }; });

  let totalRow = null;
  for(let ri = dataStartRow; ri < raw.length; ri++){
    const row = raw[ri];
    const cell = String(row[itemCol]).toLowerCase() + ' ' + String(row[itemCol+1]||'').toLowerCase();
    if(cell.includes('total') && cell.includes('simples')){ totalRow = row; break; }
    if(row.some(c => String(c).toLowerCase().includes('simples'))){ totalRow = row; break; }
  }

  if(totalRow){
    meses.forEach(m => {
      const pctCol = mesColMap[m];
      const valCol = pctCol + 1;
      porMes[m].planejadoPct   = +(Number(totalRow[pctCol]) * 100).toFixed(4);
      porMes[m].planejadoValor = Number(totalRow[valCol]) || 0;
    });
  } else {
    itens.forEach(it => {
      it.meses.forEach(({ mes, valor }) => { porMes[mes].planejadoValor += valor; });
    });
    const totalValor = Object.values(porMes).reduce((a,b)=>a+b.planejadoValor,0);
    meses.forEach(m => {
      porMes[m].planejadoPct = totalValor > 0
        ? +(porMes[m].planejadoValor / totalValor * 100).toFixed(4)
        : 0;
    });
  }

  const cronograma = meses.map(m => ({
    mes: m,
    planejadoPct:   porMes[m].planejadoPct,
    planejadoValor: porMes[m].planejadoValor
  }));

  return { cronograma, totalMeses: meses.length, itens, dataEmissao };
}

// --- Helpers
function _parseDataBR(d, m, a){
  let ano = Number(a);
  if(ano < 100) ano += ano < 50 ? 2000 : 1900;
  return { dia: Number(d), mes: Number(m), ano };
}

function _excelSerialToDate(serial){
  // Excel epoch: 1 jan 1900 = serial 1 (com bug do ano bissexto)
  const d = new Date((serial - 25569) * 86400 * 1000);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() };
}
