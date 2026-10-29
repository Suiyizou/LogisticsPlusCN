// Synthetic records mirror the 12 observed carrier shapes, with no client identifiers.
const specs = [
  {
    code: "HMM",
    containers: 5,
    events: 3,
    origin: true,
    destination: true,
    vessel: true,
    eventTime: true,
    extra: "hmm_history"
  },
  {
    code: "SML",
    containers: 15,
    events: 1,
    boxStatus: true,
    eventTime: true,
    declared: 15,
    warning: true
  },
  {
    code: "COSCO",
    containers: 0,
    events: 4,
    origin: true,
    destination: true,
    vessel: true,
    voyage: true,
    legs: 1,
    etd: true,
    eta: true,
    declared: 2,
    warning: true
  },
  { code: "MATSON", containers: 1, events: 1, destination: true, warning: true },
  {
    code: "OOCL",
    containers: 3,
    events: 10,
    origin: true,
    destination: true,
    vessel: true,
    voyage: true,
    declared: 3
  },
  {
    code: "MSC",
    containers: 29,
    events: 29,
    origin: true,
    destination: true,
    eta: true,
    boxStatus: true,
    extra: "msc_events"
  },
  { code: "EVERGREEN", containers: 1, events: 0, origin: true, destination: true, vessel: true },
  { code: "HAPAG_LLOYD", containers: 0, events: 0, noData: true },
  { code: "KMTC", containers: 1, events: 4, vessel: true, eventTime: true },
  { code: "MAERSK", containers: 1, events: 0, vessel: true },
  {
    code: "YML",
    containers: 1,
    events: 0,
    origin: true,
    destination: true,
    vessel: true,
    declared: 1
  },
  {
    code: "ZIM",
    containers: 1,
    events: 12,
    origin: true,
    destination: true,
    vessel: true,
    voyage: true
  }
];
function make(spec, index) {
  const fields = {
    bill_of_lading: spec.noData ? null : `SYNTHETIC${String(index).padStart(8, "0")}`,
    booking: spec.noData ? null : `TESTBOOK${index}`,
    container_count_declared: spec.declared ?? null,
    container_count_extracted: spec.containers,
    origin: spec.origin ? "PORT ALPHA" : null,
    destination: spec.destination ? "PORT BETA" : null,
    vessel: spec.vessel ? "TEST VESSEL" : null,
    voyage: spec.voyage ? "001E" : null,
    etd: spec.etd ? "2026-01-02" : null,
    eta: spec.eta ? "2026-01-12" : null,
    atd: null,
    ata: null,
    milestone_departure: spec.events ? "Departure statement without typed timestamp" : null,
    state: spec.noData ? "UNKNOWN" : "REPORTED",
    latest_event: spec.events ? "Reported shipment event" : null,
    latest_event_at: spec.eventTime ? "2026-01-02" : null
  };
  return {
    schema: "tracking.v1",
    generated_at: "2026-10-30T00:00:00Z",
    carrier: { code: spec.code, name: spec.code },
    query: {
      reference_input: `0000${index}SYNTHETIC`,
      reference_submitted: `0000${index}SYNTHETIC`,
      reference_normalized: `0000${index}SYNTHETIC`,
      reference_type: "BILL_OF_LADING",
      strategy: "SYNTHETIC",
      status: spec.noData ? "NO_BUSINESS_DATA" : "QUERY_COMPLETED"
    },
    shipment: {
      bill_of_lading: fields.bill_of_lading,
      booking: fields.booking,
      container_count: { declared: fields.container_count_declared, extracted: spec.containers },
      route: {
        origin: fields.origin,
        destination: fields.destination,
        vessel: { name: fields.vessel, voyage: fields.voyage, raw: null }
      },
      status: {
        state: fields.state,
        latest_event: fields.latest_event,
        latest_event_at: fields.latest_event_at
      },
      containers: Array.from({ length: spec.containers }, (_, i) => ({
        number: `TEST${String(index * 100 + i).padStart(7, "0")}`,
        type: spec.boxStatus ? "40HC" : null,
        movement: null,
        terms: null,
        position: spec.boxStatus ? "SOURCE LOCATION" : null,
        latest_status: spec.boxStatus ? "SOURCE BOX STATUS" : null,
        status_time: spec.boxStatus ? "2026-01-02" : null,
        raw: null
      })),
      events: Array.from({ length: spec.events }, (_, i) => ({
        sequence: i + 1,
        time: spec.eventTime ? "2026-01-02" : null,
        time_raw: spec.eventTime ? "2026-01-02" : "Source date, precision unknown",
        description: `TEST EVENT ${i + 1}`,
        location: spec.code === "HMM" ? "SOURCE LOCATION" : null,
        raw: null
      })),
      legs: spec.legs
        ? [
            {
              vessel: fields.vessel,
              voyage: fields.voyage,
              service: "TEST SERVICE",
              load_port: fields.origin,
              discharge_port: fields.destination,
              etd: fields.etd,
              eta: fields.eta
            }
          ]
        : [],
      fields,
      fields_extra: spec.extra
        ? {
            [spec.extra]: [
              {
                date: "2026-01-03",
                location: "SOURCE LOCATION",
                status: "STRUCTURED EVENT",
                description: "STRUCTURED EVENT",
                mode: "VESSEL"
              }
            ]
          }
        : {}
    },
    evidence: { text_path: "/not-opened/test.txt", screenshot_path: "/not-opened/test.png" },
    meta: {
      warnings: spec.warning ? ["Synthetic source warning"] : [],
      business_verified: false,
      confidence: "SOURCE_REPORTED"
    }
  };
}
export const syntheticByCarrier = {
  schema: "tracking.v1",
  generated_at: "2026-10-30T00:00:00Z",
  by_carrier: Object.fromEntries(specs.map((spec, index) => [spec.code, [make(spec, index)]]))
};
export const expectedCarrierShapes = specs;
