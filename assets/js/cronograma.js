/**
 * cronograma.js — parser universal para Cronograma Físico-Financeiro.
 * Suporta:
 *   - Meses com cabeçalho numérico sequencial (1 2 3...) ou não-sequencial (1 5 8 9...)
 *   - Linha de datas texto acima dos números (mai/24, set/24...)
 *   - % armazenado como decimal (0.0331) ou inteiro (3.31)
 *   - Colunas % e R$ alternadas por mês
 *   - Linha TOTAL SIMPLES ou fallback por soma dos itens
 */
export function parseCronogramaXLSX(workbook) {
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('cronograma')
  ) || workbook.SheetNames[0];
  const ws  = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // ── 1. Data de emissão ──────────────────────────────────────────────────────
  let dataEmissao = null;
  const reEmissao = /data\s*de\s*emiss[aã]o/i;
  const reData    = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  outer:
  for (let ri = 0; ri < Math.min(20, raw.length); ri++) {
    const row = raw[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const cell = String(row[ci]);
      if (reEmissao.test(cell)) {
        let m = cell.match(reData);
        if (m) { dataEmissao = _parseDataBR(m[1], m[2], m[3]); break outer; }
        for (let ci2 = ci + 1; ci2 < Math.min(ci + 5, row.length); ci2++) {
          const c2 = String(row[ci2]);
          m = c2.match(reData);
          if (m) { dataEmissao = _parseDataBR(m[1], m[2], m[3]); break outer; }
          const num = Number(row[ci2]);
          if (!isNaN(num) && num > 40000 && num < 60000) {
            dataEmissao = _excelSerialToDate(num); break outer;
          }
        }
        break outer;
      }
    }
  }
  if (!dataEmissao) {
    const hoje = new Date();
    dataEmissao = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
  }

  // ── 2. Localiza a linha de números dos meses ────────────────────────────────
  // Critério: linha com >= 3 células numéricas inteiras entre 1 e 36
  // Se houver empate (duas linhas satisfazem), prefere a que tem mais células numéricas
  let mesHeaderRowIdx = -1;
  let mesColMap = {}; // índice de ordem (1-based) => colIndex do % daquele mês

  for (let ri = 0; ri < raw.length; ri++) {
    const row = raw[ri];
    const numCells = row.filter(c => {
      const n = Number(c);
      return c !== '' && !isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 36;
    });
    if (numCells.length >= 3) {
      mesHeaderRowIdx = ri;
      let ordem = 0;
      row.forEach((c, ci) => {
        const n = Number(c);
        if (c !== '' && !isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 36) {
          ordem++;
          // guarda pela ORDEM de aparição (1ª col de mês = mês 1 do contrato, etc.)
          mesColMap[ordem] = ci;
        }
      });
      break;
    }
  }
  if (mesHeaderRowIdx < 0) throw new Error('Linha de meses não encontrada na planilha.');

  const totalMeses = Object.keys(mesColMap).length;
  const ordens     = Array.from({ length: totalMeses }, (_, i) => i + 1);

  // ── 3. Detecta se a linha seguinte é "% R$" ou já são dados ─────────────────
  // A linha mesHeader+1 deve ser o sub-cabeçalho "% R$ % R$..."
  // Confirma verificando se as células nas posições mesColMap[1] e mesColMap[1]+1
  // contêm texto parecido com "%" e "R$" / "rs" / "valor"
  const subRow = raw[mesHeaderRowIdx + 1] || [];
  const firstPctCol = mesColMap[1];
  const subCell0    = String(subRow[firstPctCol] || '').trim().toLowerCase();
  const subCell1    = String(subRow[firstPctCol + 1] || '').trim().toLowerCase();
  const temSubHeader = subCell0.includes('%') || subCell1.includes('r$') || subCell1.includes('valor');
  const dataStartRow = mesHeaderRowIdx + (temSubHeader ? 2 : 1);

  // ── 4. Identifica coluna ITEM e coluna DESCRIÇÃO ────────────────────────────
  let itemCol = 0;
  let descCol = 1;
  for (let ri = 0; ri < mesHeaderRowIdx; ri++) {
    const row = raw[ri];
    const idxItem = row.findIndex(c => String(c).toLowerCase().trim() === 'item');
    if (idxItem >= 0) {
      itemCol = idxItem;
      descCol = idxItem + 1;
      break;
    }
  }
  // Fallback: garante que descCol não caia dentro das colunas de meses
  if (descCol >= firstPctCol) descCol = itemCol + 1;

  // ── 5. Lê linha TOTAL SIMPLES ───────────────────────────────────────────────
  let totalRow = null;
  for (let ri = dataStartRow; ri < raw.length; ri++) {
    const row   = raw[ri];
    const texto = (String(row[itemCol]) + ' ' + String(row[descCol] || '')).toLowerCase();
    // Aceita: "total simples", "total", linha onde itemCol contém "total"
    if (/total\s*simples/.test(texto) || (texto.trim().startsWith('total') && texto.length < 30)) {
      totalRow = row;
      break;
    }
    // Também testa todas as células da linha
    if (row.some(c => /total\s*simples/i.test(String(c)))) {
      totalRow = row;
      break;
    }
  }

  // ── 6. Detecta se % está em decimal (0-1) ou inteiro (0-100) ────────────────
  // Lê os valores de % da linha TOTAL SIMPLES (ou dos itens) e decide
  function isDecimalFormat(row) {
    const vals = ordens.map(o => Number(row[mesColMap[o]])).filter(v => !isNaN(v) && v !== 0);
    if (!vals.length) return false;
    // Se todos os valores são <= 1, é formato decimal
    return vals.every(v => Math.abs(v) <= 1);
  }

  let pctDecimal = false;
  if (totalRow) {
    pctDecimal = isDecimalFormat(totalRow);
  } else {
    // Testa com as primeiras linhas de item
    for (let ri = dataStartRow; ri < Math.min(dataStartRow + 5, raw.length); ri++) {
      const row = raw[ri];
      const item = Number(row[itemCol]);
      if (!isNaN(item) && item > 0) {
        pctDecimal = isDecimalFormat(row);
        break;
      }
    }
  }

  function toPct(val) {
    const n = Number(val) || 0;
    return pctDecimal ? +(n * 100).toFixed(4) : +n.toFixed(4);
  }

  // ── 7. Monta cronograma por mês ─────────────────────────────────────────────
  const porMes = {};
  ordens.forEach(o => { porMes[o] = { planejadoPct: 0, planejadoValor: 0 }; });

  if (totalRow) {
    ordens.forEach(o => {
      const pctCol = mesColMap[o];
      const valCol = pctCol + 1;
      porMes[o].planejadoPct   = toPct(totalRow[pctCol]);
      porMes[o].planejadoValor = Number(totalRow[valCol]) || 0;
    });
  } else {
    // Fallback: soma os itens
    for (let ri = dataStartRow; ri < raw.length; ri++) {
      const row  = raw[ri];
      const item = Number(row[itemCol]);
      if (isNaN(item) || item <= 0) continue;
      if (String(row[itemCol]).toLowerCase().includes('total')) break;
      ordens.forEach(o => {
        const pctCol = mesColMap[o];
        const valCol = pctCol + 1;
        porMes[o].planejadoValor += Number(row[valCol]) || 0;
      });
    }
    const totalValor = Object.values(porMes).reduce((a, b) => a + b.planejadoValor, 0);
    ordens.forEach(o => {
      porMes[o].planejadoPct = totalValor > 0
        ? +(porMes[o].planejadoValor / totalValor * 100).toFixed(4)
        : 0;
    });
  }

  // ── 8. Lê itens ─────────────────────────────────────────────────────────────
  const itens = [];
  for (let ri = dataStartRow; ri < raw.length; ri++) {
    const row     = raw[ri];
    const itemVal = row[itemCol];
    if (String(itemVal).toLowerCase().includes('total')) break;
    if (itemVal === '' || itemVal === null || itemVal === undefined) continue;
    const numItem = Number(itemVal);
    if (isNaN(numItem) || numItem <= 0) continue;
    itens.push({
      item:     numItem,
      descricao: String(row[descCol] || '').trim(),
      meses: ordens.map(o => ({
        mes:   o,
        pct:   toPct(row[mesColMap[o]]),
        valor: Number(row[mesColMap[o] + 1]) || 0
      }))
    });
  }
  if (!itens.length) throw new Error('Nenhum item encontrado na planilha de cronograma.');

  const cronograma = ordens.map(o => ({
    mes:            o,
    planejadoPct:   porMes[o].planejadoPct,
    planejadoValor: porMes[o].planejadoValor
  }));

  return { cronograma, totalMeses, itens, dataEmissao };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _parseDataBR(d, m, a) {
  let ano = Number(a);
  if (ano < 100) ano += ano < 50 ? 2000 : 1900;
  return { dia: Number(d), mes: Number(m), ano };
}

function _excelSerialToDate(serial) {
  const d = new Date((serial - 25569) * 86400 * 1000);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() };
}
