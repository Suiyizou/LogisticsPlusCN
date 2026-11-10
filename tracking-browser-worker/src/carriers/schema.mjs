/**
 * 统一输出层（canonical schema v1）
 *
 * 各家官网的字段命名/层级完全不同（有的叫 "BL no."，有的叫 bill_of_lading，有的干脆没有）。
 * 这一层把每家抓到的结果映射成**同一个 JSON 结构**，下游不管是入库、看板还是喂给别的系统，
 * 都只认这一种形状。
 *
 * 设计原则：
 *  · 字段只做"位置上等价"的搬迁，不编造值；抽不到的字段给 null，绝不用空字符串冒充
 *  · 每个值都保留 raw 原文（provenance），便于追溯
 *  · business_verified 恒为 false（页面命中 ≠ 业务已核验）
 */

export const SCHEMA_VERSION = 'tracking.v1';

/** 跨船司字段并集：Excel 列标题就用这套，缺失值统一为 null。
 *  收的都是各家结果页真实出现过的字段；过偏的（如押金、免柜期细则）不收。 */
export const FIELD_UNION = [
  'bill_of_lading', 'booking', 'container_numbers', 'container_type', 'seal_numbers',
  'container_count_declared', 'container_count_extracted',
  'origin', 'origin_terminal', 'destination', 'destination_terminal',
  'vessel', 'voyage', 'service',
  'etd', 'eta', 'atd', 'ata', 'cutoff_doc', 'cutoff_fcl', 'transit_days',
  'milestone_pickup', 'milestone_departure', 'milestone_arrival', 'milestone_delivery',
  'weight', 'commodity',
  'state', 'latest_event', 'latest_event_at',
];

/** 从各家原始字段里“搬家”到并集字段（别名映射，不做猜测） */
function mapFields(raw) {
  const f = raw.fields ?? {};
  const pick = (...names) => {
    for (const name of names) {
      const value = f[name];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return null;
  };
  return {
    bill_of_lading: pick('bill_of_lading'),
    booking: pick('booking', 'booking_number'),
    container_type: pick('container_type', 'container_type_size', 'container_size'),
    seal_numbers: pick('seal') ? [pick('seal')] : null,
    origin: pick('por', 'place_of_receipt', 'origin'),
    origin_terminal: pick('origin_terminal'),
    destination: pick('pod', 'place_of_delivery', 'destination'),
    destination_terminal: pick('destination_terminal'),
    // 港口字段统一清洗：丢掉条款/标签残片（COSCO 的“运输条款：CY | CY”就在目的港位置）
    vessel: pick('vessel_name'),
    voyage: pick('voyage'),
    service: pick('service'),
    etd: pick('etd', 'departure', 'departure_PoL', '预计离港'),
    eta: pick('eta', 'arrival', 'arrival_PoD', '预计到港'),
    atd: pick('actual_departure', 'atd', '实际离港'),
    ata: pick('actual_arrival', 'ata', '实际到港'),
    cutoff_doc: pick('doc_cutoff', 'doc_cut_off'),
    cutoff_fcl: pick('fcl_cutoff', 'port_cut_off'),
    transit_days: pick('transit', 'transit_time'),
    weight: pick('weight'),
    commodity: pick('commodity', 'cargo'),
    // 两种来源都认：COSCO 写嵌套对象，MSC/HMM/SML 写扁平键
    milestone_pickup: f.milestones?.pickup_at ?? f.milestone_pickup ?? null,
    milestone_departure: f.milestones?.departure_at ?? f.milestone_departure ?? null,
    milestone_arrival: f.milestones?.arrival_at ?? f.milestone_arrival ?? null,
    milestone_delivery: f.milestones?.delivery_at ?? f.milestone_delivery ?? null,
  };
}


const SCAC = {
  MAERSK: 'MAEU', MSC: 'MEDU', CMA_CGM: 'CMDU', HAPAG_LLOYD: 'HLCU', OOCL: 'OOLU',
  ONE: 'ONEY', COSCO: 'COSU', EVERGREEN: 'EGLV', MATSON: 'MATS', YML: 'YMLU', WAN_HAI: 'WHLC',
  SML: 'SMLM', ZIM: 'ZIMU', KMTC: 'KMTC', HEDE: 'HDUJ', HMM: 'HMMU',
};

const REFERENCE_TYPE = {
  MAERSK: 'BILL_OF_LADING', MSC: 'BILL_OF_LADING', CMA_CGM: 'BOOKING', HAPAG_LLOYD: 'BILL_OF_LADING',
  OOCL: 'BILL_OF_LADING', ONE: 'BOOKING', COSCO: 'BILL_OF_LADING', EVERGREEN: 'BILL_OF_LADING',
  MATSON: 'BILL_OF_LADING', YML: 'BILL_OF_LADING', WAN_HAI: 'BILL_OF_LADING',
  SML: 'BILL_OF_LADING', ZIM: 'BILL_OF_LADING', KMTC: 'BILL_OF_LADING', HEDE: 'BILL_OF_LADING',
  HMM: 'BILL_OF_LADING',
};

const DATE_RE = [
  /(20\d{2})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?))?/,
  /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/,
  /(\d{1,2})[-\s]([A-Z]{3})[-\s](\d{4})(?:\s+(\d{1,2}:\d{2}))?/i,
  /([A-Z]{3})[-\s](\d{1,2})[-\s](\d{4})/i,
];

/** 从任意事件原文里抠出时间（尽量规范成 ISO，抠不出来就保留原文） */
export function parseEventTime(text) {
  const value = String(text ?? '');
  for (const re of DATE_RE) {
    const m = re.exec(value);
    if (!m) continue;
    const [raw] = m;
    const isoDirect = /^20\d{2}-\d{2}-\d{2}/.test(raw) ? raw.replace(' ', 'T') : null;
    return {raw: raw.trim(), iso: isoDirect};
  }
  return {raw: null, iso: null};
}

/** 事件描述：去掉时间片段后剩下的部分（再剥掉明显的编号列） */
export function parseEventDescription(text) {
  let value = String(text ?? '');
  for (const re of DATE_RE) value = value.replace(re, ' ');
  return value
    .split(/[|\t]/)
    .map((part) => part.trim())
    .filter((part) => part && !/^[A-Z]\d{3}$/.test(part) && part !== 'ACTUAL' && part !== 'ESTIMATED')
    .join(' · ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[·\s:：\-–—]+/, '')
    .trim();
}

const LOCATION_RE = /\b([A-Z][A-Z .'-]{2,30},\s*(?:[A-Z]{2}|[A-Z][A-Za-z ]{3,20}))\b/;

export function parseEventLocation(text) {
  const m = LOCATION_RE.exec(String(text ?? ''));
  return m ? m[1].trim() : null;
}

/** 从最新节点判断运输阶段（只做粗分类，不猜细节） */
export function deriveState(latestEvent) {
  const value = String(latestEvent ?? '');
  if (/empty\s*(container\s*)?return|还空箱|returned from consignee/i.test(value)) return 'RETURNED';
  if (/delivered|已交付|签收/i.test(value)) return 'DELIVERED';
  if (/gate\s*in|进场|ingate|empty container released|提空/i.test(value)) return 'AT_ORIGIN';
  if (/discharg|arriv|到港|berth/i.test(value)) return 'ARRIVED';
  if (/depart|离港|sail|on board|loaded|vessel departure/i.test(value)) return 'IN_TRANSIT';
  return 'UNKNOWN';
}

function splitVessel(vesselVoyage) {
  const value = String(vesselVoyage ?? '').trim();
  if (!value) return {name: null, voyage: null, raw: null};
  const m = /^(.*?)\s*[\/\-]\s*([A-Z]{0,3}\d{2,5}[A-Z]?)\s*$/.exec(value);
  if (m) return {name: m[1].trim() || null, voyage: m[2].trim(), raw: value};
  return {name: value, voyage: null, raw: value};
}

/** 去掉标签残留（": MEDU..."、"Number"、"No." 这类） */
const JUNK = /^(?:cst|pdt|utc|gmt|help|period|type|ref|n\/a|--?|undefined|null)$/i;

function sanitize(value) {
  const text = String(value ?? '').replace(/^[\s:：\-–—]+/, '').trim();
  if (!text) return null;
  if (/^(?:number|no\.?|ref|reference|type|eta|etd|date|time|n\/a|-+)$/i.test(text)) return null;
  return text;
}

function cleanVessel(value) {
  const text = String(value ?? '').trim();
  if (!text || JUNK.test(text)) return null;
  if (text.length < 3) return null;
  return text;
}

function cleanLocation(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^(?:ref|n\/a|-|\.\.\.)$/i.test(text)) return null;
  // 港口字段里混进来的条款/标签行一律丢掉（COSCO 首页会把“运输条款：CY | CY”排在目的港后面）
  if (/运输条款|terms of|CY\s*\|\s*CY/i.test(text)) return null;
  if (/[：:]/.test(text) && text.length > 12) return null;
  // 太短且不像地名（"ts"、"CY" 这类标签残片）一律丢掉
  if (text.length < 4 && !/[,一-龥]/.test(text)) return null;
  // 小写残片（"ts"、"t of"、"period" 这类解析噪声）不算地点
  if (/^[a-z]/.test(text) && !/,/.test(text)) return null;
  return text;
}

/**
 * 把 pipeline 的一条结果（registry 的原始抽取）映射成统一结构。
 * @param {object} raw   track-pipeline 的 results[]. 记录
 * @param {object} [options]
 */
export function toCanonical(raw, options = {}) {
  const carrier = raw.carrier ?? 'UNKNOWN';
  const fields = raw.fields ?? {};
  const warnings = [];

  // 箱级明细（有的站会给：运输方式 / 运输条款 / 当前位置 / 箱级最新状态 + 时间）
  const detailByNumber = new Map(
    (fields.container_details ?? []).map((detail) => [detail.number, detail]),
  );
  const containers = (raw.containers ?? []).map((number) => {
    const detail = detailByNumber.get(number) ?? {};
    return {
      number,
      type: detail.type ?? fields.container_type ?? null,
      movement: detail.movement ?? null,
      terms: detail.terms ?? null,
      position: detail.position ?? null,
      latest_status: detail.latest_status ?? null,
      status_time: detail.status_time ?? null,
      status_time_raw: detail.status_time_raw ?? detail.status_time ?? null,
      timezone: detail.timezone ?? null,
      eta: detail.eta ?? null,
      eta_raw: detail.eta_raw ?? null,
      eta_label: detail.eta_label ?? null,
      tare_kg: detail.tare_kg ?? null,
      payload_kg: detail.payload_kg ?? null,
      planned_raw: detail.planned_raw ?? null,
      events: Array.isArray(detail.events) ? detail.events : [],
      source: detail.source ?? null,
      extra: detail.extra ?? null,
      origin: detail.origin ?? null,
      destination: detail.destination ?? null,
      local_time_statement: detail.local_time_statement ?? null,
      state: detail.state ?? null,
      evidence_state: detail.evidence_state ?? null,
      raw: number,
    };
  });

  const declared = Number(fields.declared_containers ?? fields.declared_units?.match?.(/\d+/)?.[0] ?? 0) || null;
  if (declared && containers.length && declared !== containers.length) {
    warnings.push(`页面声明 ${declared} 箱，实际列出 ${containers.length} 个箱号`);
  }
  if (!containers.length && (declared ?? 0) > 0) {
    warnings.push('页面声明有箱量但没有列出箱号（可能折叠在详情里）');
  }

  const hapagHistory = carrier === 'HAPAG_LLOYD' && fields.hapag_detail_history === true;
  const hapagReported = hapagHistory && fields.hapag_reported_vessel?.source?.kind === 'PAGE_DETAILS' ? fields.hapag_reported_vessel : null;
  const vesselSource = hapagHistory ? hapagReported ? [hapagReported.name,hapagReported.voyage].filter(Boolean).join(' / ') : null :
    Array.isArray(raw.vessel_voyage) ? raw.vessel_voyage[0] : raw.vessel_voyage;
  const vessel = splitVessel(vesselSource ?? (hapagHistory ? null : fields.vessel_name));
  if (!vessel.name) warnings.push('未抽到船名/航次');
  else if (!vessel.voyage && fields.voyage && !hapagHistory) vessel.voyage = String(fields.voyage);

  const latestRaw = raw.latest_event ?? fields.latest_event ?? null;
  const latestTime = parseEventTime(latestRaw);
  const latestDescription = latestRaw ? parseEventDescription(latestRaw) : null;
  if (!latestRaw) warnings.push('未抽到最新节点');
  const allKnownCmaReturned = carrier === 'CMA_CGM' && containers.length > 0 &&
    (!declared || declared === containers.length) && containers.every(container =>
      container.state === 'RETURNED' && container.evidence_state?.state === 'RETURNED' &&
      container.evidence_state.container_number === container.number &&
      container.evidence_state.rule === 'DESTINATION_EMPTY_RETURN_AFTER_CONSIGNEE_PICKUP');
  const shipmentState = allKnownCmaReturned ? 'RETURNED' : deriveState(latestRaw);

  const structuredEvents = fields.structured_events;
  const events = Array.isArray(structuredEvents) && structuredEvents.length ? structuredEvents.map((event,index) => ({
    sequence:index+1,time:event.time ?? null,time_raw:event.time_raw ?? null,
    description:event.description ?? null,location:event.location ?? null,
    terminal:event.terminal ?? null,vessel:event.vessel ?? null,voyage:event.voyage ?? null,
    container_number:event.container_number ?? null,
    time_type:['ACTUAL','ESTIMATED','REPORTED'].includes(event.time_type) ? event.time_type : 'REPORTED',
    timezone:event.timezone ?? null,time_basis:event.time_basis ?? null,
    time_precision:event.time_precision ?? null,load_status:event.load_status ?? null,
    vessel_details:event.vessel_details ?? null,terminal_details:event.terminal_details ?? null,
    extra:event.extra ?? null,
    mode:event.mode ?? null,source:event.source ?? null,
    raw:event.raw ?? [event.time_raw,event.description,event.location,event.terminal,event.vessel,event.voyage,event.container_number].filter(Boolean).join(' | '),
  })) : (raw.events ?? []).slice(0, 50).map((line, index) => {
    const at = parseEventTime(line);
    return {
      sequence: index + 1,
      time: at.iso ?? null,
      time_raw: at.raw,
      description: parseEventDescription(line),
      location: parseEventLocation(line),
      raw: String(line),
    };
  });

  const origin = cleanLocation(sanitize(fields.por ?? fields.place_of_receipt));
  const destination = cleanLocation(sanitize(fields.pod ?? fields.place_of_delivery));
  if (!origin || !destination) warnings.push('起运地/目的地不完整');

  const reference = String(raw.reference ?? '');
  const submitted = String(raw.submitted ?? reference);
  const referenceType = raw.reference_type === 'BILLOFLADING'
    ? 'BILL_OF_LADING' : raw.reference_type ?? REFERENCE_TYPE[carrier] ?? 'UNKNOWN';

  return {
    schema: SCHEMA_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    carrier: {
      code: carrier,
      name: raw.carrier_name ?? carrier,
      scac: SCAC[carrier] ?? null,
    },
    query: {
      reference_input: reference,
      reference_submitted: submitted,
      reference_normalized: submitted,
      reference_type: referenceType,
      strategy: raw.strategy ?? (raw.evidence ? 'BROWSER' : 'UNKNOWN'),
      duration_seconds: raw.seconds ?? null,
      status: raw.status ?? null,
    },
    shipment: {
      bill_of_lading: sanitize(fields.bill_of_lading) ?? (referenceType === 'BILL_OF_LADING' ? submitted : null),
      booking: sanitize(fields.booking) ?? sanitize(fields.booking_number) ?? (raw.reference_type === 'BOOKING' ? submitted : null),
      containers,
      container_count: {declared, extracted: containers.length},
      route: {
        origin,
        destination,
        vessel: {name: vessel.name, voyage: vessel.voyage, raw: vessel.raw},
      },
      status: {
        state: shipmentState,
        latest_event: latestDescription,
        latest_event_at: latestTime.iso,
        latest_event_raw: latestRaw,
      },
      events,
      legs: Array.isArray(fields.legs) ? fields.legs : [],
        fields: (() => {
          const mapped = mapFields(raw);
          // 港口字段统一清洗（COSCO 会在目的港位置排“运输条款：CY | CY”）
          mapped.origin = cleanLocation(mapped.origin);
          mapped.destination = cleanLocation(mapped.destination);
          mapped.vessel = mapped.vessel || null;
          const merged = {
            ...mapped,
            container_numbers: containers.map((item) => item.number),
            container_count_declared: declared ?? null,
            container_count_extracted: containers.length,
            vessel: cleanVessel(hapagHistory ? vessel.name : mapped.vessel ?? vessel.name),
            voyage: hapagHistory ? vessel.voyage : mapped.voyage ?? vessel.voyage ?? null,
            origin: mapped.origin ?? origin ?? null,
            destination: mapped.destination ?? destination ?? null,
            state: shipmentState,
            latest_event: latestDescription ?? null,
            latest_event_at: latestTime.iso ?? null,
          };
          // 并集对齐：没抽到的一律 null，保证 Excel 列稳定
          const aligned = {};
          for (const key of FIELD_UNION) aligned[key] = merged[key] ?? null;
          return aligned;
        })(),
      fields_extra: Object.fromEntries(
        Object.entries(fields).filter(([key]) => !['por', 'pod', 'place_of_receipt', 'place_of_delivery', 'latest_event', 'bill_of_lading', 'booking', 'booking_number', 'vessel_name', 'voyage', 'declared_containers', 'declared_units'].includes(key)),
      ),
    },
    evidence: {
      url: raw.url ?? null,
      text_path: raw.evidence?.text ?? null,
      screenshot_path: raw.evidence?.screenshot ?? null,
    },
    meta: {
      confidence: raw.strategy === 'PUBLIC_API' ? 'PUBLIC_API_JSON' : 'PAGE_TEXT',
      warnings,
      csv_label_mismatch: raw.csv_label_mismatch ?? false,
      business_verified: false,
      detail_capture: raw.detail_capture ?? {
        status:'unverified',reason:'LEGACY_RESULT_WITHOUT_DETAIL_COVERAGE',
        coverage:{scope:'overview',scope_complete:false},sources:[],errors:[],
      },
    },
  };
}

/** 批量映射 + 顶层汇总（给看板用） */
export function toCanonicalBatch(payload, options = {}) {
  const items = (payload.results ?? []).map((record) => toCanonical(record, options));
  const byState = items.reduce((acc, item) => {
    const state = item.shipment.status.state;
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {});
  return {
    schema: SCHEMA_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    source: {csv: payload.csv ?? null, run_at: payload.generated_at ?? null},
    summary: {
      shipments: items.length,
      with_containers: items.filter((item) => item.shipment.containers.length > 0).length,
      containers_total: items.reduce((sum, item) => sum + item.shipment.containers.length, 0),
      by_state: byState,
      by_carrier: items.reduce((acc, item) => {
        acc[item.carrier.code] = (acc[item.carrier.code] ?? 0) + 1;
        return acc;
      }, {}),
      warnings_total: items.reduce((sum, item) => sum + item.meta.warnings.length, 0),
    },
    shipments: items,
  };
}
