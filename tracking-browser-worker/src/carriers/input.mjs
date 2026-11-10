import {route, normalize} from './registry.mjs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === ',' || character === '\n' || character === '\r') {
      row.push(cell);
      cell = '';
      closedQuote = false;
      if (character !== ',') {
        rows.push(row);
        row = [];
        if (character === '\r' && source[index + 1] === '\n') index += 1;
      }
      continue;
    }
    if (closedQuote) {
      if (/\s/.test(character)) continue;
      throw new Error('CSV 引号结束后应为逗号或换行');
    }
    if (character === '"') {
      if (cell.trim()) throw new Error('CSV 未加引号的字段中出现了双引号');
      cell = '';
      quoted = true;
      continue;
    }
    cell += character;
  }
  if (quoted) throw new Error('CSV 含有未闭合的双引号');
  if (cell || row.length || closedQuote) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

/** 按表头读取任意列位，保留原始标签与单号，并由 SCAC 前缀优先决定船司。 */
export function parseTrackingCsv(text) {
  if (typeof text !== 'string') throw new TypeError('CSV 内容必须是文本');
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV 内容为空');
  const header = rows[0].map((value) => value.trim().toLowerCase().replace(/[\s_.\/-]/g, ''));
  const referenceIndex = header.findIndex((value) =>
    /提单/.test(value) || /^(?:reference|bl|bill|billoflading)(?:no|number)?$/.test(value));
  const labelIndex = header.findIndex((value) =>
    /船东|船司|简称/.test(value) || /^(?:carrier|shippingline|shipowner)(?:name|code)?$/.test(value));
  if (referenceIndex < 0) throw new Error('CSV 里找不到提单号列，请使用“提单号码”、reference 或 bl 表头');
  if (rows.length === 1) throw new Error('CSV 只有表头，没有提单数据');

  return rows.slice(1).map((cells, index) => {
    const reference = (cells[referenceIndex] ?? '').trim();
    if (!reference) throw new Error(`CSV 第 ${index + 2} 条记录缺少提单号`);
    const label = labelIndex >= 0 ? (cells[labelIndex] ?? '').trim() : '';
    const carrier = route(label, reference);
    const labelCarrier = route(label);
    return {
      carrier,
      reference,
      submitted: normalize(carrier, reference),
      label,
      csv_label_mismatch: labelCarrier !== 'UNKNOWN' && labelCarrier !== carrier,
    };
  });
}
