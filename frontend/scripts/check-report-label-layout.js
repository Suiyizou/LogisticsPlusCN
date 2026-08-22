import assert from "node:assert/strict";
import {
  groupReportBadges,
  layoutReportBadges,
  reportBadgeRectsOverlap,
  reportBadgeWithinBounds
} from "../src/utils/reportLabelLayout.js";

const bounds = { x: 0, y: 0, width: 260, height: 150 };
const selectors = {
  id: (item) => item.id,
  layerKey: (item) => item.layerKey,
  label: (item) => item.label,
  quantity: (item) => item.quantity ?? item.groupQuantity ?? 1,
  anchor: (item) => item.anchor,
  bounds: (item) => item.itemRect
};

function assertCollisionFree(layout, frame, padding = 3, edgePadding = 2) {
  for (const badge of layout.badges) {
    assert.equal(
      reportBadgeWithinBounds(badge.rect, frame, edgePadding),
      true,
      `${badge.text} must stay inside its plot bounds`
    );
  }
  for (let left = 0; left < layout.badges.length; left += 1) {
    for (let right = left + 1; right < layout.badges.length; right += 1) {
      const a = layout.badges[left];
      const b = layout.badges[right];
      if (a.layerKey !== b.layerKey) continue;
      assert.equal(
        reportBadgeRectsOverlap(a.rect, b.rect, padding),
        false,
        `${a.text} and ${b.text} must not collide within layer ${a.layerKey}`
      );
    }
  }
}

const denseSmallCargo = Array.from({ length: 48 }, (_, index) => {
  const col = index % 12;
  const row = Math.floor(index / 12);
  const itemRect = { x: 70 + col * 12, y: 45 + row * 12, width: 10, height: 8 };
  return {
    id: `piece-${String(index).padStart(2, "0")}`,
    layerKey: "z-0",
    label: "#4B",
    quantity: 1,
    itemRect,
    anchor: { x: itemRect.x + itemRect.width / 2, y: itemRect.y + itemRect.height / 2 }
  };
});
const denseSnapshot = JSON.stringify(denseSmallCargo);
const denseGroups = groupReportBadges(denseSmallCargo, selectors);
const denseLayout = layoutReportBadges(denseGroups, bounds);

assert.equal(denseGroups.length, 1, "same-label items in one layer must aggregate into one group");
assert.equal(denseGroups[0].count, 48, "the aggregate must retain the true physical piece count");
assert.equal(denseLayout.badges.length, 1, "a dense repeated label needs only one representative badge");
assert.equal(denseLayout.badges[0].label, "#4B");
assert.equal(denseLayout.badges[0].text, "#4B ×48");
assert.equal(denseLayout.badges[0].representativeId, "piece-00", "equal-area representatives must use a stable id tie-breaker");
assert.equal(denseLayout.hiddenDuplicateCount, 47, "duplicate item badges may be hidden after aggregation");
assert.ok(denseLayout.hidden.every((item) => item.reason === "aggregated-into-representative"));
assert.equal(denseLayout.allKindsRepresented, true, "the dense layer must retain at least one badge for #4B");
assert.equal(JSON.stringify(denseSmallCargo), denseSnapshot, "badge grouping and layout must not mutate source items");
assertCollisionFree(denseLayout, bounds);

const reversedDenseLayout = layoutReportBadges(
  groupReportBadges([...denseSmallCargo].reverse(), selectors),
  bounds
);
assert.deepEqual(reversedDenseLayout, denseLayout, "layout must be deterministic even when equivalent input order changes");

const groupedQuantityItems = [
  {
    id: "quantity-a",
    layerKey: "z-20",
    label: "#7A",
    quantity: 3,
    itemRect: { x: 80, y: 60, width: 24, height: 20 },
    anchor: { x: 92, y: 70 }
  },
  {
    id: "quantity-b",
    layerKey: "z-20",
    label: "#7A",
    groupQuantity: 5,
    itemRect: { x: 120, y: 60, width: 36, height: 28 },
    anchor: { x: 138, y: 74 }
  }
];
const groupedQuantityLayout = layoutReportBadges(groupReportBadges(groupedQuantityItems, selectors), bounds);
assert.equal(groupedQuantityLayout.badges[0].count, 8);
assert.equal(groupedQuantityLayout.badges[0].text, "#7A ×8");
assert.equal(groupedQuantityLayout.badges[0].representativeId, "quantity-b", "the largest projected item must represent its label");

const sharedRect = { x: 70, y: 40, width: 40, height: 30 };
const congestedKinds = ["#1A", "#4A", "#4B", "#6C"].map((label, index) => ({
  id: `kind-${index}`,
  layerKey: "z-0",
  label,
  quantity: 1,
  itemRect: sharedRect,
  anchor: { x: 90, y: 55 }
}));
const congestedLayout = layoutReportBadges(groupReportBadges(congestedKinds, selectors), { x: 0, y: 0, width: 200, height: 120 }, {
  measureText: (text) => ({ width: 16 + Array.from(text).length * 8, height: 24 })
});
assert.equal(congestedLayout.kindCount, 4);
assert.equal(congestedLayout.representedKindCount, 4, "every distinct label must retain a representative when candidates fit");
assert.equal(congestedLayout.allKindsRepresented, true);
assert.deepEqual(congestedLayout.badges.map((badge) => badge.label), ["#1A", "#4A", "#4B", "#6C"]);
assert.ok(congestedLayout.badges.every((badge) => badge.shifted), "badges too large for a cargo cell must move outside it");
assert.ok(congestedLayout.badges.every((badge) => badge.leader?.from && badge.leader?.to), "every shifted badge must expose leader-line geometry");
assertCollisionFree(congestedLayout, { x: 0, y: 0, width: 200, height: 120 });

const manyCongestedKinds = Array.from({ length: 12 }, (_, index) => ({
  id: `global-kind-${index}`,
  layerKey: "z-0",
  label: `#${index + 1}A`,
  quantity: 1,
  itemRect: { x: 224, y: 32, width: 28, height: 18 },
  anchor: { x: 238, y: 41 }
}));
const globalCandidateBounds = { x: 0, y: 0, width: 498, height: 97 };
const globalCandidateLayout = layoutReportBadges(
  groupReportBadges(manyCongestedKinds, selectors),
  globalCandidateBounds,
  { measureText: (text) => ({ width: 18 + Array.from(text).length * 7, height: 20 }) }
);
assert.equal(globalCandidateLayout.kindCount, 12);
assert.equal(globalCandidateLayout.allKindsRepresented, true, "global grid candidates must preserve every distinct dense label when the plot has enough capacity");
assertCollisionFree(globalCandidateLayout, globalCandidateBounds);

const twoLayerItems = ["z-0", "z-35"].flatMap((layerKey) => Array.from({ length: 6 }, (_, index) => ({
  id: `${layerKey}-${index}`,
  layerKey,
  label: "#4B",
  quantity: 1,
  itemRect: { x: 80 + index * 8, y: 55, width: 8, height: 8 },
  anchor: { x: 84 + index * 8, y: 59 }
})));
const twoLayerLayout = layoutReportBadges(groupReportBadges(twoLayerItems, selectors), bounds);
assert.equal(twoLayerLayout.badges.length, 2, "the same label must receive one representative in each layer");
assert.deepEqual(twoLayerLayout.badges.map((badge) => badge.count), [6, 6]);
assert.deepEqual(twoLayerLayout.badges[0].rect, twoLayerLayout.badges[1].rect, "collision occupancy must reset between layers");
assertCollisionFree(twoLayerLayout, bounds);

console.log("Report label aggregation, collision avoidance, boundary, leader-line, per-layer, and determinism regression passed.");
