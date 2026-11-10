import { logisticsPortCatalog } from "./logistics-port-catalog.mjs";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const first = (...values) => values.map(text).find(Boolean) || "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const key = (value) =>
  text(value).normalize("NFKD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").toUpperCase();

// ISO 3166-1 alpha-2 and alpha-3 identifiers, in paired order.
const pairs =
  "AFAFG ALALB DZDZA ASASM ADAND AOAGO AIAIA AQATA AGATG ARARG AMARM AWABW AUAUS ATAUT AZAZE BSBHS BHBHR BDBGD BBBRB BYBLR BEBEL BZBLZ BJBEN BMBMU BTBTN BOBOL BABIH BWBWA BVBVT BRBRA IOIOT BNBRN BGBGR BFBFA BIBDI KHKHM CMCMR CACAN CVCPV KYCYM CFCAF TDTCD CLCHL CNCHN CXCXR CCCCK COCOL KMCOM CGCOG CDCOD CKCOK CRCRI CICIV HRHRV CUCUB CYCYP CZCZE DKDNK DJDJI DMDMA DODOM ECECU EGEGY SVSLV GQGNQ ERERI EEEST ETETH FKFLK FOFRO FJFJI FIFIN FRFRA GFGUF PFPYF TFATF GAGAB GMGMB GEGEO DEDEU GHGHA GIGIB GRGRC GLGRL GDGRD GPGLP GUGUM GTGTM GNGIN GWGNB GYGUY HTHTI HMHMD VAVAT HNHND HKHKG HUHUN ISISL ININD IDIDN IRIRN IQIRQ IEIRL ILISR ITITA JMJAM JPJPN JOJOR KZKAZ KEKEN KIKIR KPPRK KRKOR KWKWT KGKGZ LALAO LVLVA LBLBN LSLSO LRLBR LYLBY LILIE LTLTU LULUX MOMAC MGMDG MWMWI MYMYS MVMDV MLMLI MTMLT MHMHL MQMTQ MRMRT MUMUS YTMYT MXMEX FMFSM MDMDA MCMCO MNMNG MSMSR MAMAR MZMOZ MMMMR NANAM NRNRU NPNPL NLNLD NCNCL NZNZL NINIC NENER NGNGA NUNIU NFNFK MPMNP MKMKD NONOR OMOMN PKPAK PWPLW PSPSE PAPAN PGPNG PYPRY PEPER PHPHL PNPCN PLPOL PTPRT PRPRI QAQAT REREU ROROU RURUS RWRWA SHSHN KNKNA LCLCA PMSPM VCVCT WSWSM SMSMR STSTP SASAU SNSEN SCSYC SLSLE SGSGP SKSVK SISVN SBSLB SOSOM ZAZAF GSSGS ESESP LKLKA SDSDN SRSUR SJSJM SZSWZ SESWE CHCHE SYSYR TWTWN TJTJK TZTZA THTHA TLTLS TGTGO TKTKL TOTON TTTTO TNTUN TRTUR TMTKM TCTCA TVTUV UGUGA UAUKR AEARE GBGBR USUSA UMUMI UYURY UZUZB VUVUT VEVEN VNVNM VGVGB VIVIR WFWLF EHESH YEYEM ZMZMB ZWZWE AXALA BQBES CWCUW GGGGY IMIMN JEJEY MEMNE BLBLM MFMAF RSSRB SXSXM SSSSD XKXKK".split(
    " "
  );
const countries = new Map();
const languages = ["en", "zh", "zh-Hant"].map(
  (locale) => new Intl.DisplayNames(locale, { type: "region", fallback: "none" })
);
for (const pair of pairs) {
  const iso2 = pair.slice(0, 2);
  countries.set(iso2, iso2);
  countries.set(pair.slice(2), iso2);
  for (const language of languages) {
    const name = key(language.of(iso2));
    if (name) countries.set(name, iso2);
  }
}
for (const [iso2, names] of Object.entries({
  CN: [
    "PRC",
    "P.R. CHINA",
    "MAINLAND CHINA",
    "中华人民共和国",
    "CHINA. PEOPLE'S REPUBLIC",
    "PEOPLE'S REPUBLIC OF CHINA"
  ],
  US: ["U.S.", "U.S.A.", "UNITED STATES OF AMERICA"],
  GB: ["UK", "GREAT BRITAIN", "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND"],
  KR: ["REPUBLIC OF KOREA", "KOREA, REPUBLIC OF", "大韩民国"],
  AE: ["UAE", "U.A.E.", "阿联酋", "阿聯酋"],
  VN: ["VIET NAM"],
  RU: ["RUSSIAN FEDERATION"],
  TW: ["TAIWAN", "台灣", "台湾"],
  HK: ["HONG KONG", "HONG KONG SAR", "香港"],
  MO: ["MACAU", "MACAO", "澳门", "澳門"]
})) {
  for (const name of names) countries.set(key(name), iso2);
}

const portsByCode = new Map(logisticsPortCatalog.map((port) => [port.id, port]));
// These identify a country only. Air/inland abbreviations must never be assigned
// a seaport's coordinates or a made-up UN/LOCODE. Sources: logistics-map-geography.md.
const nonPortCountries = new Map([
  ["SHA", "CN"],
  ["IAH", "US"],
  ["TUL", "US"],
  ["TULSA", "US"],
  ["TULSA, OK", "US"],
  ["TULSA, OKLAHOMA", "US"],
  ["TULSA, OK, US", "US"],
  ["TULSA, OK (US)", "US"]
]);
const portsByName = new Map();
for (const port of logisticsPortCatalog) {
  for (const name of new Set([port.label, ...port.aliases].map(key))) {
    const matches = portsByName.get(name) ?? [];
    matches.push(port);
    portsByName.set(name, matches);
  }
}

function portCode(value) {
  return portsByCode.get(key(value).replace(/^([A-Z]{2})[ -]([A-Z2-9]{3})$/, "$1$2"));
}

function identifyPort(name, explicitCountry) {
  const compatible = (port) => !explicitCountry || port.countryCode === explicitCountry;
  const code = portCode(name);
  if (code) return compatible(code) ? code : null;
  const label = key(name).replace(/^PORT OF /, "");
  const direct = (portsByName.get(label) ?? []).filter(compatible);
  if (direct.length === 1) return direct[0];
  const qualified = label.match(/^([^,(]+?)[ ]*([,(].+)$/);
  if (!qualified) return null;
  const [, shortName, suffix] = qualified;
  const qualifier = suffix
    .replace(/^[,(]\s*/, "")
    .replace(/\)$/, "")
    .trim();
  const tokens = qualifier
    .split(/[(),]+/)
    .map(text)
    .filter(Boolean);
  const matches = (portsByName.get(text(shortName)) ?? []).filter((port) => {
    if (!compatible(port)) return false;
    const subdivisions = port.subdivisions.map(key);
    return (
      countries.get(qualifier) === port.countryCode ||
      portCode(qualifier)?.id === port.id ||
      subdivisions.includes(qualifier) ||
      (tokens.length === 2 &&
        countries.get(tokens[1]) === port.countryCode &&
        subdivisions.includes(tokens[0]))
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

function resolveLocation(value) {
  const source = object(value) ? value : {};
  const nested = object(source.location) ? source.location : {};
  const name = first(
    source.name,
    source.city,
    source.locationName,
    source.location_name,
    source.location,
    source.portName,
    source.port_name,
    source.port,
    nested.name,
    nested.city,
    value
  );
  const declared = [
    source.countryCode,
    source.country_code,
    source.country,
    source.countryName,
    source.country_name,
    nested.countryCode,
    nested.country_code,
    nested.country,
    nested.countryName
  ];
  const country = declared.map((entry) => countries.get(key(entry))).find(Boolean) || "";
  const locationCodes = [
    source.unLocationCode,
    source.UNLocationCode,
    source.un_location_code,
    source.unLocode,
    source.un_locode,
    source.locode,
    source.locationCode,
    source.location_code,
    nested.unLocationCode,
    nested.un_location_code,
    nested.locode,
    source.facilityCode,
    source.facility_code,
    source.iataCode,
    source.iata_code,
    source.airportCode,
    source.airport_code
  ];
  const suppliedCode = locationCodes
    .map(portCode)
    .find(Boolean);
  const namedPort = identifyPort(name, country);
  const comparableName = identifyPort(name, "");
  const port = suppliedCode
    ? (!country || suppliedCode.countryCode === country) &&
      (!comparableName || comparableName === suppliedCode)
      ? suppliedCode
      : null
    : namedPort;
  const countryCandidates = new Set([
    port?.countryCode,
    nonPortCountries.get(key(name)),
    ...locationCodes.map((value) => nonPortCountries.get(key(value)))
  ].filter(Boolean));
  const subdivisions=new Set((port?.subdivisions||[]).map(key));
  const qualifiedCountries=new Set(name.split(/[(),]+/).slice(1).filter(part=>!subdivisions.has(key(part)) &&
    (port || key(part).length>2 || key(name).includes(`(${key(part)})`))).map(part=>countries.get(key(part))).filter(Boolean));
  if(qualifiedCountries.size===1)countryCandidates.add([...qualifiedCountries][0]);
  else if(qualifiedCountries.size>1)return{name,countryCode:country,port:null};
  const inferredCountry = countryCandidates.size === 1 ? [...countryCandidates][0] : "";
  return {
    name,
    countryCode: country || inferredCountry,
    port: countryCandidates.size > 1 ? null : port
  };
}

export function resolveTrackingCountry(value) {
  return object(value)
    ? resolveLocation(value).countryCode
    : countries.get(key(value)) || portCode(value)?.countryCode || "";
}

function setFields(source, fields) {
  const changes = Object.entries(fields).filter(
    ([name, value]) => value !== undefined && source[name] !== value
  );
  return changes.length ? { ...source, ...Object.fromEntries(changes) } : source;
}

function normalizeLocation(value, nameKey) {
  const { name, countryCode, port } = resolveLocation(value);
  const source = object(value) ? value : {};
  if (!object(value) && !name) return null;
  return setFields(source, {
    [nameKey]: first(source[nameKey], name) || undefined,
    countryCode: countryCode || undefined,
    reportedCountryCode:
      text(source.countryCode) && countryCode && source.countryCode !== countryCode
        ? (source.reportedCountryCode ?? source.countryCode)
        : undefined,
    unLocationCode:
      port?.id && !first(source.unLocationCode, source.UNLocationCode) ? port.id : undefined
  });
}

export const normalizeTrackingLocation = (value) => normalizeLocation(value, "name");

function placeFields(record, place, country, alternateNames, alternateCountries) {
  if (!object(record)) return record;
  const reported = [record[place], ...alternateNames.map((name) => record[name])].find(
    (value) => object(value) || text(value)
  );
  const countryValue = first(record[country], ...alternateCountries.map((name) => record[name]));
  if (!reported && !countryValue) return record;
  const normalized = normalizeTrackingLocation({
    ...(object(reported) ? reported : { name: reported }),
    countryCode: countryValue || reported?.countryCode
  });
  return setFields(record, {
    [place]: normalized?.name || undefined,
    [country]: normalized?.countryCode || undefined,
    [`reported${country[0].toUpperCase()}${country.slice(1)}`]:
      text(record[country]) && normalized?.countryCode && record[country] !== normalized.countryCode
        ? (record[`reported${country[0].toUpperCase()}${country.slice(1)}`] ?? record[country])
        : undefined,
    [`reported${place[0].toUpperCase()}${place.slice(1)}`]: object(record[place])
      ? record[place]
      : undefined
  });
}

function normalizeRows(rows, mapper) {
  if (!Array.isArray(rows)) return rows;
  const next = rows.map(mapper);
  return next.some((value, index) => value !== rows[index]) ? next : rows;
}

const eventLocation = (event) =>
  placeFields(
    event,
    "location",
    "countryCode",
    ["locationName", "location_name", "eventLocation", "event_location", "city"],
    ["country_code", "country", "countryName", "country_name"]
  );

function summaryEndpoint(summary, side) {
  const value = summary[side] ?? summary[side + "Name"] ?? summary[side + "_name"];
  const explicitCountry = first(
    summary[side + "CountryCode"],
    summary[side + "_country_code"],
    summary[side + "Country"],
    summary[side + "_country"]
  );
  if (!explicitCountry) return value === undefined ? undefined : normalizeTrackingLocation(value);
  const location = object(value) ? value : { name: value };
  if (
    resolveTrackingCountry(location.countryCode) ||
    resolveTrackingCountry(location.country_code) ||
    resolveTrackingCountry(location.country) ||
    resolveTrackingCountry(location.countryName) ||
    resolveTrackingCountry(location.country_name)
  )
    return normalizeTrackingLocation(location);
  return normalizeTrackingLocation({ ...location, country_code: explicitCountry });
}

export function normalizeTrackingSnapshotLocations(snapshot) {
  if (!object(snapshot)) return snapshot;
  const summary = object(snapshot.summary)
    ? setFields(snapshot.summary, {
        origin: summaryEndpoint(snapshot.summary, "origin"),
        destination: summaryEndpoint(snapshot.summary, "destination"),
        latestEvent: eventLocation(snapshot.summary.latestEvent)
      })
    : snapshot.summary;
  return setFields(snapshot, {
    summary,
    route: normalizeRows(snapshot.route, (row) =>
      object(row) ? normalizeLocation(row, "city") : row
    ),
    routingLegs: normalizeRows(snapshot.routingLegs, (row) =>
      placeFields(
        placeFields(
          row,
          "loadPort",
          "loadCountryCode",
          ["load_port", "origin"],
          ["load_country_code", "loadCountry", "load_country", "origin_country_code"]
        ),
        "dischargePort",
        "dischargeCountryCode",
        ["discharge_port", "destination"],
        [
          "discharge_country_code",
          "dischargeCountry",
          "discharge_country",
          "destination_country_code"
        ]
      )
    ),
    containers: normalizeRows(snapshot.containers, (row) =>
      object(row)
        ? setFields(
            placeFields(
              row,
              "currentLocation",
              "currentLocationCountryCode",
              ["current_location", "position"],
              ["current_location_country_code", "country_code", "countryCode"]
            ),
            { milestones: normalizeRows(row.milestones, eventLocation) }
          )
        : row
    ),
    events: normalizeRows(snapshot.events, eventLocation),
    transportStatuses: normalizeRows(snapshot.transportStatuses, eventLocation)
  });
}
