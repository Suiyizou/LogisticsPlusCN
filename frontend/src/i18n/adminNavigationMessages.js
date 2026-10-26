// English overrides for the existing stable administrator navigation metadata.
/** @type {{groups: Record<string, {label:string, description:string}>, pages: Record<string, {label:string, description:string, title:string, subtitle:string}>}} */
export const adminNavigationEnglish = {
  groups: {
    overview: { label: "Enterprise overview", description: "System activity and audit" },
    tracking: { label: "Tracking platform", description: "Employees, customers and shipments" },
    security: { label: "Security and assets", description: "Device sessions and business files" },
    settings: { label: "System configuration", description: "Announcements and system policies" }
  },
  pages: {
    overview: {
      label: "Dashboard",
      description: "System users and activity trends",
      title: "Enterprise system overview",
      subtitle:
        "Review account scale, system activity and management operations across the enterprise."
    },
    audit: {
      label: "Operation audit",
      description: "Business and management history",
      title: "Operation audit",
      subtitle: "Trace changes by operator, action and affected resource."
    },
    employees: {
      label: "Employee management",
      description: "Internal account roles",
      title: "Employee management",
      subtitle: "Maintain administrator, business operator and overseas agent accounts."
    },
    platform: {
      label: "Customer management",
      description: "Accounts and ownership",
      title: "Customer management",
      subtitle:
        "Review customer accounts, responsible operators, overseas agents and bound shipments."
    },
    handovers: {
      label: "Business handover records",
      description: "Customer ownership changes",
      title: "Business handover records",
      subtitle:
        "Review recorded handovers, recipients, affected customers and reasons. This page is an audit record."
    },
    tickets: {
      label: "Shipment management",
      description: "Global shipments and tracking",
      title: "Shipment management",
      subtitle: "Review enterprise shipments, customers, responsible employees and tracking status."
    },
    devices: {
      label: "Device sessions",
      description: "IP addresses and online devices",
      title: "Devices and sign-ins",
      subtitle:
        "Review signed-in devices, IP addresses and sessions, and revoke access when required."
    },
    files: {
      label: "Shipment documents",
      description: "Business files and upload records",
      title: "Shipment documents",
      subtitle: "Review business files and upload records associated with shipments."
    },
    announcements: {
      label: "Announcements",
      description: "Messages and visibility",
      title: "Announcements",
      subtitle:
        "Edit announcements, upload images and configure visibility using the visual editor."
    },
    system: {
      label: "System management",
      description: "Policies and service status",
      title: "System management",
      subtitle: "Review account policies, service status and maintenance settings."
    }
  }
};
