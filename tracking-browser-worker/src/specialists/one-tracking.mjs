// ONE（Ocean Network Express）货物追踪 —— 纯 HTTP 接口实现，不经过浏览器。
//
// 2026-10-28 实测结论（可复现）：
//   POST https://ecomm.one-line.com/api/v2/edh/containers/track-and-trace/search
//   body: {"page":"1","page_length":"10","filters":{"search_text":"<单号>","search_type":"BKG_NO"}}
//   → HTTP 201 + {"status":200,"code":1,"message":"Success","total":N,"data":[...]}
//
// 三个必须知道的坑（都是实测撞出来的）：
//   1. search_type 必须**大写**枚举：BKG_NO / CNTR_NO / PO_NO / ALL。
//      小写 all、bookingNo 或 "AUTO" 会被 Apigee 挡成 400 APIGEE-ERR-400。
//   2. 请求头里**没有**任何签名；只有普通浏览器头即可（不需要 Cookie、不需要登录）。
//   3. 单号带不带 ONEY 前缀都能查到，但后端返回的 bookingNo 会去掉前缀，比对时要注意。
//
// 只在需要时联网；离线测试走 injected fetch。

const ENDPOINT = 'https://ecomm.one-line.com/api/v2/edh/containers/track-and-trace/search';

/** 依据单号形态猜查询类型，猜不出就 ALL（实测 ALL 对 BKG 单号返回空，所以优先精确类型）。 */
export function oneSearchType(reference) {
  const value = String(reference ?? '').toUpperCase().replace(/\s+/g, '');
  if (/^ONEY[A-Z0-9]{10,}$/.test(value)) return 'BKG_NO';        // ONEY + 10 位 = 订舱号
  if (/^[A-Z]{4}\d{7}$/.test(value)) return 'CNTR_NO';           // 4 字母 + 7 位 = 箱号
  if (/^[A-Z]{2,4}\d{6,}$/.test(value)) return 'BKG_NO';
  if (/^\d{8,}$/.test(value)) return 'PO_NO';
  return 'ALL';
}

/** 把接口返回的一条 row 归一成统一记录结构（与项目其它船司一致：fields + source_text） */
export function normalizeOneRow(row, reference) {
  const eventText = (list) =>
    (list ?? []).map((event) => [
      event.date ?? '',
      event.matrixId ?? '',
      event.locationName ?? '',
      event.trigger ?? '',
    ].filter(Boolean).join(' | '));

  const cargoRows = eventText(row.cargoEvents);
  const deadlineRows = eventText(row.deadlineEvents);
  const latest = row.latestEvent ?? {};

  const fields = {
    booking_number: row.bookingNo ?? '',
    container_number: row.containerNo ?? '',
    container_type_size: row.containerTypeSize ?? '',
    weight: row.weight ?? '',
    place_of_receipt: row.por?.locationName ?? '',
    place_of_delivery: row.pod?.locationName ?? '',
    vessel_voyage: [row.vesselVoyage?.vesselName, row.vesselVoyage?.voyageNo].filter(Boolean).join(' / '),
    latest_event: [latest.date, latest.eventName, latest.locationName].filter(Boolean).join(' | '),
    cargo_events: cargoRows.join('\n'),
    deadline_events: deadlineRows.join('\n'),
    customs_release: [
      row.cargoReleaseCustoms?.customsClearanceDate,
      row.cargoReleaseCustoms?.receivedDate,
    ].filter(Boolean).join(' / '),
    soc_flag: row.socFlag === true ? 'SOC' : '',
    reference: String(reference ?? ''),
  };

  for (const key of Object.keys(fields)) if (!fields[key]) delete fields[key];

  const source = [
    `bookingNo=${row.bookingNo ?? ''}`,
    `containerNo=${row.containerNo ?? ''}`,
    `por=${row.por?.locationName ?? ''}`,
    `pod=${row.pod?.locationName ?? ''}`,
    `vessel=${fields.vessel_voyage ?? ''}`,
    latest.eventName ? `latest=${latest.eventName} @ ${latest.locationName ?? ''} ${latest.date ?? ''}` : '',
    ...cargoRows,
  ].filter(Boolean).join('\n');

  return {fields, source_text: source, evidence_kind: 'ONE_PUBLIC_API_JSON'};
}

/**
 * 查询 ONE 追踪。
 * @param {string} reference 提单号 / 订舱号 / 箱号
 * @param {{searchType?:string, fetchImpl?:Function, timeoutMs?:number}} [options]
 */
export async function trackOne(reference, options = {}) {
  const searchType = options.searchType ?? oneSearchType(reference);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('ONE_TRACKING_FETCH_UNAVAILABLE');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  let response;
  let text;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://www.one-line.com',
        Referer: 'https://www.one-line.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        page: '1',
        page_length: '10',
        filters: {search_text: String(reference), search_type: searchType},
      }),
      signal: controller.signal,
    });
    text = await response.text();
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      carrier: 'ONE',
      business: 'TRACKING',
      execution_status: 'TECHNICAL_FAILED',
      code: 'ONE_RESPONSE_NOT_JSON',
      http_status: response?.status ?? null,
      summary: `ONE 返回非 JSON（HTTP ${response?.status}）：${String(text).slice(0, 120)}`,
      records: [],
    };
  }

  if (response.status !== 200 && response.status !== 201) {
    return {
      carrier: 'ONE',
      business: 'TRACKING',
      execution_status: 'HUMAN_REQUIRED',
      code: 'ONE_HTTP_ERROR',
      http_status: response.status,
      summary: `ONE 接口返回 HTTP ${response.status}：${payload?.message ?? ''}`,
      records: [],
      api_call: {endpoint: ENDPOINT, search_type: searchType},
    };
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const records = rows.map((row) => normalizeOneRow(row, reference));
  const total = Number(payload?.total ?? rows.length);

  if (!records.length) {
    return {
      carrier: 'ONE',
      business: 'TRACKING',
      execution_status: 'PARTIAL_OBSERVATION',
      result_status: 'NOT_EVALUATED',
      code: 'ONE_NO_RECORD_FOR_REFERENCE',
      http_status: response.status,
      summary: `ONE 接口成功（code=${payload?.code}）但没有返回记录：${reference}（search_type=${searchType}）。` +
        '确认单号类型：BKG_NO=订舱号(ONEY+10位)、CNTR_NO=箱号、PO_NO=客户单号。',
      records: [],
      api_call: {endpoint: ENDPOINT, search_type: searchType, total},
      tried: {reference, search_type: searchType},
    };
  }

  return {
    carrier: 'ONE',
    business: 'TRACKING',
    execution_status: 'COMPLETED',
    result_status: 'RESULTS_GROUNDED',
    http_status: response.status,
    query_submitted: true,
    summary: `ONE ${reference}：读取 ${records.length}/${total} 条记录（${searchType}）；` +
      `最新节点 ${records[0].fields.latest_event ?? '未提供'}。`,
    records,
    reported_count: total,
    extraction_complete: records.length === total,
    extraction_scope: records.length === total ? 'ALL_VISIBLE_RECORDS' : 'CORE_RECORDS_AND_FULL_SNAPSHOT',
    api_call: {endpoint: ENDPOINT, search_type: searchType, http_status: response.status},
    // 红线：接口成功不等于业务已核验
    business_verified: false,
  };
}
