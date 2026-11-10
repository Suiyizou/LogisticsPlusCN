// 单页版 Excel：一行一箱（没有箱号就一行一票），字段分组着色，顶部 3 行摘要
//
// 为什么这样设计：
//   · 一页看完 + 可筛选/透视 → 运维实际用法是「按船司/状态筛，然后看某一票的箱」
//   · 一行一箱 → 箱号、封号、箱重这些**箱级**字段才有位置放，不必挤成多行文本
//   · 事件不展开成行（否则一票 30 条事件会撑爆表格）→ 用「本票事件数 + 前 3 条摘要」两列表达
//   · 顶部 3 行摘要头，不合并进数据区，autoFilter 从第 4 行开始，筛选不会破坏头部

import ExcelJS from 'exceljs';

const COLUMNS = [
  {group: 'shipment', header: '船司代码', key: 'carrier_code', width: 12},
  {group: 'shipment', header: '船司', key: 'carrier_name', width: 18},
  {group: 'shipment', header: '提交单号', key: 'reference', width: 18},
  {group: 'shipment', header: '单号类型', key: 'reference_type', width: 15},
  {group: 'shipment', header: '运输状态', key: 'state', width: 12},

  {group: 'container', header: '箱号', key: 'container_no', width: 14},
  {group: 'container', header: '运输方式', key: 'movement', width: 10},
  {group: 'container', header: '运输条款', key: 'terms', width: 10},
  {group: 'container', header: '当前位置', key: 'position', width: 30},
  {group: 'container', header: '箱最新状态', key: 'container_status', width: 20},
  {group: 'container', header: '箱状态时间', key: 'container_status_at', width: 18},
  {group: 'container', header: '箱型', key: 'container_type', width: 13},
  {group: 'container', header: '封号', key: 'seal', width: 13},
  {group: 'container', header: '重量', key: 'weight', width: 16},

  {group: 'route', header: '起运地', key: 'origin', width: 20},
  {group: 'route', header: '目的地', key: 'destination', width: 20},
  {group: 'route', header: '船名', key: 'vessel', width: 22},
  {group: 'route', header: '航次', key: 'voyage', width: 10},
  {group: 'route', header: 'ETD', key: 'etd', width: 17},
  {group: 'route', header: 'ETA', key: 'eta', width: 17},
  {group: 'route', header: 'ATD', key: 'atd', width: 17},
  {group: 'route', header: 'ATA', key: 'ata', width: 17},
  {group: 'route', header: '起运节点', key: 'milestone_pickup', width: 17},
  {group: 'route', header: '离港节点', key: 'milestone_departure', width: 17},
  {group: 'route', header: '到港节点', key: 'milestone_arrival', width: 17},
  {group: 'route', header: '最终目的地', key: 'milestone_delivery', width: 17},
  {group: 'route', header: '分段数', key: 'legs_count', width: 8},
  {group: 'route', header: '分段摘要', key: 'legs_digest', width: 52},

  {group: 'status', header: '最新节点', key: 'latest_event', width: 44},
  {group: 'status', header: '最新时间', key: 'latest_event_at', width: 18},
  {group: 'status', header: '本票事件数', key: 'events_count', width: 11},
  {group: 'status', header: '事件摘要（前 3 条）', key: 'events_digest', width: 62},

  {group: 'meta', header: '本票箱数', key: 'containers_in_shipment', width: 10},
  {group: 'meta', header: '声明箱数', key: 'declared', width: 10},
  {group: 'meta', header: '查询方式', key: 'strategy', width: 10},
  {group: 'meta', header: '耗时(s)', key: 'duration', width: 9},
  {group: 'meta', header: '告警', key: 'warnings', width: 36},
  {group: 'meta', header: '证据截图', key: 'screenshot', width: 28},
];

const GROUP_FILL = {
  shipment: 'FFE9EFF7',
  container: 'FFEAF5EA',
  route: 'FFFFF4E5',
  status: 'FFF3EAF9',
  meta: 'FFF2F2F2',
};
const GROUP_LABEL = {
  shipment: '提单信息', container: '集装箱', route: '航线与船期', status: '状态与事件', meta: '数量/质量/证据',
};
const WRAP_KEYS = new Set(['events_digest', 'latest_event', 'warnings', 'legs_digest']);

const basename = (value) => {
  const text = String(value ?? '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index >= 0 ? text.slice(index + 1) : text;
};

function rowsFor(shipment) {
  const data = shipment.shipment ?? {};
  const fields = data.fields ?? {};
  const events = data.events ?? [];
  const containers = data.containers ?? [];

  const base = {
    carrier_code: shipment.carrier?.code ?? '',
    carrier_name: shipment.carrier?.name ?? '',
    reference: shipment.query?.reference_submitted ?? '',
    reference_type: shipment.query?.reference_type ?? '',
    state: fields.state ?? data.status?.state ?? '',
    container_type: fields.container_type ?? '',
    seal: Array.isArray(fields.seal_numbers) ? fields.seal_numbers.join(', ') : (fields.seal_numbers ?? ''),
    weight: fields.weight ?? '',
    origin: fields.origin ?? data.route?.origin ?? '',
    destination: fields.destination ?? data.route?.destination ?? '',
    vessel: fields.vessel ?? data.route?.vessel?.name ?? '',
    voyage: fields.voyage ?? data.route?.vessel?.voyage ?? '',
    etd: fields.etd ?? '',
    eta: fields.eta ?? '',
    atd: fields.atd ?? '',
    ata: fields.ata ?? '',
    latest_event: data.status?.latest_event ?? fields.latest_event ?? '',
    latest_event_at: data.status?.latest_event_at ?? fields.latest_event_at ?? '',
    events_count: events.length,
    events_digest: events.slice(0, 3)
      .map((event) => [event.time ?? event.time_raw ?? '', event.description ?? ''].filter(Boolean).join(' '))
      .join(' / '),
    containers_in_shipment: data.container_count?.extracted ?? containers.length,
    declared: data.container_count?.declared ?? '',
    strategy: shipment.query?.strategy ?? '',
    duration: shipment.query?.duration_seconds ?? '',
    warnings: (shipment.meta?.warnings ?? []).join('；'),
    screenshot: basename(shipment.evidence?.screenshot_path),
  };

  const legs = Array.isArray(data.legs) ? data.legs : [];
  const legsDigest = legs
    .map((leg) => [leg.vessel, leg.voyage ? `/${leg.voyage}` : '', leg.load_port && leg.discharge_port ? `${leg.load_port}→${leg.discharge_port}` : '', leg.etd ? `ETD ${leg.etd}` : '', leg.atd ? `ATD ${leg.atd}` : '', leg.eta ? `ETA ${leg.eta}` : '']
      .filter(Boolean).join(' '))
    .join(' ｜ ');

  const milestones = {
    milestone_pickup: fields.milestone_pickup ?? data.fields?.milestone_pickup ?? '',
    milestone_departure: fields.milestone_departure ?? data.fields?.milestone_departure ?? '',
    milestone_arrival: fields.milestone_arrival ?? data.fields?.milestone_arrival ?? '',
    milestone_delivery: fields.milestone_delivery ?? data.fields?.milestone_delivery ?? '',
    legs_count: legs.length || '',
    legs_digest: legsDigest,
  };

  return containers.length
    ? containers.map((container) => ({
        ...base,
        ...milestones,
        container_no: container.number ?? '',
        movement: container.movement ?? '',
        terms: container.terms ?? '',
        position: container.position ?? '',
        container_status: container.latest_status ?? '',
        container_status_at: container.status_time ?? '',
      }))
    : [{...base, ...milestones, container_no: ''}];
}

export async function buildSingleSheetWorkbook(canonical) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'shipping-browser-agent-lab';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Tracking', {
    views: [{state: 'frozen', ySplit: 4, xSplit: 3}],
  });
  sheet.columns = COLUMNS.map((column) => ({header: column.header, key: column.key, width: column.width}));

  const summary = canonical.summary ?? {};
  const batchId = canonical.batch?.id ?? '';
  const generatedAt = String(canonical.batch?.finished_at ?? canonical.generated_at ?? '').replace('T', ' ').slice(0, 19);

  // 第 1 行：标题
  sheet.getCell(1, 1).value = `提单跟踪结果 · ${canonical.schema ?? 'tracking.v1'}`;
  sheet.mergeCells(1, 1, 1, 10);
  sheet.getCell(1, 1).font = {bold: true, size: 14};
  sheet.getRow(1).height = 24;

  // 第 2 行：摘要（批次 / 时间 / 计数 / 状态分布）
  const summaryBits = [
    `批次 ${batchId}`,
    `生成 ${generatedAt}`,
    `提单 ${summary.shipments ?? 0} 条`,
    `箱号 ${summary.containers_total ?? 0} 个`,
    `有箱号的单 ${summary.with_containers ?? 0}`,
    `告警 ${summary.warnings_total ?? 0}`,
    `状态 ${JSON.stringify(summary.by_state ?? {})}`,
    `船司 ${JSON.stringify(summary.by_carrier ?? {})}`,
  ];
  summaryBits.forEach((text, index) => { sheet.getCell(2, index + 1).value = text; });
  sheet.getRow(2).font = {size: 10, color: {argb: 'FF666666'}};
  sheet.mergeCells(2, 1, 2, 3);
  sheet.mergeCells(2, 4, 2, 5);
  sheet.mergeCells(2, 6, 2, 7);
  sheet.mergeCells(2, 8, 2, 9);

  // 第 3 行：分组色带
  COLUMNS.forEach((column, index) => {
    const cell = sheet.getCell(3, index + 1);
    cell.value = GROUP_LABEL[column.group];
    cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: GROUP_FILL[column.group]}};
    cell.font = {bold: true, size: 9, color: {argb: 'FF444444'}};
    cell.alignment = {horizontal: 'center'};
  });

  // 第 4 行：表头
  const headerIndex = 4;
  COLUMNS.forEach((column, index) => {
    const cell = sheet.getCell(headerIndex, index + 1);
    cell.value = column.header;
    cell.font = {bold: true, size: 10};
    cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: GROUP_FILL[column.group]}};
    cell.border = {bottom: {style: 'thin', color: {argb: 'FFBBBBBB'}}};
    cell.alignment = {horizontal: 'center', vertical: 'middle'};
  });
  sheet.getRow(headerIndex).height = 20;

  // 数据行
  let rowIndex = headerIndex + 1;
  for (const shipment of canonical.shipments ?? []) {
    for (const row of rowsFor(shipment)) {
      const excelRow = sheet.getRow(rowIndex);
      COLUMNS.forEach((column, index) => {
        const value = row[column.key];
        const cell = excelRow.getCell(index + 1);
        cell.value = value === undefined || value === null || value === '' ? null : value;
        cell.font = {size: 10};
        cell.alignment = {vertical: 'top', wrapText: WRAP_KEYS.has(column.key), horizontal: 'left'};
        cell.border = {bottom: {style: 'hair', color: {argb: 'FFE5E5E5'}}};
      });
      rowIndex += 1;
    }
  }

  // 状态列上色
  const stateColumn = COLUMNS.findIndex((column) => column.key === 'state') + 1;
  for (let r = headerIndex + 1; r < rowIndex; r += 1) {
    const cell = sheet.getCell(r, stateColumn);
    const value = String(cell.value ?? '');
    const color = ['RETURNED', 'DELIVERED'].includes(value) ? 'FFC6EFCE'
      : value === 'ARRIVED' ? 'FFDDEBF7'
      : value === 'IN_TRANSIT' ? 'FFFFF2CC'
      : value === 'AT_ORIGIN' ? 'FFEDEDED'
      : 'FFF8CBAD';
    cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: color}};
  }

  // 自动筛选：只覆盖数据表（从表头行开始）
  const lastColumnLetter = String.fromCharCode(64 + Math.min(COLUMNS.length, 26));
  sheet.autoFilter = {
    from: `A${headerIndex}`,
    to: `${lastColumnLetter}${Math.max(rowIndex - 1, headerIndex)}`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* =========================================================================
 * 按船司拆表：每家一张 sheet，且只保留“该家有值”的列 → 渲染时没有空白
 * ========================================================================= */
export async function buildPerCarrierWorkbook(canonical) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'shipping-tracking';

  const groups = new Map();
  for (const shipment of canonical.shipments ?? []) {
    const code = shipment.carrier?.code ?? 'UNKNOWN';
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(shipment);
  }

  for (const [code, shipments] of groups) {
    const rows = shipments.flatMap((shipment) => rowsFor(shipment));
    if (!rows.length) continue;

    // 只保留该家有值的列（至少一格非空）
    const columns = COLUMNS.filter((column) =>
      rows.some((row) => {
        const value = row[column.key];
        return value !== undefined && value !== null && String(value).trim() !== '';
      }),
    );

    const sheet = workbook.addWorksheet(code.slice(0, 31), {
      views: [{state: 'frozen', ySplit: 3, xSplit: 2}],
    });
    sheet.columns = columns.map((column) => ({header: column.header, key: column.key, width: column.width}));

    // 第 1 行：船司名 + 条数
    const name = shipments[0].carrier?.name ?? code;
    sheet.getCell(1, 1).value = `${name}（${shipments.length} 单 / ${rows.length} 箱）`;
    sheet.mergeCells(1, 1, 1, Math.max(2, Math.min(columns.length, 8)));
    sheet.getCell(1, 1).font = {bold: true, size: 13};
    sheet.getRow(1).height = 22;

    // 第 2 行：表头
    columns.forEach((column, index) => {
      const cell = sheet.getCell(2, index + 1);
      cell.value = column.header;
      cell.font = {bold: true, size: 10};
      cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: GROUP_FILL[column.group]}};
      cell.border = {bottom: {style: 'thin', color: {argb: 'FFBBBBBB'}}};
      cell.alignment = {horizontal: 'center'};
    });

    // 第 3 行起：数据
    rows.forEach((row, rowIndex) => {
      const excelRow = sheet.getRow(rowIndex + 3);
      columns.forEach((column, index) => {
        const cell = excelRow.getCell(index + 1);
        const value = row[column.key];
        cell.value = value === undefined || value === null || value === '' ? null : value;
        cell.font = {size: 10};
        cell.alignment = {vertical: 'top', wrapText: WRAP_KEYS.has(column.key)};
      });
    });

    const lastLetter = String.fromCharCode(64 + Math.min(columns.length, 26));
    sheet.autoFilter = {from: `A2`, to: `${lastLetter}${rows.length + 2}`};
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
