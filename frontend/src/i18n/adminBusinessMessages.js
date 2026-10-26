// @ts-check
export const PLATFORM_ACTION_COPY = {
  "zh-CN": {
    customerTitle: "\u5ba2\u6237\u8d26\u53f7\u4e0e\u8d1f\u8d23\u5173\u7cfb",
    delete: "\u5220\u9664",
    cancel: "\u53d6\u6d88",
    confirm:
      "\u786e\u8ba4\u5220\u9664\u5ba2\u6237\u300c{name}\u300d\u5417\uff1f\u5220\u9664\u540e\u8be5\u5ba2\u6237\u5c06\u65e0\u6cd5\u767b\u5f55\uff0c\u5386\u53f2\u7968\u5355\u6570\u636e\u4f1a\u4fdd\u7559\u3002",
    success: "\u5ba2\u6237\u5df2\u5220\u9664"
  },
  "en-US": {
    customerTitle: "Customer accounts and ownership",
    delete: "Delete",
    cancel: "Cancel",
    confirm:
      "Delete customer “{name}”? The customer will no longer be able to sign in; historical shipment data is retained.",
    success: "Customer deleted"
  }
};

export const TICKET_COPY = {
  "zh-CN": {
    title: "\u5168\u5c40\u7968\u5355\u7ba1\u7406",
    total: "\u5171 {count} \u6761\u7968\u5355",
    openFullManagement: "\u8fdb\u5165\u5b8c\u6574\u7968\u5355\u7ba1\u7406",
    refresh: "\u5237\u65b0",
    referenceNo: "\u53c2\u8003\u53f7",
    carrier: "\u8239\u516c\u53f8",
    customer: "\u5ba2\u6237\u53f7 / \u5ba2\u6237\u540d",
    owner: "\u8d1f\u8d23\u5458\u5de5",
    boundUsers: "\u7ed1\u5b9a\u7528\u6237",
    status: "\u8ddf\u8e2a\u72b6\u6001",
    updatedAt: "\u66f4\u65b0\u65f6\u95f4",
    actions: "\u64cd\u4f5c",
    manage: "\u7ba1\u7406",
    empty: "\u6682\u65e0\u7968\u5355",
    pending: "\u5f85\u8ddf\u8e2a",
    referenceTypes: {
      BOOKING: "\u8ba2\u8231\u53f7",
      BILLOFLADING: "\u63d0\u5355\u53f7",
      CONTAINER: "\u96c6\u88c5\u7bb1\u53f7"
    }
  },
  "en-US": {
    title: "Global shipment management",
    total: "{count} shipments",
    openFullManagement: "Open full shipment management",
    refresh: "Refresh",
    referenceNo: "Reference",
    carrier: "Carrier",
    customer: "Client no. / name",
    owner: "Responsible employee",
    boundUsers: "Bound users",
    status: "Tracking status",
    updatedAt: "Updated",
    actions: "Actions",
    manage: "Manage",
    empty: "No shipments",
    pending: "Pending",
    referenceTypes: {
      BOOKING: "Booking no.",
      BILLOFLADING: "Bill of lading",
      CONTAINER: "Container no."
    }
  }
};

export const HANDOVER_COPY = {
  "zh-CN": {
    title: "\u4e1a\u52a1\u4ea4\u63a5\u8bb0\u5f55",
    summary: "\u5171 {count} \u6761\u8bb0\u5f55",
    statusFilter: "\u4ea4\u63a5\u72b6\u6001",
    all: "\u5168\u90e8",
    pending: "\u5386\u53f2\u5f85\u5904\u7406",
    approved: "\u5df2\u5b8c\u6210",
    rejected: "\u5386\u53f2\u5df2\u9a73\u56de",
    refresh: "\u5237\u65b0",
    request: "\u8bb0\u5f55\u7f16\u53f7",
    route: "\u4ea4\u63a5\u65b9\u5411",
    source: "\u79fb\u4ea4\u65b9",
    target: "\u63a5\u6536\u65b9",
    scope: "\u5ba2\u6237\u8303\u56f4",
    customerUnit: "{count} \u4e2a\u5ba2\u6237",
    reason: "\u4ea4\u63a5\u539f\u56e0",
    requestedBy: "\u4ea4\u63a5\u4eba / \u65f6\u95f4",
    review: "\u5b8c\u6210\u8bb0\u5f55",
    empty: "\u6682\u65e0\u4ea4\u63a5\u8bb0\u5f55",
    pendingEffect:
      "{customers} \u4e2a\u5ba2\u6237 \u00b7 {shipments} \u5f20\u5173\u8054\u7968\u5355",
    noCompletion: "尚无完成记录",
    reviewerMissing: "审核人未记录",
    notReviewed: "\u4e1a\u52a1\u5458\u76f4\u63a5\u4ea4\u63a5",
    customersMore: "\u53e6\u6709 {count} \u4e2a\u5ba2\u6237"
  },
  "en-US": {
    title: "Business handover records",
    summary: "{count} records",
    statusFilter: "Handover status",
    all: "All",
    pending: "Legacy pending",
    approved: "Completed",
    rejected: "Legacy rejected",
    refresh: "Refresh",
    request: "Record",
    route: "Handover route",
    source: "From",
    target: "To",
    scope: "Customer scope",
    customerUnit: "{count} customers",
    reason: "Reason",
    requestedBy: "Transferred by / time",
    review: "Completion record",
    empty: "No handover records",
    pendingEffect: "{customers} customers \u00b7 {shipments} related shipments",
    noCompletion: "No completion record",
    reviewerMissing: "Reviewer not recorded",
    notReviewed: "Completed directly by business operator",
    customersMore: "{count} more customers"
  }
};
