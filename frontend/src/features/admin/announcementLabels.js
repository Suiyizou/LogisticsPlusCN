// @ts-check
/** Share current-locale labels between the announcement table and preview.
 * @param {() => import("../../types/adminWorkflows").AnnouncementCopy} copy */
export function createAnnouncementLabels(copy) {
  /** @param {{ audience?: string; visibility?: string } | null} record */
  function announcementAudience(record) {
    return String(record?.audience || record?.visibility || "ALL").toUpperCase();
  }
  /** @param {string | undefined} status */
  function announcementStatus(status) {
    return String(status || "DRAFT").toUpperCase();
  }
  /** @param {string | undefined} status */
  function announcementStatusLabel(status) {
    const labels = /** @type {Record<string, string>} */ ({
      DRAFT: copy().draft,
      PUBLISHED: copy().published,
      DISABLED: copy().disabled
    });
    return labels[announcementStatus(status)] || copy().draft;
  }
  /** @param {string | undefined} audience */
  function announcementVisibilityLabel(audience) {
    const labels = /** @type {Record<string, string>} */ ({
      CUSTOMER: copy().customer,
      EMPLOYEE: copy().employee,
      ALL: copy().all
    });
    return labels[String(audience || "ALL").toUpperCase()] || copy().all;
  }
  return {
    announcementAudience,
    announcementStatus,
    announcementStatusLabel,
    announcementVisibilityLabel
  };
}
