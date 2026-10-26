// @ts-check

export const loadAgentDirectoryPage = () => import("./pages/AgentDirectoryPage.vue");

/** @type {import("../../types/moduleRegistry").RegisteredBusinessModuleDefinition} */
export const moduleDefinition = {
  id: "agents",
  mount: "agents",
  icon: "UserFilled",
  labelKey: "customers.overseaAgentManagement",
  roles: ["ADMIN", "BUSINESS"],
  pages: [
    {
      name: "business-agents",
      path: "",
      view: "agentDirectory"
    }
  ]
};

/** @type {import("../../types/moduleRegistry").BusinessModuleRegistration} */
export const agentRegistration = {
  module: moduleDefinition,
  views: { agentDirectory: loadAgentDirectoryPage }
};
