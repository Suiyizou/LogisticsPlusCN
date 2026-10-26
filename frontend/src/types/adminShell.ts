export interface AdminLoginForm {
  username: string;
  password: string;
}
export interface AdminNavItem {
  key: string;
  no: string;
  label: string;
  description: string;
}
export interface AdminNavGroup {
  key: string;
  no: string;
  label: string;
  description: string;
  children: AdminNavItem[];
}
export interface AdminPageMeta {
  title: string;
  subtitle: string;
  eyebrow: string;
}
export interface AdminConsoleCopy {
  switchWorkbench: string;
  loginHeading: string;
  loginDescription: string;
  loginPoints: string[];
  loginTitle: string;
  loginEntry: string;
  username: string;
  password: string;
  loggingIn: string;
  login: string;
  adminTitle: string;
  currentAdmin: string;
  refreshing: string;
  refresh: string;
  logout: string;
  navigationLabel: string;
  roleLabels: Record<string, string>;
  accessDeniedLabel: string;
  accessDeniedDescription: string;
  refreshed: string;
  partialFailure: string;
  loginSuccess: string;
  notAdmin: string;
}
