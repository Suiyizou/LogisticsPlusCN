// 各船司的结果页「港口 / 船名 / 航次」解析规则
//
// 为什么单独成文件：这些是纯文本规则，容易写错转义，单独放一处便于维护与离线校验。
// 每家的排版都不同，规则只做「位置等价搬迁」，绝不猜测：
//   · 有标签就按标签取值（Evergreen / ZIM / MAERSK）
//   · 有“城市 (港口码)”结构就按结构取（YML）
//   · 都没有就退回 OOCL 那种“页面顶部两行”常识布局，且只在完全没取到时兜底

const nextLine = (lines, from, max = 4) => {
  for (let cursor = from + 1; cursor < Math.min(from + 1 + max, lines.length); cursor += 1) {
    const value = (lines[cursor] ?? '').trim();
    if (value && value.length > 2) return value;
  }
  return undefined;
};


/** 从“船名+航次”混写的字符串里拆出航次（各家写法不同） */
function splitTrailingVoyage(text) {
  const value = String(text ?? '')
    .replace(/[（(][^）)]*[）)]/g, ' ')   // 半角 + 全角括号一起剥
    .replace(/[^\x20-\x7E]+/g, ' ')      // 去掉中文等非 ASCII 尾缀
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!value) return null;
  // ZIM: PELICAN I/16/E
  let match = /^(.*?)\/\s*(\d{1,4})\s*\/\s*([A-Z])$/.exec(value);
  if (match) return {name: match[1].trim(), voyage: `${match[2]}/${match[3]}`};
  // EVERGREEN: EVER LIVELY 1281-079E
  match = /^(.*?)\s+(\d{3,4}-\d{2,4}[A-Z]?)$/.exec(value);
  if (match) return {name: match[1].trim(), voyage: match[2]};
  // YML / ONE: YM UNIFORM-250E、MOL EXPERIENCE 105E
  match = /^(.*?)[-\s](\d{2,5}[A-Z]?)$/.exec(value);
  if (match) return {name: match[1].trim(), voyage: match[2]};
  return {name: value, voyage: undefined};
}

const splitVesselVoyage = (text) => {
  const parsed = splitTrailingVoyage(text);
  if (parsed?.name) parsed.name = parsed.name.replace(/[\s/\-]+$/, '').trim();
  return parsed;
};

export function applyPortRules(carrier, raw, lines, fields, vessels) {
  const cellAfterLabel = (label, column = 1) => {
    const line = lines.find((row) => row.startsWith(label));
    if (!line) return undefined;
    const cells = line.split('\t').map((cell) => cell.trim()).filter(Boolean);
    return cells[column] || undefined;
  };

  if (carrier === 'EVERGREEN') {
    const por = cellAfterLabel('Place of Receipt');
    const pol = cellAfterLabel('Port of Loading');
    const pod = cellAfterLabel('Port of Discharge');
    const vesselCell = cellAfterLabel('Vessel Voyage on B/L');
    if (pol) fields.por = pol;
    if (pod) fields.pod = pod;
    if (por) fields.place_of_receipt = por;
    if (vesselCell && !vessels.length) {
      const parsed = splitVesselVoyage(vesselCell);
      if (parsed) {
        vessels.push(parsed.name);
        if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
      }
    }
  }

  if (carrier === 'YML') {
    const at = lines.findIndex((line) => /Vessel Voy No\.?\s*:/i.test(line));
    if (at >= 0 && !vessels.length) {
      const value = lines[at].replace(/.*Vessel Voy No\.?\s*:/i, '');
      const parsed = splitVesselVoyage(value);
      if (parsed) {
        vessels.push(parsed.name);
        if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
      }
    }
    const route = lines.find((line) => /\([A-Z]{5}\)/.test(line));
    if (route) {
      const names = [...route.matchAll(/([A-Z][A-Za-z .,'-]{2,30}?)\s*\(([A-Z]{5})\)/g)].map((m) => m[1].trim());
      if (names.length >= 2) {
        fields.por = fields.por ?? names[0];
        fields.pod = fields.pod ?? names[names.length - 1];
      }
    }
  }

  if (carrier === 'ZIM') {
    const labelValue = (pattern) => {
      const at = lines.findIndex((line) => pattern.test(line));
      if (at < 0) return undefined;
      return nextLine(lines, at);
    };
    const pol = labelValue(/^Port of Loading/i);
    const pod = labelValue(/^Port of Discharge/i);
    if (pol) fields.por = pol;
    if (pod) fields.pod = pod;
    if (!vessels.length) {
      const vessel = labelValue(/^Vessel\s*\/\s*Voyage/i);
      if (vessel) {
        const parsed = splitVesselVoyage(vessel);
        if (parsed) {
          vessels.push(parsed.name);
          if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
        }
      }
    }
  }

  if (carrier === 'MAERSK') {
    const leg = /Vessel (?:departure|arrival)\s*\(([^/)]+?)\s*\/\s*([A-Z0-9]+)\)/i.exec(raw);
    if (leg && !vessels.length) {
      vessels.push(leg[1].trim());
      fields.voyage = fields.voyage ?? leg[2].trim();
    }
    const labelValue = (pattern) => {
      const at = lines.findIndex((line) => pattern.test(line));
      if (at < 0) return undefined;
      return nextLine(lines, at, 2);
    };
    const from = labelValue(/^From\s*(?:\(.*\))?$/i);
    const to = labelValue(/^To\s*(?:\(.*\))?$/i);
    if (from && !fields.por) fields.por = from;
    if (to && !fields.pod) fields.pod = to;
  }

  if (carrier === 'OOCL') {
    // 页面顶部就是起运地/目的地两行（如 Shanghai / Long Beach）
    if (!fields.por || !fields.pod) {
      const head = lines.slice(0, 16).filter((line) => /^[A-Z][A-Za-z .,'-]{2,30}$/.test(line));
      if (head.length >= 2) {
        fields.por = fields.por ?? head[0];
        fields.pod = fields.pod ?? head[1];
      }
    }
    // 船名里常混进状态码（第一行是 PDT，第二行才是船名）：逐行拆开取最后一段
    const flat = vessels
      .flatMap((value) => String(value).split(String.fromCharCode(10)))
      .map((part) => part.trim())
      .filter(Boolean);
    if (flat.length) {
      vessels.length = 0;
      const parsed = splitVesselVoyage(flat[flat.length - 1]);
      if (parsed) {
        vessels.push(parsed.name);
        if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
      }
    }
  }

  if (carrier === 'HMM') {
    // 「地点 / 事件」两行一组：Departure at Origin 上一行是起运地，Arrival at Destination 上一行是目的地
    const before = (pattern) => {
      const at = lines.findIndex((line) => pattern.test(line));
      return at > 0 ? lines[at - 1] : undefined;
    };
    const por = before(/^Departure at Origin/i);
    const pod = before(/^Arrival at Destination/i);
    if (por) fields.por = por;
    if (pod) fields.pod = pod;
    const transship = lines.find((line) => /^[A-Z][A-Za-z .,'-]{2,30},\s*[A-Z]{2,}$/.test(line) && line !== por && line !== pod);
    if (transship) fields.transshipment = transship;
  }

  if (carrier === 'ONE') {
    const headerWords = /^(?:Vessel|Port of Loading|Departure Date|Port of Discharging|Arrival Time|Actual Schedule|Estimate Schedule|Coastal Schedule|Download|Show Latest Event)$/i;
    // 表头（Vessel / Port of Loading / Departure Date / Port of Discharging / Arrival Time）之后是 7 行值
    const headerAt = lines.findIndex((line, index) => /^Vessel$/i.test(line)
      && lines.slice(index + 1, index + 6).some((row) => /^Port of Loading$/i.test(row)));
    if (headerAt >= 0) {
      let cursor = headerAt + 1;
      while (cursor < lines.length && headerWords.test(lines[cursor])) cursor += 1;

      const vesselLine = (lines[cursor] ?? '').trim();
      const parsed = splitVesselVoyage(vesselLine);
      if (parsed && /[A-Z]{3,}/.test(parsed.name)) {
        vessels.push(parsed.name);
        if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
      }
      const porValue = (lines[cursor + 1] ?? '').trim();
      const podValue = (lines[cursor + 4] ?? '').trim();
      if (/,/.test(porValue) && !headerWords.test(porValue)) fields.por = porValue;
      if (/,/.test(podValue) && !headerWords.test(podValue) && podValue !== porValue) fields.pod = podValue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(lines[cursor + 2] ?? '')) fields.etd = [lines[cursor + 2], lines[cursor + 3]].filter(Boolean).join(' ');
      if (/^\d{4}-\d{2}-\d{2}$/.test(lines[cursor + 5] ?? '')) fields.eta = [lines[cursor + 5], lines[cursor + 6]].filter(Boolean).join(' ');
    }
    // 兜底：目的港 = “Port of Discharging”之后第一个与起运港不同的“城市, 国家”行
    if (!fields.pod || fields.pod === fields.por || /vessel/i.test(String(fields.pod))) {
      const at = lines.findIndex((line) => /^Port of Discharging$/i.test(line));
      for (let index = at + 1; at >= 0 && index < Math.min(at + 10, lines.length); index += 1) {
        const value = (lines[index] ?? '').trim();
        if (!/,/.test(value) || headerWords.test(value)) continue;
        if (fields.por && value === fields.por) continue;
        fields.pod = value;
        break;
      }
    }
  }

  if (carrier === 'MSC') {
    // 船名航次只在事件表的 mode 列里（如 “MSC BERANGERE GO642N”）
    {
      // 29 箱那票每个箱的事件表里船名不同，取“出现次数最多”的那个（通常就是主航次）
      const found = [...raw.matchAll(/([A-Z][A-Z0-9]{2,}(?:\s+[A-Z0-9]{2,}){1,3})\s+([A-Z]{2}\d{3,4}[A-Z]?)/g)]
        .map((match) => ({name: match[1].trim(), voyage: match[2]}))
        .filter((item) => !/^(?:EMPTY|LADEN|ESTIMATED|ARRIVAL|DEPARTURE|EXPORT|IMPORT|SHANGHAI|LONG BEACH)$/i.test(item.name));
      if (found.length) {
        const tally = new Map();
        for (const item of found) {
          const key = item.name + '|' + item.voyage;
          tally.set(key, {item, count: (tally.get(key)?.count ?? 0) + 1});
        }
        const best = [...tally.values()].sort((a, b) => b.count - a.count)[0].item;
        vessels.unshift(best.name);
        fields.voyage = fields.voyage ?? best.voyage;
      }
    }
    if (!vessels.length) {
      // 不用换行正则（容易被转义链损坏）：先定位“装船”描述行，再往后找第一条像船名的行
      const anchor = lines.findIndex((line) => /Export Loaded on Vessel|Empty to Shipper/i.test(line));
      if (anchor >= 0) {
        for (let cursor = anchor + 1; cursor < Math.min(anchor + 6, lines.length); cursor += 1) {
          const candidate = (lines[cursor] ?? '').trim();
          if (!/^[A-Z][A-Z0-9 .'-]{3,30}$/.test(candidate)) continue;
          if (/^(?:EMPTY|LADEN|Estimated|Show|Shanghai|Long Beach)/i.test(candidate)) continue;
          const match = /^(.+?)\s+([A-Z]{2}\d{3,4}[A-Z]?)$/.exec(candidate);
          if (match) { vessels.push(match[1].trim()); fields.voyage = fields.voyage ?? match[2]; }
          else vessels.push(candidate);
          break;
        }
      }
    }
    if (!fields.pod) {
      const at = lines.findIndex((line) => /^Port of Discharge$/i.test(line));
      if (at >= 0) fields.pod = lines[at + 1];
    }
    if (!fields.por) {
      const at = lines.findIndex((line) => /^Shipped From$/i.test(line));
      if (at >= 0) fields.por = lines[at + 1];
    }
  }

  if (carrier === 'OOCL') {
    // 页面顶部就是起运地/目的地两行（如 Shanghai / Long Beach）
    if (!fields.por || !fields.pod) {
      const head = lines.slice(0, 16).filter((line) => /^[A-Z][A-Za-z .,'-]{2,30}$/.test(line));
      if (head.length >= 2) {
        fields.por = fields.por ?? head[0];
        fields.pod = fields.pod ?? head[1];
      }
    }
    // 船名里常混进状态码（第一行是 PDT，第二行才是船名）：逐行拆开取最后一段
    const flat = vessels
      .flatMap((value) => String(value).split(String.fromCharCode(10)))
      .map((part) => part.trim())
      .filter(Boolean);
    if (flat.length) {
      vessels.length = 0;
      const parsed = splitVesselVoyage(flat[flat.length - 1]);
      if (parsed) {
        vessels.push(parsed.name);
        if (parsed.voyage) fields.voyage = fields.voyage ?? parsed.voyage;
      }
    }
  }

  return fields;
}
