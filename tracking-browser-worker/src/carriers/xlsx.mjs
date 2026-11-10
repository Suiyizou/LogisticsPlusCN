// 把统一结构（tracking.v1）导成 Excel：字段即列标题
//
// 4 张表：
//   Summary     批次信息与汇总
//   Shipments   每条提单一行（字段为列标题）★
//   Containers  每个箱号一行
//   Events      每条事件一行

import ExcelJS from 'exceljs';
import {FIELD_UNION} from './schema.mjs';

// 列 = 身份/查询信息 + 统一字段并集 + 元信息（缺失一律 null → Excel 留空）
const ID_COLUMNS = [
  ['carrier_code', 'carrier.code'],
  ['carrier_name', 'carrier.name'],
  ['scac', 'carrier.scac'],
  ['reference_input', 'query.reference_input'],
  ['reference_submitted', 'query.reference_submitted'],
  ['reference_type', 'query.reference_type'],
  ['query_status', 'query.status'],
];
const FIELD_COLUMNS = FIELD_UNION.map((key) => [key, `shipment.fields.${key}`]);
const META_COLUMNS = [
  ['strategy', 'query.strategy'],
  ['duration_s', 'query.duration_seconds'],
  ['events_count', 'shipment.events.length'],
  ['warnings', 'meta.warnings'],
  ['confidence', 'meta.confidence'],
  ['business_verified', 'meta.business_verified'],
  ['source_url', 'evidence.url'],
  ['screenshot', 'evidence.screenshot_path'],
];
const HEADERS = [...ID_COLUMNS, ...FIELD_COLUMNS, ...META_COLUMNS];

function pick(object, dotted) {
  let cursor = object;
  for (const key of dotted.split('.')) {
    if (cursor == null) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function cellValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' ? item.number ?? JSON.stringify(item) : String(item)))
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export async function buildWorkbook(canonical) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'shipping-browser-agent-lab';
  workbook.created = new Date();

  /* ---------- Summary（放最后，先给数据） ---------- */
  const summaryRows = [
    ['schema', canonical.schema],
    ['批次号', canonical.batch?.id ?? ''],
    ['提交时间', canonical.batch?.submitted_at ?? canonical.generated_at],
    ['完成时间', canonical.batch?.finished_at ?? ''],
    ['受理条数', canonical.batch?.accepted ?? canonical.summary?.shipments],
    ['成功条数', canonical.summary?.shipments],
    ['有箱号的单', canonical.summary?.with_containers],
    ['箱号总数', canonical.summary?.containers_total],
    ['抽取告警', canonical.summary?.warnings_total],
    ['状态分布', JSON.stringify(canonical.summary?.by_state ?? {})],
    ['船司分布', JSON.stringify(canonical.summary?.by_carrier ?? {})],
    ['business_verified', 'false（页面命中 ≠ 业务已核验）'],
  ];

  /* ---------- Shipments ---------- */
  const sheet = workbook.addWorksheet('Shipments');
  sheet.columns = HEADERS.map(([header]) => ({header, key: header, width: header.length > 18 ? 26 : Math.max(12, header.length + 2)}));
  for (const shipment of canonical.shipments ?? []) {
    const row = {};
    for (const [header, path] of HEADERS) row[header] = cellValue(pick(shipment, path.replace(/^s\./, '')));
    sheet.addRow(row);
  }
  sheet.getRow(1).font = {bold: true};
  sheet.getRow(1).alignment = {vertical: 'middle'};
  sheet.views = [{state: 'frozen', ySplit: 1}];
  sheet.autoFilter = {from: 'A1', to: `${String.fromCharCode(64 + Math.min(HEADERS.length, 26))}1`};
  // 状态列上色
  const stateCol = HEADERS.findIndex(([h]) => h === 'state') + 1;
  if (stateCol > 0) {
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const cell = sheet.getCell(r, stateCol);
      const value = String(cell.value ?? '');
      const color = value === 'RETURNED' || value === 'DELIVERED' ? 'C6EFCE'
        : value === 'ARRIVED' ? 'DDEBF7'
        : value === 'IN_TRANSIT' ? 'FFF2CC'
        : 'F8CBAD';
      cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: color}};
    }
  }

  /* ---------- Containers ---------- */
  const containerSheet = workbook.addWorksheet('Containers');
  containerSheet.columns = [
    {header: 'carrier_code', key: 'carrier', width: 16},
    {header: 'reference', key: 'reference', width: 20},
    {header: 'container_no', key: 'container', width: 18},
    {header: 'type', key: 'type', width: 18},
  ];
  for (const shipment of canonical.shipments ?? []) {
    for (const container of shipment.shipment?.containers ?? []) {
      containerSheet.addRow({
        carrier: shipment.carrier?.code ?? '',
        reference: shipment.query?.reference_submitted ?? '',
        container: container.number ?? '',
        type: container.type ?? '',
      });
    }
  }
  containerSheet.getRow(1).font = {bold: true};
  containerSheet.views = [{state: 'frozen', ySplit: 1}];

  /* ---------- Events ---------- */
  const eventSheet = workbook.addWorksheet('Events');
  eventSheet.columns = [
    {header: 'carrier_code', key: 'carrier', width: 16},
    {header: 'reference', key: 'reference', width: 20},
    {header: 'sequence', key: 'sequence', width: 10},
    {header: 'time', key: 'time', width: 24},
    {header: 'description', key: 'description', width: 46},
    {header: 'location', key: 'location', width: 30},
    {header: 'raw', key: 'raw', width: 60},
  ];
  for (const shipment of canonical.shipments ?? []) {
    for (const event of shipment.shipment?.events ?? []) {
      eventSheet.addRow({
        carrier: shipment.carrier?.code ?? '',
        reference: shipment.query?.reference_submitted ?? '',
        sequence: event.sequence ?? '',
        time: event.time ?? event.time_raw ?? '',
        description: event.description ?? '',
        location: event.location ?? '',
        raw: event.raw ?? '',
      });
    }
  }
  eventSheet.getRow(1).font = {bold: true};
  eventSheet.views = [{state: 'frozen', ySplit: 1}];

  /* ---------- Summary（最后一张） ---------- */
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{header: '指标', key: 'k', width: 28}, {header: '值', key: 'v', width: 60}];
  for (const [k, v] of summaryRows) summary.addRow({k, v: String(v ?? '')});
  summary.getRow(1).font = {bold: true};
  summary.getColumn(1).font = {bold: true};

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
