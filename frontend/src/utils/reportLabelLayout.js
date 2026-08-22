const EPSILON = 1e-6;

const DEFAULT_MIN_BADGE_WIDTH = 34;
const DEFAULT_BADGE_HEIGHT = 24;
const DEFAULT_COLLISION_PADDING = 3;
const DEFAULT_EDGE_PADDING = 2;
const DEFAULT_CANDIDATE_GAP = 4;
const DEFAULT_MAX_SEARCH_NODES = 100_000;

export function layoutReportBadges(requests, bounds, options = {}) {
  const safeBounds = normalizeRect(bounds);
  const sourceItems = Array.isArray(requests) ? requests : [];
  const groups = isGroupedBadgeInput(sourceItems)
    ? sourceItems
    : aggregateRequests(sourceItems
      .map((request) => normalizeRequest(request, safeBounds))
      .filter((request) => request.label));
  const collisionPadding = nonNegativeNumber(options.collisionPadding, DEFAULT_COLLISION_PADDING);
  const edgePadding = nonNegativeNumber(options.edgePadding, DEFAULT_EDGE_PADDING);
  const candidateGap = nonNegativeNumber(options.candidateGap, DEFAULT_CANDIDATE_GAP);
  const maxSearchNodes = Math.max(1, Math.floor(positiveNumber(options.maxSearchNodes, DEFAULT_MAX_SEARCH_NODES)));
  const measureBadge = typeof options.measureBadge === "function"
    ? options.measureBadge
    : typeof options.measureText === "function"
      ? (text, group) => normalizeMeasuredBadge(options.measureText(text, group), options.badgeHeight)
      : defaultMeasureBadge;

  const groupsByLayer = new Map();
  for (const group of groups) {
    const text = `${group.label} ×${group.count}`;
    const measured = normalizeMeasuredBadge(measureBadge(text, {
      layerKey: group.layerKey,
      label: group.label,
      count: group.count,
      requests: group.requests.map((request) => request.source)
    }), options.badgeHeight);
    const badgeWidth = Math.max(
      positiveNumber(options.minBadgeWidth, DEFAULT_MIN_BADGE_WIDTH),
      positiveNumber(measured.width, defaultMeasureBadge(text).width)
    );
    const badgeHeight = Math.max(
      positiveNumber(options.minBadgeHeight, DEFAULT_BADGE_HEIGHT),
      positiveNumber(measured.height, DEFAULT_BADGE_HEIGHT)
    );
    const prepared = {
      ...group,
      text,
      badgeWidth,
      badgeHeight,
      candidates: badgeCandidates(group.representative, badgeWidth, badgeHeight, safeBounds, {
        edgePadding,
        candidateGap,
        collisionPadding
      })
    };
    if (!groupsByLayer.has(group.layerKey)) groupsByLayer.set(group.layerKey, []);
    groupsByLayer.get(group.layerKey).push(prepared);
  }

  const badges = [];
  const hidden = [];
  [...groupsByLayer.entries()]
    .sort((a, b) => compareText(a[0], b[0]))
    .forEach(([layerKey, layerGroups]) => {
      const assignments = chooseBadgeAssignments(layerGroups, collisionPadding, maxSearchNodes);
      const assignmentsByGroup = new Map(assignments.map((assignment) => [assignment.group.key, assignment.candidate]));
      [...layerGroups]
        .sort(compareGroups)
        .forEach((group) => {
          const candidate = assignmentsByGroup.get(group.key);
          if (!candidate) {
            group.requests.forEach((request) => hidden.push(hiddenRequest(request, group, "no-collision-free-position")));
            return;
          }
          const shifted = pointDistance(group.representative.anchor, candidate.center) > EPSILON;
          badges.push({
            key: group.key,
            layerKey,
            label: group.label,
            text: group.text,
            count: group.count,
            representativeId: group.representative.id,
            requestIds: group.requests.map((request) => request.id).sort(compareText),
            anchor: { ...group.representative.anchor },
            rect: { ...candidate.rect },
            shifted,
            leader: shifted ? badgeLeader(group.representative.anchor, candidate.rect) : null,
            candidateIndex: candidate.index
          });
          group.requests
            .filter((request) => request !== group.representative)
            .forEach((request) => hidden.push(hiddenRequest(request, group, "aggregated-into-representative")));
        });
    });

  badges.sort((a, b) => compareText(a.layerKey, b.layerKey) || compareText(a.label, b.label));
  hidden.sort((a, b) => (
    compareText(a.layerKey, b.layerKey)
    || compareText(a.label, b.label)
    || compareText(a.requestId, b.requestId)
    || compareText(a.reason, b.reason)
  ));
  return {
    badges,
    hidden,
    kindCount: groups.length,
    representedKindCount: badges.length,
    allKindsRepresented: badges.length === groups.length,
    hiddenDuplicateCount: hidden.filter((item) => item.reason === "aggregated-into-representative").length,
    unplacedKindCount: groups.length - badges.length
  };
}

export function groupReportBadges(items, selectors = {}) {
  const requests = (Array.isArray(items) ? items : []).map((item, index) => ({
    id: selectorValue(selectors.id, item, index, item?.id ?? item?.key ?? item?.unitKey ?? `report-item-${index}`),
    layerKey: selectorValue(
      selectors.layerKey ?? selectors.layer,
      item,
      index,
      item?.layerKey ?? item?.layer ?? item?.z ?? item?.zCm ?? "default"
    ),
    label: selectorValue(selectors.label, item, index, item?.label ?? item?.text ?? ""),
    quantity: selectorValue(
      selectors.quantity,
      item,
      index,
      item?.quantity ?? item?.groupQuantity ?? item?.actualCount ?? item?.count ?? 1
    ),
    anchor: selectorValue(selectors.anchor, item, index, item?.anchor),
    itemRect: selectorValue(
      selectors.bounds ?? selectors.itemRect,
      item,
      index,
      item?.itemRect ?? item?.cargoRect ?? item?.rect
    )
  }));
  return aggregateRequests(requests
    .map((request) => normalizeRequest(request, { x: 0, y: 0, width: 0, height: 0 }))
    .filter((request) => request.label));
}

export function reportBadgeRectsOverlap(a, b, padding = 0) {
  const first = normalizeRect(a);
  const second = normalizeRect(b);
  const gap = nonNegativeNumber(padding, 0);
  return first.x < second.x + second.width + gap - EPSILON
    && first.x + first.width + gap > second.x + EPSILON
    && first.y < second.y + second.height + gap - EPSILON
    && first.y + first.height + gap > second.y + EPSILON;
}

export function reportBadgeWithinBounds(rect, bounds, padding = 0) {
  const item = normalizeRect(rect);
  const frame = normalizeRect(bounds);
  const gap = nonNegativeNumber(padding, 0);
  return item.x >= frame.x + gap - EPSILON
    && item.y >= frame.y + gap - EPSILON
    && item.x + item.width <= frame.x + frame.width - gap + EPSILON
    && item.y + item.height <= frame.y + frame.height - gap + EPSILON;
}

function normalizeRequest(request, bounds) {
  const source = request || {};
  const layerKey = String(source.layerKey ?? source.layer ?? source.z ?? "default");
  const label = String(source.label ?? source.text ?? "").trim();
  const itemRect = normalizeOptionalRect(source.itemRect || source.cargoRect || source.rect);
  const anchor = normalizePoint(
    source.anchor,
    source.anchorX ?? source.x,
    source.anchorY ?? source.y,
    itemRect || bounds
  );
  const id = String(source.id ?? source.key ?? [
    layerKey,
    label,
    roundKey(anchor.x),
    roundKey(anchor.y),
    roundKey(itemRect?.x),
    roundKey(itemRect?.y),
    roundKey(itemRect?.width),
    roundKey(itemRect?.height)
  ].join("/"));
  return {
    source,
    id,
    layerKey,
    label,
    quantity: normalizedQuantity(source.quantity ?? source.groupQuantity ?? source.actualCount ?? source.count),
    anchor,
    itemRect,
    area: itemRect ? itemRect.width * itemRect.height : 0
  };
}

function aggregateRequests(requests) {
  const grouped = new Map();
  [...requests]
    .sort(compareRequests)
    .forEach((request) => {
      const key = JSON.stringify([request.layerKey, request.label]);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          layerKey: request.layerKey,
          label: request.label,
          count: 0,
          requests: []
        });
      }
      const group = grouped.get(key);
      group.count += request.quantity;
      group.requests.push(request);
    });
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      requests: [...group.requests].sort(compareRequests),
      representative: [...group.requests].sort(compareRepresentativeRequests)[0]
    }))
    .sort(compareGroups);
}

function isGroupedBadgeInput(items) {
  return items.length > 0 && items.every((item) => (
    item
    && typeof item.label === "string"
    && Array.isArray(item.requests)
    && item.representative
  ));
}

function badgeCandidates(request, width, height, bounds, options) {
  const gap = options.candidateGap;
  const anchor = request.anchor;
  const item = request.itemRect;
  const centers = [];
  const center = { x: anchor.x, y: anchor.y };
  if (item) {
    const fitsInside = width <= item.width - gap * 2 + EPSILON && height <= item.height - gap * 2 + EPSILON;
    const outside = [
      { x: item.x + item.width / 2, y: item.y - gap - height / 2 },
      { x: item.x + item.width / 2, y: item.y + item.height + gap + height / 2 },
      { x: item.x + item.width + gap + width / 2, y: item.y + item.height / 2 },
      { x: item.x - gap - width / 2, y: item.y + item.height / 2 },
      { x: item.x - gap - width / 2, y: item.y - gap - height / 2 },
      { x: item.x + item.width + gap + width / 2, y: item.y - gap - height / 2 },
      { x: item.x - gap - width / 2, y: item.y + item.height + gap + height / 2 },
      { x: item.x + item.width + gap + width / 2, y: item.y + item.height + gap + height / 2 }
    ];
    centers.push(...(fitsInside ? [center, ...outside] : [...outside, center]));
  } else {
    const dx = width / 2 + gap;
    const dy = height / 2 + gap;
    centers.push(
      center,
      { x: anchor.x, y: anchor.y - dy },
      { x: anchor.x, y: anchor.y + dy },
      { x: anchor.x + dx, y: anchor.y },
      { x: anchor.x - dx, y: anchor.y },
      { x: anchor.x - dx, y: anchor.y - dy },
      { x: anchor.x + dx, y: anchor.y - dy },
      { x: anchor.x - dx, y: anchor.y + dy },
      { x: anchor.x + dx, y: anchor.y + dy }
    );
  }

  centers.push(...globalBadgeCenters(width, height, bounds, options, anchor));

  const seen = new Set();
  return centers
    .map((candidateCenter, index) => ({
      index,
      center: candidateCenter,
      rect: {
        x: candidateCenter.x - width / 2,
        y: candidateCenter.y - height / 2,
        width,
        height
      }
    }))
    .filter((candidate) => {
      const key = [candidate.rect.x, candidate.rect.y, width, height].map(roundKey).join("/");
      if (seen.has(key)) return false;
      seen.add(key);
      return reportBadgeWithinBounds(candidate.rect, bounds, options.edgePadding);
    });
}

function globalBadgeCenters(width, height, bounds, options, anchor) {
  const padding = options.edgePadding;
  const gap = Math.max(options.candidateGap, options.collisionPadding || 0);
  const minX = bounds.x + padding + width / 2;
  const maxX = bounds.x + bounds.width - padding - width / 2;
  const minY = bounds.y + padding + height / 2;
  const maxY = bounds.y + bounds.height - padding - height / 2;
  if (minX > maxX + EPSILON || minY > maxY + EPSILON) return [];

  const xs = badgeGridAxis(minX, maxX, width + gap);
  const ys = badgeGridAxis(minY, maxY, height + gap);
  return xs.flatMap((x) => ys.map((y) => ({ x, y })))
    .sort((a, b) => (
      pointDistance(anchor, a) - pointDistance(anchor, b)
      || a.y - b.y
      || a.x - b.x
    ))
    .slice(0, 96);
}

function badgeGridAxis(min, max, step) {
  const values = [];
  for (let value = min; value <= max + EPSILON; value += Math.max(1, step)) values.push(Math.min(value, max));
  if (!values.length || Math.abs(values[values.length - 1] - max) > EPSILON) values.push(max);
  return values;
}

function chooseBadgeAssignments(groups, collisionPadding, maxSearchNodes) {
  const ordered = [...groups].sort((a, b) => (
    a.candidates.length - b.candidates.length
    || compareGroups(a, b)
  ));
  let nodes = 0;
  let best = [];
  const selected = [];

  function visit(index) {
    if (nodes >= maxSearchNodes || best.length === ordered.length) return;
    nodes += 1;
    if (selected.length + ordered.length - index < best.length) return;
    if (index >= ordered.length) {
      if (selected.length > best.length) best = selected.map((entry) => ({ ...entry }));
      return;
    }

    const group = ordered[index];
    for (const candidate of group.candidates) {
      if (selected.some((entry) => reportBadgeRectsOverlap(entry.candidate.rect, candidate.rect, collisionPadding))) continue;
      selected.push({ group, candidate });
      visit(index + 1);
      selected.pop();
      if (best.length === ordered.length || nodes >= maxSearchNodes) return;
    }
    visit(index + 1);
  }

  visit(0);
  return best;
}

function badgeLeader(anchor, rect) {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const dx = center.x - anchor.x;
  const dy = center.y - anchor.y;
  let to;
  if (Math.abs(dx) * rect.height >= Math.abs(dy) * rect.width) {
    to = {
      x: dx >= 0 ? rect.x : rect.x + rect.width,
      y: clamp(anchor.y, rect.y, rect.y + rect.height)
    };
  } else {
    to = {
      x: clamp(anchor.x, rect.x, rect.x + rect.width),
      y: dy >= 0 ? rect.y : rect.y + rect.height
    };
  }
  return { from: { ...anchor }, to };
}

function hiddenRequest(request, group, reason) {
  return {
    requestId: request.id,
    layerKey: group.layerKey,
    label: group.label,
    quantity: request.quantity,
    representativeId: group.representative.id,
    reason
  };
}

function normalizeRect(rect) {
  return {
    x: finiteNumber(rect?.x, 0),
    y: finiteNumber(rect?.y, 0),
    width: nonNegativeNumber(rect?.width, 0),
    height: nonNegativeNumber(rect?.height, 0)
  };
}

function normalizeOptionalRect(rect) {
  if (!rect) return null;
  const normalized = normalizeRect(rect);
  return normalized.width > EPSILON && normalized.height > EPSILON ? normalized : null;
}

function normalizePoint(point, fallbackX, fallbackY, fallbackRect) {
  const rect = normalizeRect(fallbackRect);
  return {
    x: finiteNumber(point?.x ?? fallbackX, rect.x + rect.width / 2),
    y: finiteNumber(point?.y ?? fallbackY, rect.y + rect.height / 2)
  };
}

function normalizedQuantity(value) {
  const quantity = Math.floor(finiteNumber(value, 1));
  return Math.max(1, quantity);
}

function defaultMeasureBadge(text) {
  return {
    width: Math.max(DEFAULT_MIN_BADGE_WIDTH, 16 + Array.from(String(text || "")).length * 8),
    height: DEFAULT_BADGE_HEIGHT
  };
}

function normalizeMeasuredBadge(measured, fallbackHeight = DEFAULT_BADGE_HEIGHT) {
  if (typeof measured === "number") {
    return { width: measured, height: positiveNumber(fallbackHeight, DEFAULT_BADGE_HEIGHT) };
  }
  return {
    width: positiveNumber(measured?.width, DEFAULT_MIN_BADGE_WIDTH),
    height: positiveNumber(measured?.height, positiveNumber(fallbackHeight, DEFAULT_BADGE_HEIGHT))
  };
}

function selectorValue(selector, item, index, fallback) {
  if (typeof selector === "function") return selector(item, index);
  if (typeof selector === "string") return item?.[selector];
  return selector === undefined ? fallback : selector;
}

function compareRequests(a, b) {
  return compareText(a.layerKey, b.layerKey)
    || compareText(a.label, b.label)
    || compareText(a.id, b.id)
    || a.anchor.x - b.anchor.x
    || a.anchor.y - b.anchor.y;
}

function compareRepresentativeRequests(a, b) {
  return b.area - a.area
    || compareText(a.id, b.id)
    || a.anchor.x - b.anchor.x
    || a.anchor.y - b.anchor.y;
}

function compareGroups(a, b) {
  return compareText(a.layerKey, b.layerKey) || compareText(a.label, b.label);
}

function compareText(a, b) {
  return String(a).localeCompare(String(b), "en");
}

function pointDistance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number >= 0 ? number : fallback;
}

function roundKey(value) {
  return Math.round(finiteNumber(value, 0) * 1000) / 1000;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
