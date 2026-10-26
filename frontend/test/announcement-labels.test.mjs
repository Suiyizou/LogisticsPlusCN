import assert from "node:assert/strict";
import test from "node:test";
import { createAnnouncementLabels } from "../src/features/admin/announcementLabels.js";
import { ANNOUNCEMENT_COPY } from "../src/features/admin/announcementCopy.js";
const labels = createAnnouncementLabels(() => ANNOUNCEMENT_COPY["en-US"]);
test("announcement audience retains the legacy visibility field", () => {
  assert.equal(labels.announcementAudience({ visibility: "customer" }), "CUSTOMER");
  assert.equal(
    labels.announcementAudience({ audience: "employee", visibility: "CUSTOMER" }),
    "EMPLOYEE"
  );
  assert.equal(labels.announcementAudience(null), "ALL");
});
test("announcement published labels and action state agree regardless of casing", () => {
  assert.equal(labels.announcementStatus("published"), "PUBLISHED");
  assert.equal(labels.announcementStatusLabel("published"), ANNOUNCEMENT_COPY["en-US"].published);
  assert.equal(labels.announcementStatusLabel("disabled"), ANNOUNCEMENT_COPY["en-US"].disabled);
});
test("announcement missing and unknown statuses preserve existing label fallback", () => {
  assert.equal(labels.announcementStatus(undefined), "DRAFT");
  assert.equal(labels.announcementStatusLabel("UNKNOWN"), ANNOUNCEMENT_COPY["en-US"].draft);
});
test("announcement missing and unknown visibility keep the existing all-audiences fallback", () => {
  assert.equal(labels.announcementVisibilityLabel("customer"), ANNOUNCEMENT_COPY["en-US"].customer);
  assert.equal(labels.announcementVisibilityLabel("employee"), ANNOUNCEMENT_COPY["en-US"].employee);
  assert.equal(labels.announcementVisibilityLabel(undefined), ANNOUNCEMENT_COPY["en-US"].all);
  assert.equal(labels.announcementVisibilityLabel("UNKNOWN"), ANNOUNCEMENT_COPY["en-US"].all);
});
test("announcement list and preview labels read the latest locale without reconstruction", () => {
  let copy = ANNOUNCEMENT_COPY["en-US"];
  const current = createAnnouncementLabels(() => copy);
  assert.equal(current.announcementStatusLabel("PUBLISHED"), copy.published);
  copy = ANNOUNCEMENT_COPY["zh-CN"];
  assert.equal(current.announcementStatusLabel("PUBLISHED"), copy.published);
  assert.equal(current.announcementVisibilityLabel("CUSTOMER"), copy.customer);
});
