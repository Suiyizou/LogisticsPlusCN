// @ts-check
/** @type {Record<string, import("../types/adminShell").AdminConsoleCopy>} */
export const adminConsoleMessages = {
  "zh-CN": {
    switchWorkbench: "切换工作台",
    loginHeading: "企业后台管理系统",
    loginDescription: "管理员登录后可管理员工账号、在线设备、系统运行与审计记录。",
    loginPoints: ["员工账号管理", "设备登录限制", "运行监控面板"],
    loginTitle: "总管理员登录",
    loginEntry: "后台入口",
    username: "账号",
    password: "密码",
    loggingIn: "登录中...",
    login: "登录后台",
    adminTitle: "后台管理",
    currentAdmin: "当前管理员",
    refreshing: "刷新中...",
    refresh: "刷新数据",
    logout: "退出登录",
    navigationLabel: "管理员导航",
    roleLabels: {
      ADMIN: "管理员",
      BUSINESS: "业务员",
      OVERSEA_AGENT: "海外代理",
      CUSTOMER: "客户"
    },
    accessDeniedLabel: "无权访问管理员后台",
    accessDeniedDescription: "请使用管理员账号登录，或返回其他工作台。",
    refreshed: "后台数据已刷新",
    partialFailure: "部分后台数据未能刷新，请重试。",
    loginSuccess: "管理员登录成功",
    notAdmin: "该账号不是管理员，无法登录后台。"
  },
  "en-US": {
    switchWorkbench: "Switch workbench",
    loginHeading: "Enterprise administration",
    loginDescription:
      "Administrators manage employee accounts, online devices, system operations, and audit records.",
    loginPoints: ["Employee accounts", "Device access limits", "System monitoring"],
    loginTitle: "Administrator sign-in",
    loginEntry: "Admin console",
    username: "Account",
    password: "Password",
    loggingIn: "Signing in...",
    login: "Sign in",
    adminTitle: "Administration",
    currentAdmin: "Current administrator",
    refreshing: "Refreshing...",
    refresh: "Refresh data",
    logout: "Sign out",
    navigationLabel: "Administrator navigation",
    roleLabels: {
      ADMIN: "Administrator",
      BUSINESS: "Business",
      OVERSEA_AGENT: "Overseas agent",
      CUSTOMER: "Customer"
    },
    accessDeniedLabel: "Administrator access required",
    accessDeniedDescription:
      "Sign in with an administrator account or return to another workbench.",
    refreshed: "Admin data refreshed",
    partialFailure: "Some admin data could not be refreshed. Please try again.",
    loginSuccess: "Administrator signed in",
    notAdmin: "This account is not an administrator and cannot access the admin console."
  }
};
