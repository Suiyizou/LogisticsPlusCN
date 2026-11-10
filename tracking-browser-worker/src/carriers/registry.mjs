import {applyPortRules} from './rules-ports.mjs';
import {cmaOverview, isMscHistoryRow} from './detail-parser.mjs';
// 船司路由 + 单号归一化 + 结果页结构化抽取（纯函数，可单测）
//
// 分工：
//   · route()      —— 从 CSV 的"船东简称"或单号前缀判断到底是哪家（含 COSU→COSCO 这类误标纠正）
//   · normalize()  —— 每家官网要求的单号形态（去前缀、长度限制等，来自实跑验证）
//   · extract()    —— 把官网结果页的可见文本抽成结构化记录

/** 单号前缀 → 船司。前缀是 SCAC，比 CSV 里的中文简称可靠。 */
const PREFIX_ROUTES = [
  [/^ONEY/, 'ONE'],
  [/^MATS/, 'MATSON'],
  [/^(?:HDMU|SHAM)/, 'HMM'],
  [/^EGLV/, 'EVERGREEN'],
  [/^MAEU/, 'MAERSK'],
  [/^MEDU/, 'MSC'],
  [/^(?:TJN|CMDU|CMDUSHA)/, 'CMA_CGM'],
  [/^HLCU/, 'HAPAG_LLOYD'],
  [/^OOLU/, 'OOCL'],
  [/^(?:YMJ|YMLU)/, 'YML'],
  [/^WHL/, 'WAN_HAI'],
  [/^(?:COSU|CSNU|CBHU|CCLU)/, 'COSCO'],
];

/** CSV 简称 → 船司 */
const LABEL_ROUTES = [
  [/^(MATSON|美森)/i, 'MATSON'],
  [/^ONE(?!\w)/i, 'ONE'],
  [/^(HMM|韩新|현대)/i, 'HMM'],
  [/^(EVERGREEN|长荣|EMC|長榮)/i, 'EVERGREEN'],
  [/^(MSC|地中海)/i, 'MSC'],
  [/^(CMA|达飞|達飛)/i, 'CMA_CGM'],
  [/^(HPL|HAPAG|赫伯罗特|赫伯羅特)/i, 'HAPAG_LLOYD'],
  [/^(OOCL|东方海外|東方海外)/i, 'OOCL'],
  [/^(YML|阳明|陽明|YANGMING|YANG MING)/i, 'YML'],
  [/^(WHL|WHZ|万海|萬海|WAN[_ ]?HAI)/i, 'WAN_HAI'],
  [/^(SML|SM LINE)/i, 'SML'],
  [/^KMTC/i, 'KMTC'],
  [/^ZIM/i, 'ZIM'],
  [/^HEDE/i, 'HEDE'],
  [/^(MSK|MAERSK|马士基|馬士基)/i, 'MAERSK'],
  [/^(COSCO|中远|中遠)/i, 'COSCO'],
];

export const CARRIER_NAMES = {
  MATSON: 'Matson 美森', ONE: 'ONE 海洋网联', HMM: 'HMM 韩新海运', EVERGREEN: 'Evergreen 长荣',
  MAERSK: 'Maersk 马士基', MSC: 'MSC 地中海', CMA_CGM: 'CMA CGM 达飞', HAPAG_LLOYD: 'Hapag-Lloyd 赫伯罗特',
  OOCL: 'OOCL 东方海外', YML: 'Yang Ming 阳明', WAN_HAI: 'Wan Hai 万海', COSCO: 'COSCO 中远海运',
  SML: 'SM Line', KMTC: 'KMTC', ZIM: 'ZIM', HEDE: 'HEDE',
};

export function route(label = '', reference = '') {
  const ref = String(reference).toUpperCase().replace(/\s+/g, '');
  const byPrefix = PREFIX_ROUTES.find(([re]) => re.test(ref));
  if (byPrefix) return byPrefix[1];
  const byLabel = LABEL_ROUTES.find(([re]) => re.test(String(label).trim()));
  return byLabel ? byLabel[1] : 'UNKNOWN';
}

/** 官网要求的单号形态（每条都来自实跑验证，不是猜的） */
export function normalize(carrier, reference, type) {
  const ref = String(reference ?? '').trim().toUpperCase();
  if (type === 'CONTAINER' || type === 'BOOKING') return ref;
  switch (carrier) {
    case 'ONE': return ref.replace(/^ONEY/, '');            // ONE 只接受后 12 位
    case 'HMM': return ref.replace(/^HDMU/, '').slice(0, 12); // B/L 框最长 12
    case 'EVERGREEN': return ref.replace(/^EGLV/, '');
    case 'MAERSK': return ref.replace(/^MAEU/, '');         // 9 位 B/L
    case 'WAN_HAI': return ref.replace(/^WHLC/, '');
    case 'COSCO': return ref.replace(/^(?:COSU|CSNU|CBHU|CCLU)/, '');
    default: return ref;
  }
}

/* ---------------- 抽取 ---------------- */

const EXAMPLE_CONTAINERS = new Set(['EISU1234567', 'ABCD1234567', 'MSDU1234567', 'OOLU1234567', 'TLLU1234567', 'HLCU1234567']);

const datePatterns = [
  /\b(20\d{2})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})(?:\s+(\d{1,2}:\d{2}))?/i,
  /\b(\d{2})-([A-Z]{3})-(20\d{2})(?:\s+(\d{1,2}:\d{2}))?/i,
];

export function findDates(text) {
  const found = [];
  for (const line of String(text).split('\n')) {
    for (const pattern of datePatterns) {
      const m = pattern.exec(line);
      if (m) { found.push({raw: m[0].trim(), line: line.trim().slice(0, 120)}); break; }
    }
  }
  return found;
}

function pickFields(lines, keys) {
  // keys: [输出字段名, 匹配 label 的正则]
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    for (const [field, re] of keys) {
      if (out[field]) continue;
      if (!re.test(lines[i])) continue;
      const sameLine = lines[i].replace(re, '').trim();
      const value = sameLine && sameLine.length <= 60 ? sameLine : (lines[i + 1] ?? '').trim();
      if (value && value.length <= 80) out[field] = value;
    }
  }
  return out;
}

/**
 * 把官网结果页文本抽成结构化记录。
 * 返回 { containers, vesselVoyage, por, pod, latestEvent, events, fields, ok }
 */
export function extract(carrier, text, reference) {
  const raw = String(text ?? '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  // 箱号：多数站写成 4 字母 + 7 数字；美森会写成 USAU333474-5（带校验位连字符）
  const containers = [...new Set((raw.match(/\b[A-Z]{4}\d{6,7}(?:-\d)?\b/g) ?? []).map((c) => c.replace('-', '')))]
    .filter((c) => /^[A-Z]{4}\d{7}$/.test(c))
    .filter((c) => !EXAMPLE_CONTAINERS.has(c));

  // 导航/页脚里也有 “Vessel Schedules”“Help” 这类词，不能当成船名标签（马士基新版页面必踩）
  const NAV_NOISE = /^(?:vessel\s+(?:schedules?|tracking|services?)|container tracking|vessel schedules|help|support|contact us|services?|schedules?)$/i;
  let vessels = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (NAV_NOISE.test(lines[i])) continue;
    if (/^(?:vessel(?:\s*name)?(?:\s*\/\s*voyage)?|船名(?:航次)?|선박|m\/v)\b/i.test(lines[i]) || /vessel\s*\/?\s*voyage/i.test(lines[i])) {
      const inline = lines[i].replace(/.*(?:vessel|船名)[^:：]*[:：]?\s*/i, '').trim();
      const value = inline && inline.length <= 50 ? inline : (lines[i + 1] ?? '').trim();
      const looksLikeVessel = /^[A-Z0-9][A-Z0-9 .\-]{2,48}$/i.test(value)
        && !NAV_NOISE.test(value)
        && !/^(?:port of|basic information|status|date|location|more detail|voyage|container|booking|time)/i.test(value)
        && !/^\d+$/.test(value)
        && /[A-Z]{2,}/i.test(value);
      if (looksLikeVessel) vessels.push(value);
    }
  }
  const vesselFromPattern = /([A-Z][A-Z0-9]{2,}(?:\s+[A-Z0-9]{2,}){0,3})\s*[\/|]\s*(\d{3,4}[A-Z]?)/.exec(raw);
  if (!vessels.length && vesselFromPattern) vessels.push(`${vesselFromPattern[1]} / ${vesselFromPattern[2]}`);

  const commonKeys = [
    ['por', /^(?:shipped from|place of receipt|port of load|por\b|起运地|受荷地)/i],
    ['pod', /^(?:shipped to|place of delivery|port of discharge|pod\b|目的地)/i],
    ...(['MATSON', 'ONE'].includes(carrier) ? [] : [
      ['booking', /^(?:booking(?: no)?|booking number|订舱号)/i],
      ['bill_of_lading', /^(?:bill of lading|b\/l|提单号)/i],
      ['latest_event', /^(?:latest event|最新(?:动态|事件)|last move)/i],
    ]),
  ];
  const perCarrier = {
    MATSON: [['container_count', /^container count/i]],
    MSC: [['container_count', /^\(\d+ containers\)$/i]],
    HMM: [['origin_departure', /^(?:departure at origin)/i], ['destination_arrival', /^(?:arrival at destination)/i]],
    ONE: [['bl_or_booking', /^bl no\. or booking no\./i]],
    CMA_CGM: [],
    HAPAG_LLOYD: [],
    OOCL: [],
    EVERGREEN: [['container_count', /^container count/i]],
    MAERSK: [['container_count', /^\d+ container/i]],
    YML: [],
    WAN_HAI: [['board_date', /^(?:o board date|oboard date|on board date)/i]],
  };

  const fields = pickFields(lines, [...commonKeys, ...(perCarrier[carrier] ?? [])]);

  // 页面自己声明的箱量优先于"能抓到几个箱号"
  const declared =
    Number(/(?:^|[^\w])(\d{1,3})\s*Containers?\s*\)/i.exec(raw)?.[1])
    || Number(/(?:^|[^\w])(?:20|40|45)[A-Z]{0,3}\s*[x*×]\s*(\d{1,3})(?![\d])/i.exec(raw)?.[1])
    || Number(/(?:^|[^\w])(\d{1,3})\s+containers?/i.exec(raw)?.[1])
    || undefined;
  if (declared) fields.declared_containers = String(declared);

  // 事件：带日期且带地点/动作的行
  const events = [];
  for (const line of lines) {
    if (!datePatterns.some((p) => p.test(line))) continue;
    if (line.length > 140) continue;
    if (!/[A-Z]{2,}/.test(line)) continue;
    events.push(line.slice(0, 140));
    if (events.length >= 30) break;
  }

  // 万海的结果页是一张 TSV 表：1	040GX05516	2026/05/12	W042	WAN HAI 352	Over O/B date 120 days…
  if (carrier === 'SML') {
    // 表格列：Booking No. | Container No. | Seal No. | Size | Event Date/Time | Status | Place | Weight
    // 行首可能带勾选框的空列，所以允许前导 tab
    const row = /^[	 ]*([A-Z0-9]{10,14})	([A-Z]{4}\d{7})	([A-Z0-9]+)	([^	]+)	(\d{4}-\d{2}-\d{2} \d{2}:\d{2})	([^	]+)	([^	]+)	([^	]+)/m.exec(raw);
    const total = /Total\s*[:：]\s*(\d+)/i.exec(raw)?.[1];
    if (total) fields.declared_containers = total;
    if (row) {
      fields.booking = row[1];
      fields.seal = row[3];
      fields.container_size = row[4].trim();
      fields.latest_event = `${row[5]} · ${row[6].trim()} · ${row[7].trim()}`;
      fields.weight = row[8].trim();
      fields.latest_event_at = row[5];
    }
  }

  if (carrier === 'WAN_HAI') {
    const row = /^\s*\d+	([A-Z0-9]{8,})	(\d{4}\/\d{2}\/\d{2})	(\S+)	(.+?)(?:	(.*))?$/m.exec(raw);
    if (row) {
      fields.bill_of_lading = row[1];
      fields.board_date = row[2];
      fields.voyage = row[3];
      fields.vessel_name = row[4].trim();
      if (row[5] && /not available|120 days/i.test(row[5])) fields.history_limit = row[5].trim();
    }
  }

  if (!fields.latest_event && events.length) {
    // 事件行通常是"地点 + 时间 + 动作"或"时间 + 动作"；跳过纯表头
    const isHeader = (e) => /^(?:container|vessel|voyage|bl no|booking|status\s*\/?\s*time|date|location|more detail)/i.test(e.trim());
    const isOnlyDate = (e) => /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(e.trim()) && e.trim().length < 22;
    const candidate = events.find((e) => !isHeader(e) && !isOnlyDate(e));
    if (candidate) fields.latest_event = candidate;
  }

  // ---- 各家专用抽取（都对着真实结果页文本校准过，配套离线断言在 tests/carrier-registry.test.mjs）----
  const grab = (re, group = 1) => { const m = re.exec(raw); const v = m ? String(m[group]).trim() : ''; return v && v !== 'undefined' ? v : undefined; };
  const tail = (re) => { const m = re.exec(raw); return m ? m[0].replace(/\s+/g, ' ').trim() : undefined; };
  const LABELS = /^(?:pod\s*\/?\s*vessel arrival|pod eta|etd|eta|type|latest move|seal no\.?|container(?: no\.?)?|vessel|voyage|date|time|status|status\/\s*time|location|more detail|purchase order no\.?|booking no\.?|bl no\.?)$/i;

  if (carrier === 'MAERSK') {
    // 新版货踪页（/tracking/{BL}，2026 起）：BL 号在「BL number」下一行；起运/目的是
    // 「城市, / 国家码」两行；箱号与箱型各占一行；事件是「地点 / 堆场 / 动作 / 日期」四行一组。
    // 逐组配对，不靠单行同时含日期，否则一条事件都抽不到。
    const AT = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
    const eventDate = new RegExp(`^\\d{1,2}\\s+${AT}\\s+20\\d{2}(?:\\s+\\d{1,2}:\\d{2})?$`, 'i');
    const facilityLine = /terminal|logistics|depot|warehouse|yard|rail|\bCY\b|CFS|pier/i;
    const placeLine = /^(?:[A-Z][A-Z .'-]{2,28}|[A-Z][a-z]+(?: [A-Z][a-z]+)*)$/;
    const navLike = /^(?:gate|load|discharge|vessel|empty|arrive|depart|latest|note|take a tour|return to old)/i;

    const blAt = lines.findIndex((line) => /^BL number$/i.test(line));
    if (blAt >= 0) {
      const value = (lines[blAt + 1] ?? '').trim();
      // 「Bill of Lading number consists of 9 characters.」是输入提示，不是提单号
      if (/^[A-Z0-9]{6,20}$/.test(value)) fields.bill_of_lading = value;
      else delete fields.bill_of_lading;
    }

    // 城市行 + 国家码行 → 「CITY, CC」；同时建城市→国家映射，供事件行复用
    const cityCountry = new Map();
    const placeAt = (from) => {
      for (let i = from; i < Math.min(from + 10, lines.length - 1); i += 1) {
        const city = lines[i].replace(/,\s*$/, '').trim();
        const country = (lines[i + 1] ?? '').trim();
        if (placeLine.test(city) && /^[A-Z]{2}$/.test(country)) {
          cityCountry.set(city.toUpperCase(), `${city.toUpperCase()}, ${country}`);
          return {value: `${city.toUpperCase()}, ${country}`, index: i};
        }
      }
      return null;
    };
    const origin = placeAt(blAt >= 0 ? blAt + 1 : 0);
    if (origin && !fields.por) fields.por = origin.value;
    const destination = origin ? placeAt(origin.index + 2) : null;
    if (destination && destination.value !== fields.por && !fields.pod) fields.pod = destination.value;

    // 箱型：箱号下一行（40' Dry High / 40' Dry Standard）
    const containerAt = lines.findIndex((line) => /^[A-Z]{4}\d{7}$/.test(line));
    const typeLine = containerAt >= 0 ? (lines[containerAt + 1] ?? '').trim() : '';
    if (/^\d{2}\s*['’]?\s*(?:dry|reefer|open|flat|tank|high|platform|standard)/i.test(typeLine)) fields.container_type = typeLine;

    // 页面声明的箱量（pickFields 会误取下一行提示文字，这里用整行覆盖）
    const countLine = lines.find((line) => /^\d{1,3}\s+containers?$/i.test(line));
    if (countLine) {
      fields.container_count = countLine;
      fields.declared_containers = String(Number(/(\d{1,3})/.exec(countLine)?.[1]));
    }

    // 计划离港/到港与堆场：Departs / Arrives 各占一行，日期在下一行
    const plan = (pattern) => {
      const at = lines.findIndex((line) => pattern.test(line));
      return at < 0 ? {} : {terminal: lines[at].replace(pattern, '').trim(), date: lines[at + 1]};
    };
    const depart = plan(/^Departs\s+/i);
    const arrive = plan(/^Arrives\s+/i);
    if (depart.terminal) fields.origin_terminal = depart.terminal;
    if (depart.date && eventDate.test(depart.date)) fields.etd = depart.date;
    if (arrive.terminal) fields.destination_terminal = arrive.terminal;
    if (arrive.date && eventDate.test(arrive.date)) fields.eta = arrive.date;

    // 事件区从「Hide N events」/「Last updated」之后开始，避免把上面的计划行重复算成节点
    let eventStart = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^(?:hide|show)\s+\d+\s+events?/i.test(lines[i]) || /^last updated/i.test(lines[i])) eventStart = i + 1;
    }

    const maerskEvents = [];
    for (let i = Math.max(eventStart, 1); i < lines.length; i += 1) {
      if (!eventDate.test(lines[i])) continue;
      const action = lines[i - 1].replace(/\s*Latest event\s*$/i, '').trim();
      if (!action || eventDate.test(action) || /^\d/.test(action)) continue;
      let place; let facility;
      for (let back = 2; back <= 6 && i - back >= 0 && !(place && facility); back += 1) {
        const line = lines[i - back];
        if (facilityLine.test(line)) facility = facility ?? line;
        else if (!place && placeLine.test(line) && !navLike.test(line)) place = line;
      }
      const pair = place ? (cityCountry.get(place.toUpperCase()) ?? place) : undefined;
      const label = [action, pair, facility].filter(Boolean).join(' | ');
      maerskEvents.push(`${lines[i].trim()} | ${label}`);
    }
    if (maerskEvents.length) {
      events.length = 0;
      events.push(...maerskEvents.slice(0, 30));
      fields.latest_event = events[events.length - 1];
    }
  }

  if (carrier === 'ONE') {
    // 结果表把订舱号、箱号、地点、动作与时间拆成多行。查找表头后的货踪行。
    const header = lines.findIndex((line) => /^Latest Event Status\s*\/\s*Time$/i.test(line));
    const columns = header < 0 ? [] : lines.slice(header + 1, header + 6);
    const lastColumn = columns.findIndex((line) => /^Purchase Order No\.?$/i.test(line));
    delete fields.latest_event;
    if (lastColumn >= 0) {
      const summary = lines.slice(header + lastColumn + 2, header + lastColumn + 17);
      const detail = summary.findIndex((line) => /^Cargo Tracking$/i.test(line));
      const row = detail < 0 ? summary : summary.slice(0, detail);
      if (/^[A-Z0-9-]+$/.test(row[0] ?? '') && /^\d{0,3}[A-Z]{4}\d{7}$/.test(row[1] ?? '')) {
        fields.booking = row[0];
        const dateIndex = row.findIndex((line, index) => /^\d{4}-\d{2}-\d{2}$/.test(line)
          && /^\d{2}:\d{2}$/.test(row[index + 1] ?? '')
          && /\b(?:return\w*|gate|releas\w*|load\w*|unload\w*|depart\w*|arriv\w*|deliver\w*|discharg\w*|receiv\w*|transfer\w*|pick\w*)\b/i.test(row[index - 1] ?? ''));
        if (dateIndex >= 0) fields.latest_event = `${row[dateIndex]} ${row[dateIndex + 1]} ${row[dateIndex - 1]}`;
      }
    }
    const vessel = grab(/^Vessel[ \t]*\r?\n([A-Z][A-Z0-9 .'-]{3,30})/m);
    const voyage = grab(/^Voyage[ \t]*\r?\n([A-Z0-9-]{3,15})/m);
    if (vessel) vessels.push([vessel, voyage].filter(Boolean).join(' / '));
  }

  if (carrier === 'HMM') {
    // 事件区：动作行 + 日期 + 时间三行一组
    const rows = [...raw.matchAll(/^([A-Z][A-Za-z0-9 .,'()\/-]{6,60})\r?\n(\d{4}-\d{2}-\d{2})\r?\n(\d{2}:\d{2})/gm)];
    const useful = rows.map(([, label, day, time]) => `${day} ${time} ${label.trim()}`);
    if (useful.length) fields.latest_event = useful[0];
    const vessel = grab(/^([A-Z][A-Z0-9 .'-]{3,30})\r?\n(?:[^\r\n]*\r?\n)?Vessel Departure from POL/m);
    if (vessel && vessel.length > 3) vessels.push(vessel);
  }

  if (carrier === 'EVERGREEN') {
    // Search hints are not booking numbers.
    if (!/^[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(fields.booking ?? '')) delete fields.booking;
    const b = grab(/B\/L No\.[ \t]+([A-Z0-9 ]{6,20})/);
    if (b) fields.bill_of_lading = b.replace(/\s+/g, '');
    const vv = grab(/Vessel Voyage on B\/L[ \t]+([^\t\r\n]{3,40})/);
    if (vv) {
      const parsed = /^(.+?)\s+(\d{3,4}-\d{2,4}[A-Z]?)/i.exec(vv.trim());
      if (parsed) {fields.vessel_name = parsed[1];fields.voyage = parsed[2];vessels.push(parsed[1]);}
      else vessels.push(vv.trim());
    }
    fields.latest_event = grab(/Estimated On Board Date[ \t]+([A-Z]{3}-\d{2}-\d{4})/) ?? tail(/Container Count[ \t]+\d+/);
  }

  if (carrier === 'YML') {
    const vv = grab(/Vessel Voy No\.?[ \t]*:[ \t]*([^\r\n]{3,40})/i);
    if (vv) vessels.push(vv.trim());
    fields.board_date = grab(/On Board Date[ \t]*:[ \t]*([\d/]{8,12})/i);
    const units = grab(/No\. of Containers[^:]*:[ \t]*(\d+ unit[^\r\n]*)/i);
    if (units) fields.declared_units = units;
    fields.latest_event = grab(/Release Status[ \t]*\r?\n([^\r\n]{3,40})/i) ?? [fields.board_date, vv].filter(Boolean).join(' · ');
  }

  if (carrier === 'MSC') {
    const after = raw.split(/Latest move/i)[1] ?? '';
    const lines = after.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
    const picked = lines.filter((l) => !LABELS.test(l)).slice(0, 2);
    if (picked.length) fields.latest_event = picked.join(' · ');
    const pod = grab(/Port of Discharge[ \t]*\r?\n([^\r\n]+)/i);
    if (pod && !LABELS.test(pod)) fields.pod = pod;
  }

  if (carrier === 'MATSON') {
    // 查询方式的单选标签也叫 Booking 和 Bill of Lading。只读取明确标注的号码。
    const booking = grab(/^Booking(?:[ \t]+(?:No\.?|Number))?[ \t]*[:：][ \t]*([A-Z0-9-]*\d[A-Z0-9-]*)[ \t]*$/mi);
    const bill = grab(/^Bill of Lading(?:[ \t]+(?:No\.?|Number))?[ \t]*[:：][ \t]*([A-Z0-9-]*\d[A-Z0-9-]*)[ \t]*$/mi);
    if (booking) fields.booking = booking;
    if (bill) fields.bill_of_lading = bill;
    const m = /^([A-Z]{4}\d{6}-\d)\t([^\t]+)\t([^\t]+)\t([^\t]+)\t([^\t]+)\t(.*)$/m.exec(raw);
    if (m) {
      fields.container_row = m[1];
      fields.latest_event = `${m[5].trim()} · ${m[6].split('\t')[0].trim()}`;
    }
  }

  if (carrier === 'HAPAG_LLOYD') {
    // The container number may occupy its own line, followed by the remaining tab-separated cells.
    const row = /^[A-Z]{4}\d{7}(?:\r?\n)?\t(?:[^\t\r\n]*\t){3}([^\t\r\n]+)\t([^\t\r\n]*)/m.exec(raw);
    if (row) {
      fields.latest_event = row[1].trim();
      const plannedVessel = /^(.+?),\s*ETA\b/i.exec(row[2].trim())?.[1];
      if (plannedVessel) vessels.unshift(plannedVessel);
    } else {
      fields.latest_event = tail(/Vessel arrived[^\t\r\n]*/i) ?? fields.latest_event;
    }
    // These are equipment specifications, not the cargo's gross weight.
    const detailRows = [...raw.matchAll(/^([A-Z]{4}\d{7})(?:\r?\n)?\t(\d+(?:\.\d+)?)\t(\d+(?:\.\d+)?)\t([^\t\r\n]+)\t([^\t\r\n]+)\t([^\t\r\n]*)/gm)];
    if (detailRows.length) fields.container_details = detailRows.map(([,number,tare,payload,type,latest,planned]) => ({
      number,type:type.trim(),tare_kg:Number(tare),payload_kg:Number(payload),
      latest_status:latest.trim(),status_time:/\b(20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2})/.exec(latest)?.[1] ?? null,
      planned_raw:planned.trim() || null,
      source:{kind:'PAGE_OVERVIEW',section:'Container No. / Tare / Payload'},
    }));
  }

  if (carrier === 'SML') {
    // 表格列：Booking No. | Container No. | Seal No. | Size | Event Date/Time | Status | Place | Weight
    const row = /^([A-Z0-9]{10,14})	([A-Z]{4}\d{7})	([A-Z0-9]+)	([^	]+)	(\d{4}-\d{2}-\d{2} \d{2}:\d{2})	([^	]+)	([^	]+)	([^	]+)/m.exec(raw);
    const total = /Total\s*[:：]\s*(\d+)/i.exec(raw)?.[1];
    if (total) fields.declared_containers = total;
    if (row) {
      fields.booking = row[1];
      fields.seal = row[3];
      fields.container_size = row[4].trim();
      fields.latest_event = `${row[5]} · ${row[6].trim()} · ${row[7].trim()}`;
      fields.weight = row[8].trim();
      fields.latest_event_at = row[5];
    }
  }

  if (carrier === 'WAN_HAI') {
    fields.latest_event = [fields.board_date, fields.voyage, fields.vessel_name].filter(Boolean).join(' · ') || undefined;
  }

  if (carrier === 'COSCO') {
    // The first “订舱号”/“提单号” labels belong to the search menu.
    // Prefer the shipment detail heading, and discard menu/status text captured as an ID.
    const bookingHeader = /订舱["“]([A-Z0-9-]+)["”]\s*更多信息/i.exec(raw);
    if (bookingHeader) fields.booking = bookingHeader[1];
    for (const field of ['booking', 'bill_of_lading']) {
      if (!/^(?=.*\d)[A-Z0-9][A-Z0-9-]{3,34}$/i.test(fields[field] ?? '')) delete fields[field];
    }
    fields.latest_event = tail(/(?:还空箱|还重|已提箱|进场|离港|到港)[^\r\n]{0,60}/) ?? fields.latest_event;
    // COSCO 的日期是「标签 / 日期 / 时间 / 时区」四行一组
    const dateAfter = (label) => {
      const m = new RegExp(`${label}[ \\t]*\\r?\\n([0-9]{4}-[0-9]{2}-[0-9]{2})[ \\t]*\\r?\\n([0-9]{2}:[0-9]{2}(?::[0-9]{2})?)`).exec(raw);
      return m ? `${m[1]} ${m[2]}` : undefined;
    };
    fields.etd = dateAfter('预计离港') ?? fields.etd;
    fields.eta = dateAfter('预计到港') ?? fields.eta;
    fields.atd = dateAfter('实际离港') ?? fields.atd;
    fields.ata = dateAfter('实际到港') ?? fields.ata;
    fields.gate_in_loaded_at = dateAfter('还重时间');
    fields.empty_return_at = dateAfter('还空时间');
    fields.return_time = fields.gate_in_loaded_at ?? fields.empty_return_at;
    // 4 个里程碑（页面就按这个顺序给）：还重(Laden Return) / 实际离港(ATD) / 预计到港(ETA) / 预计可提货
    const pickupAt = dateAfter('预计可提货时间');
    fields.milestones = {
      pickup_at: null,
      departure_at: fields.atd ?? null,
      arrival_at: fields.ata ?? null,
      delivery_at: null,
    };
    fields.estimated_cargo_available_at = pickupAt;

    // POR / POD：找「起始地」后面紧跟着的「城市, 国家码」值（页面里这段可能出现多次，取第一个有效段）
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] !== '起始地') continue;
      const window8 = lines.slice(index + 1, index + 9).filter(Boolean);
      const cities = window8.filter((t) => /,\s*[A-Z]{2}$/.test(t));
      if (cities.length >= 2) {
        fields.por = cities[0];
        fields.pod = cities[cities.length - 1];
        break;
      }
    }

    // 分段运输（Routing）：表头「船名 / 航线·航次 / 装货港 / 离港时间 / 卸货港 / 到港时间」
    // 数据是 9 行一组：船名、服务代码、航次、装货港、预计离港、实际离港、卸货港、预计到港、实际到港
    const clean = (value) => String(value ?? '').replace(/	/g, '').trim();
    const headerIndex = lines.findIndex((line) => /^船名	/.test(line) || /船名.*航线/.test(line));
    if (headerIndex >= 0) {
      const legs = [];
      let cursor = headerIndex + 1;
      const dateOf = (line) => {
        const match = /(?:预计|实际)[：:]\s*(.+)$/.exec(String(line ?? ''));
        if (!match) return undefined;
        const value = match[1].trim();
        return /未|--/.test(value) ? undefined : value;
      };
      // 只认「像船名」的行：不含冒号/中文段标题，且下一行是服务代码、再下一行是航次
      const looksLikeVessel = (line) => {
        const text = clean(line);
        if (!text || /[:：]/.test(text)) return false;
        if (/补充信息|装货港|卸货港|起始地|目的地|收货地|返箱地|提空地|还重地|订舱信息|申报|VGM|文件夹|名单|通知/.test(text)) return false;
        return /[A-Za-z]{3,}/.test(text) && text.length <= 32;
      };
      while (cursor < lines.length) {
        if (!looksLikeVessel(lines[cursor])) break;
        const vessel = clean(lines[cursor]).split(/\s{2,}/)[0];
        if (!vessel) break;
        const service = clean(lines[cursor + 1]);
        const voyage = clean(lines[cursor + 2]);
        const loadPort = clean(lines[cursor + 3]);
        const etd = dateOf(lines[cursor + 4]);
        const atd = dateOf(lines[cursor + 5]);
        const dischargePort = clean(lines[cursor + 6]);
        const eta = dateOf(lines[cursor + 7]);
        const ata = dateOf(lines[cursor + 8]);
        if (!vessel) break;
        legs.push({vessel, service, voyage, load_port: loadPort, discharge_port: dischargePort, etd, atd, eta, ata});
        cursor += 9;
        if (legs.length >= 6) break;
      }
      if (legs.length) {
        fields.legs = legs;
        const first = legs[0];
        if (!fields.vessel && first.vessel) vessels.push(first.vessel);
        fields.voyage = fields.voyage ?? first.voyage;
        fields.service = fields.service ?? first.service;
        fields.etd = fields.etd ?? first.etd;
        fields.atd = fields.atd ?? first.atd;
        fields.eta = fields.eta ?? first.eta;
        fields.ata = fields.ata ?? first.ata;
        fields.load_port = fields.load_port ?? first.load_port;
        fields.discharge_port = fields.discharge_port ?? first.discharge_port;
      }
    }

    // 「装货港 : / 卸货港 : / 起始地 : / 目的地 : / 收货地 : / 返箱地 :」——值在下一行
    const fieldAfterLabel = (label) => {
      const at = lines.findIndex((line) => line.startsWith(`${label} :`) || line.startsWith(`${label}:`));
      if (at < 0) return undefined;
      const value = clean(lines[at + 1]);
      return value || undefined;
    };
    const loadPortDetail = fieldAfterLabel('装货港');
    const dischargePortDetail = fieldAfterLabel('卸货港');
    if (loadPortDetail) fields.load_port_detail = loadPortDetail;
    if (dischargePortDetail) fields.discharge_port_detail = dischargePortDetail;
    const porDetail = fieldAfterLabel('起始地');
    const podDetail = fieldAfterLabel('目的地');
    if (porDetail && /,/.test(porDetail)) fields.por = porDetail.split('-')[0].trim() || fields.por;
    if (podDetail && /,/.test(podDetail)) fields.pod = podDetail.split('-')[0].trim() || fields.pod;


    // 逐箱明细：箱号行后面紧跟「运输方式 / 运输条款 / 当前位置 / 最新动态」，再下一行「于 时间」
    const containerDetails = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^[A-Z]{4}\d{7}$/.test(lines[index])) continue;
      const next = lines[index + 1] ?? '';
      const parts = next.split('	').map((t) => t.trim()).filter(Boolean);
      const statusLine = lines[index + 2] ?? '';
      const timeLine = lines[index + 3] ?? '';
      const at = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/.exec(`${statusLine} ${timeLine}`);
      containerDetails.push({
        number: lines[index],
        movement: parts[0] ?? null,
        terms: parts[1] ?? null,
        position: parts[2] ?? null,
        latest_status: (parts[3] ?? statusLine ?? '').replace(/^于\s*/, '').trim() || null,
        status_time: at ? at[1] : null,
      });
    }
    if (containerDetails.length) fields.container_details = containerDetails;

    // 用刚解析出的节点与箱级状态合成事件流（COSCO 的日期与描述不在同一行，通用收集器抓不到）
    const synthesized = [];
    const pushEvent = (at, description, location) => {
      if (!at) return;
      synthesized.push([at, description, location].filter(Boolean).join(' | '));
    };
    pushEvent(fields.gate_in_loaded_at, '还重时间 · Gate in laden', fields.por);
    pushEvent(fields.empty_return_at, '还空时间 · Empty container returned', fields.pod);
    pushEvent(fields.atd, '实际离港 · ATD', fields.load_port_detail ?? fields.por);
    pushEvent(fields.ata, '实际到港 · ATA', fields.discharge_port_detail ?? fields.pod);
    pushEvent(fields.eta, '预计到港 · ETA', fields.discharge_port_detail ?? fields.pod);
    pushEvent(pickupAt, '预计可提货 · 最终目的地', fields.pod);
    if (Array.isArray(fields.container_details)) {
      for (const detail of fields.container_details) {
        pushEvent(detail.status_time, `${detail.number} ${detail.latest_status ?? ''}`.trim(), detail.position);
      }
    }
    if (synthesized.length) fields.events = synthesized;
    const qty = grab(/(?:40|20|45)[A-Z]{1,3}\s*\*\s*(\d+)/);
    if (qty) fields.declared_containers = qty;
    // 运输详情表：船名 / 航线·航次 / 装货港 / 离港时间 / 卸货港 / 到港时间
    const leg = /([A-Z][A-Z0-9 .'-]{2,24})\t([^\t]{2,20})\t([^\t]{2,30})\t([0-9-]{8,12}(?:\s+[0-9:]+)?)\t([^\t]{2,30})\t([0-9-]{8,12}(?:\s+[0-9:]+)?)/.exec(raw);
    if (leg) {
      if (!vessels.length) vessels.push(leg[1].trim());
      fields.voyage = fields.voyage ?? leg[2].trim();
      fields.load_port = fields.load_port ?? leg[3].trim();
      fields.eta = fields.eta ?? leg[6].trim();
    }
  }

  if (carrier === 'CMA_CGM') {
    fields.latest_event = grab(/^([A-Z][a-z]{2}\.?[ \t]*\d{1,2}-[A-Z]{3}-\d{4}[ \t]*\r?\n[^\r\n]+[ \t]*\r?\n[^\r\n]+)/m)?.replace(/\s+/g, ' ') ?? fields.latest_event;
  }

  // 清掉 undefined/空值：赋值 undefined 也会建出 key，会让"被拦页面"被误判成有数据
  for (const key of Object.keys(fields)) {
    if (fields[key] === undefined || fields[key] === '' || fields[key] === 'undefined') delete fields[key];
  }

  // 兜底：很多站的 POR/POD 没有可识别的标签，但页面里会出现「城市, 国家码」
  // 这里取首个当起运、末个当目的（两者必须不同），只为把字段填上，不做任何猜测性改写
  const cityPairs = [...raw.matchAll(/^([A-Z][A-Za-z .'-]{2,28}, ?[A-Z]{2})\s*$/gm)].map((m) => m[1].trim());
  if (cityPairs.length >= 2) {
    const uniq = [...new Set(cityPairs)];
    if (!fields.por) fields.por = uniq[0];
    if (!fields.pod) fields.pod = uniq[uniq.length - 1] !== uniq[0] ? uniq[uniq.length - 1] : undefined;
  }




  // ===== MSC：容器块（Container/Type/Latest move/POD ETA）+ 事件表（日期/地点/描述/方式/堆场） =====
  if (carrier === 'MSC') {
    // Dates in a collapsed summary are ETA labels, not movement records.
    events.length = 0;
    delete fields.latest_event;
    const containerBlocks = [...raw.matchAll(/Container\s*\r?\n([A-Z]{4}\d{7})\s*\r?\nType\s*\r?\n([^\r\n]+)\s*\r?\nLatest move\s*\r?\n([^\r\n]+)\s*\r?\nPOD ETA\s*\r?\n([^\r\n]+)/g)];
    if (containerBlocks.length) {
      fields.container_details = containerBlocks.map((match) => ({
        number: match[1].trim(),
        type: match[2].trim(),
        position: match[3].trim(),
        latest_status: null,
        status_time: null,
        eta: match[4].trim(),
        eta_raw: match[4].trim(),
        eta_label: 'POD ETA',
        source: {kind:'PAGE_OVERVIEW',section:'CONTAINERS'},
      }));
      const etas = containerBlocks.map((m) => m[4].trim()).filter(Boolean);
      if (etas.length) fields.eta = fields.eta ?? etas[0];
    }

    // 事件表：MSC 每个箱下面各有一张表，统一全页扫描「日期 + 后 4 行」的五元组
    const rows = [];
    for (let cursor = 0; cursor + 4 < lines.length; cursor += 1) {
      const date = lines[cursor];
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date ?? '')) continue;
      const [, location, description, mode, facility] = lines.slice(cursor, cursor + 5);
      if (!isMscHistoryRow({date,location,description,mode,facility})) continue;
      rows.push({date, location, description, mode, facility});
      cursor += 4;
      if (rows.length >= 200) break;
    }
    const uniqueRows = [...new Map(rows.map((row) => [`${row.date}|${row.description}`, row])).values()];
    if (uniqueRows.length) {
      fields.msc_events = uniqueRows;
      const loaded = uniqueRows.find((row) => /Loaded on Vessel/i.test(row.description ?? ''));
      const arrival = uniqueRows.find((row) => /Estimated Time of Arrival/i.test(row.description ?? ''));
      const emptyToShipper = uniqueRows.find((row) => /Empty to Shipper|Empty Container Release/i.test(row.description ?? ''));
      const returned = uniqueRows.find((row) => /Empty Container Returned|Returned from Consignee/i.test(row.description ?? ''));
      if (loaded) {
        fields.milestone_departure = loaded.date;
        if (loaded.mode && !/facility|terminal|description|location|equipment/i.test(loaded.mode)) {
          vessels.unshift(loaded.mode.replace(/\s+[A-Z0-9]{4,}$/, ''));
          const voyage = loaded.mode.match(/([A-Z]{2}\d{3,4}[A-Z]?)$/)?.[1];
          if (voyage) fields.voyage = fields.voyage ?? voyage;
        }
      }
      if (arrival) fields.milestone_arrival = arrival.date;
      if (emptyToShipper) fields.milestone_pickup = emptyToShipper.date;
      if (returned) fields.milestone_delivery = returned.date;
      fields.events = uniqueRows.map((row) => [row.date, row.location, row.description, row.mode, row.facility].filter(Boolean).join(' | '));
      const latest = uniqueRows[0];
      fields.latest_event = [latest.date,latest.description,latest.location].filter(Boolean).join(' | ');
    }

    const shippedFrom = grab(/Shipped From\s*\r?\n([^\r\n]+)/i);
    const discharge = grab(/Port of Discharge\s*\r?\n([^\r\n]+)/i);
    if (shippedFrom) fields.por = shippedFrom;
    if (discharge) fields.pod = discharge;
  }

  if (carrier === 'CMA_CGM') {
    const summary = cmaOverview(raw);
    if (summary) {
      fields.container_details = summary;
      // The latest container location is not the port of loading/discharge.
      delete fields.por;
      delete fields.pod;
      events.length = 0;
      for (const detail of summary) {
        if (detail.status_time) events.push([detail.status_time,detail.latest_status,detail.position,detail.number].join(' | '));
      }
      const latest = [...summary].sort((a,b) => (b.status_time ?? '').localeCompare(a.status_time ?? ''))[0];
      fields.latest_event = [latest.status_time,latest.latest_status,latest.position,latest.number].filter(Boolean).join(' | ');
      fields.latest_event_at = latest.status_time;
    }
  }

  // ===== HMM：Shipment Progress（起运/到港）+ Shipment History 表（日期/时间/地点/状态/方式） =====
  if (carrier === 'HMM') {
    const departure = /Departure at Origin\s*\r?\n(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/.exec(raw);
    const arrival = /Arrival at Destination\s*\r?\n(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/.exec(raw);
    if (departure) fields.milestone_departure = departure[1];
    if (arrival) fields.milestone_arrival = arrival[1];

    const historyStart = lines.findIndex((line) => /^Shipment History$/i.test(line));
    if (historyStart >= 0) {
      const rows = [];
      for (let cursor = historyStart; cursor + 4 < lines.length; cursor += 1) {
        const date = lines[cursor];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const time = lines[cursor + 1];
        const location = lines[cursor + 2];
        const status = lines[cursor + 3];
        const mode = lines[cursor + 4];
        if (!/^\d{2}:\d{2}$/.test(time ?? '')) continue;
        rows.push({date, time, location, status, mode});
        cursor += 4;
        if (rows.length >= 40) break;
      }
      if (rows.length) {
        fields.hmm_history = rows;
        fields.events = rows.map((row) => [row.date, row.time, row.status, row.location, row.mode].filter(Boolean).join(' | '));
        const withVessel = rows.find((row) => /[A-Z]{3,}/.test(row.mode ?? '') && !/^(?:Vessel|Rail|Truck)$/i.test(row.mode ?? ''));
        if (withVessel && !vessels.length) {
          const voyage = withVessel.mode.match(/\s([A-Z]{0,3}\d{3,5}[A-Z]?)$/)?.[1];
          vessels.push(voyage ? withVessel.mode.replace(new RegExp(`\\s${voyage}$`), '') : withVessel.mode);
          fields.voyage = fields.voyage ?? voyage ?? null;
        }
        const last = rows[0];
        if (last) {
          fields.latest_event = `${last.date} ${last.time} ${last.status} · ${last.location}`;
          fields.latest_event_at = `${last.date} ${last.time}`;
        }
      }
    }
  }

  // ===== SML：表格行已有，补里程碑与事件 =====
  if (carrier === 'SML') {
    const rowPattern = /^[\t ]*([A-Z0-9]{10,14})\t([A-Z]{4}\d{7})\t([A-Z0-9]+)\t([^\t]+)\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\t([^\t]+)\t([^\t]+)\t([^\t]+)/gm;
    const rows = [...raw.matchAll(rowPattern)].map((match) => ({
      booking: match[1], container: match[2], seal: match[3], size: match[4].trim(),
      at: match[5], status: match[6].trim(), place: match[7].trim(), weight: match[8].trim(),
    }));
    if (rows.length) {
      fields.container_details = rows.map((row) => ({
        number: row.container,
        type: row.size,
        position: row.place,
        latest_status: row.status,
        status_time: row.at,
      }));
      fields.events = [...new Set(rows.map((row) => [row.at, row.status, row.place].filter(Boolean).join(' | ')))];
      const first = rows[0];
      fields.milestone_departure = first.at;
      fields.latest_event = `${first.at} ${first.status} · ${first.place}`;
      fields.latest_event_at = first.at;
      fields.seal = first.seal;
      fields.container_size = first.size;
      fields.weight = first.weight;
    }
  }

  // 船司专用事件（如 MSC/HMM/SML 的表格行、COSCO 节点）并入统一事件流，并去重
  if (Array.isArray(fields.events) && fields.events.length) {
    for (const line of fields.events) {
      if (/tracking results are provided|if you have any questions|show all|collapse menu/i.test(line)) continue;
      if (!events.includes(line)) events.unshift(line);
    }
    events.length = Math.min(events.length, 60);
  }


  applyPortRules(carrier, raw, lines, fields, vessels);

  // ===== 通用：多行事件重建 =====
  // 很多站把「描述 / 日期 / 时间」拆成相邻多行，单行收集器会漏掉；这里做相邻行配对
  if (events.length < 6 && !['CMA_CGM','MSC'].includes(carrier)) {
    const dateOnly = /^\s*(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-[A-Za-z]{3}-20\d{2})\s*$/;
    const timeOnly = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\s*([A-Z]{2,4})?\s*$/i;
    const noisy = /^(?:menu|login|search|track|home|print|excel|share|cookie|privacy|terms|이전|다음|close)$/i;
    const rebuilt = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (noisy.test(line) || line.length < 3) continue;
      // 形态 A：日期行 → 后面 1~2 行是描述
      if (dateOnly.test(line)) {
        const next = lines[index + 1] ?? '';
        const after = lines[index + 2] ?? '';
        const candidate = !noisy.test(next) && next.length > 3 && !dateOnly.test(next) ? next : (!noisy.test(after) && after.length > 3 ? after : '');
        if (candidate && /[A-Za-z一-龥]{3}/.test(candidate)) {
          rebuilt.push(`${line.trim()} | ${candidate.slice(0, 80)}`);
        }
        continue;
      }
      // 形态 B：描述行 → 紧跟日期行(+时间行)
      const nextIsDate = dateOnly.test(lines[index + 1] ?? '');
      if (nextIsDate && /[A-Za-z一-龥]{4}/.test(line) && !noisy.test(line)) {
        const time = timeOnly.test(lines[index + 2] ?? '') ? ` ${lines[index + 2].trim()}` : '';
        rebuilt.push(`${lines[index + 1].trim()}${time} | ${line.slice(0, 80)}`);
      }
    }
    for (const line of rebuilt) {
      if (events.length >= 40) break;
      if (!events.some((existing) => existing.includes(line.split(' | ').slice(-1)[0].slice(0, 24)))) events.push(line);
    }
  }

  // ===== 通用：从事件里推导里程碑（各家页面只会给其中一部分）=====
  if (!fields.milestone_pickup || !fields.milestone_departure || !fields.milestone_arrival || !fields.milestone_delivery) {
    const allTimes = (line) => [...String(line ?? '').matchAll(
      /(20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2})?|\d{1,2}-[A-Z]{3}-20\d{2})/gi,
    )].map((m) => m[1]);
    const rules = [
      ['milestone_pickup', /empty to shipper|提空|提箱|还重|laden return|gate in empty|empty container release|进闸/i],
      ['milestone_departure', /loaded on vessel|离港|开船|departure|sailed|on board|vessel departure|atd/i],
      ['milestone_arrival', /arriv|到港|discharg|berth|arrival at|ata|eta/i],
      ['milestone_delivery', /cargo pickup|提货|delivered|returned from consignee|完成交付|empty container returned/i],
    ];
    for (const [key, pattern] of rules) {
      if (fields[key]) continue;
      const hit = events.find((line) => pattern.test(line) && !(carrier === 'COSCO' && (
        /预计|\bETA\b/i.test(line) || (key === 'milestone_pickup' && /还重|laden return|gate in laden/i.test(line))
      )));
      if (!hit) continue;
      const times = allTimes(hit);
      if (!times.length) continue;
      // 起运/离港取第一个时间，到港/提货取最后一个（一行里常同时有离港和到港）
      fields[key] = ['milestone_pickup', 'milestone_departure'].includes(key) ? times[0] : times[times.length - 1];
    }
  }

  const ok = containers.length > 0 || events.length > 0 || Object.keys(fields).length > 0;

  vessels = vessels.filter((v) => v && v !== 'undefined' && v.length > 2
    && !/^(?:facility|description|location|type|container|date|status)/i.test(v)
    && !/equipment handling|facility name|terminal name/i.test(v));

  if (fields.vessel_name && !vessels.length) vessels.push([fields.vessel_name, fields.voyage].filter(Boolean).join(' / '));

  return {
    reference: String(reference ?? ''),
    ok,
    containers,
    container_count: Number(fields.declared_containers) || containers.length || undefined,
    vessel_voyage: vessels.length ? [...new Set(vessels)].slice(0, 3) : undefined,
    fields,
    events,
    dates: findDates(raw).slice(0, 20),
    text_length: raw.length,
  };
}

/** 输出统一记录（供报告使用） */
export function toRecord(carrier, reference, link, extraction, extra = {}) {
  return {
    carrier,
    carrier_name: CARRIER_NAMES[carrier] ?? carrier,
    reference,
    status: extraction.ok ? 'QUERY_COMPLETED' : 'NO_BUSINESS_DATA',
    containers: extraction.containers,
    container_count: extraction.container_count ?? 0,
    vessel_voyage: extraction.vessel_voyage ?? [],
    fields: extraction.fields,
    latest_event: extraction.fields.latest_event ?? (carrier === 'ONE' ? null : extraction.events[0] ?? null),
    events: extraction.events,
    dates: extraction.dates,
    evidence: extra.evidence ?? null,
    seconds: extra.seconds ?? null,
    url: link ?? null,
    // 红线：页面命中 ≠ 业务已核验
    business_verified: false,
  };
}
