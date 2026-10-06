# 回归测试覆盖矩阵（T03）

目标：保证重构前后可对比，覆盖成功、失败、越权和事务回滚；不把测试退化为实现细节。
本表记录“关键场景 → 现有测试”的对应关系，重构时按此表回归。

## 1. 基线

| 套件       | 命令                      | 基线数量                                         |
| ---------- | ------------------------- | ------------------------------------------------ |
| 后端 JUnit | `npm run verify:backend`  | 25 个测试类、200 项（本批新增后 26 类 / 207 项） |
| Node 追踪  | `npm run verify:tracking` | 8 个文件、103 项                                 |
| 装箱       | `npm run verify:packing`  | 4 组回归脚本                                     |
| 前端       | `npm run verify:frontend` | i18n 扫描 + Vite 生产构建                        |

任何一批重构都必须保持以上数量不回退，并让新增/变更模块的用例继续通过。

## 2. 场景覆盖

### 2.1 登录与会话

| 场景                                     | 用例                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 改密后保留当前设备、吊销其他设备         | `auth/AuthServicePasswordChangeTest`                                                          |
| 客户登录、客户码校验、登录失败           | `customer/CustomerAccessFlowTest#customerCodeLoginAndExplicitShipmentBindingEnforceOwnership` |
| 内部 token 鉴权、公开路径豁免、CORS 预检 | `auth/HttpAuthorizationRegressionTest`（本批新增）                                            |

### 2.2 角色与权限

| 场景                                              | 用例                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN 可进后台、BUSINESS 被拒、OVERSEA_AGENT 被拒 | `auth/HttpAuthorizationRegressionTest`                                                                                                 |
| 内部/客户通道 token 不可混用                      | `auth/HttpAuthorizationRegressionTest`                                                                                                 |
| 客户目录三种角色的数据范围                        | `customer/CustomerDirectoryServiceTest`、`customer/CustomerAccessFlowTest`                                                             |
| 文件多角色可见性与越权下载                        | `shipment/ShipmentFileServiceTest#enforcesMultiRoleVisibilityFromShipmentBindings`、`#enforcesParticipantVisibilityAndSoftDeleteRules` |
| 留言必须拥有票单权限                              | `shipment/ShipmentFileCommentServiceTest#rejectsBlankMessagesAndUsersWithoutShipmentAccess`                                            |

### 2.3 客户操作与交接

| 场景                               | 用例                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 客户创建、批量导入、字段与密码规则 | `customer/CustomerAccessFlowTest#batchCustomerImportPreservesCompleteFieldsAndEnforcesPasswordRules` |
| 归档/删除与身份复用                | `CustomerAccessFlowTest#deletingCustomerIsDistinctFromDisablingAndReleasesIdentityForReuse`          |
| 直接交接完成并保留票单历史         | `CustomerAccessFlowTest#customerHandoverCompletesDirectlyAndRetainsShipmentHistory`                  |
| 交接不可重复审核（失败路径）       | `CustomerAccessFlowTest#completedDirectHandoverCannotBeReviewedAgain`                                |
| 交接校验失败时整体回滚（事务）     | `CustomerAccessFlowTest#directCustomerHandoverValidationIsAtomic`                                    |
| 批量创建海外代理原子性（回滚）     | `CustomerAccessFlowTest#batchCreatesOverseaAgentEmployeesAtomically`                                 |
| 代理分配与单向关联                 | `CustomerAccessFlowTest#overseasAgentUsesCustomerLoginAndCanonicalFileVisibilityRole`                |

### 2.4 票单绑定与发布

| 场景                             | 用例                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| 绑定、发布状态、越权修改返回 404 | `CustomerAccessFlowTest#customerCodeLoginAndExplicitShipmentBindingEnforceOwnership`        |
| 批量票单字段更新                 | `customer/CustomerDirectoryServiceTest`、后端集成用例                                       |
| 批量追踪任务进度 / 取消 / 失败项 | `shipment/ShipmentBatchTrackingServiceTest`、`shipment/ShipmentBatchTrackingResilienceTest` |

### 2.5 快照

| 场景                         | 用例                                      |
| ---------------------------- | ----------------------------------------- |
| 快照持久化与刷新事件         | `shipment/ShipmentTrackingServiceTest`    |
| 自动刷新与补充重试、失败让位 | `shipment/ShipmentAutoRefreshServiceTest` |
| 快照参与客户可见性           | `CustomerAccessFlowTest`                  |
| 快照表结构契约               | `DatabaseSchemaBaselineContractTest`      |

### 2.6 附件 / 文件

| 场景                               | 用例                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 配额、扩展名、磁盘余量（失败路径） | `shipment/ShipmentFileServiceTest#enforcesShipmentCountAndByteQuotas`、`#protectsConfiguredDiskFreeSpaceFloor` |
| 软删除与可见性角色                 | `ShipmentFileServiceTest#enforcesParticipantVisibilityAndSoftDeleteRules`                                      |
| 同一票单下不同客户文件隔离         | `ShipmentFileServiceTest#isolatesFilesBetweenCustomersAssignedToTheSameShipment`                               |
| 内联/文本预览兜底                  | `ShipmentFileServiceTest#providesSafeInlineAndTextFallbackPreviews`                                            |
| 工作区文件保留与清理               | `workspacefile/WorkspaceFileServiceTest`                                                                       |

### 2.7 追踪服务（Node）

| 场景                            | 用例                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| HTTP 路由与适配器契约           | `tracking-service/test/server.test.mjs`                             |
| COSCO 限流 / 冷却 / 队列 / 取消 | `cosco-protection.test.mjs`、`cosco-resilience-regression.test.mjs` |
| 代理池与代理切换                | `cosco-proxy-pool.test.mjs`                                         |
| CMA / Playwright 并发           | `playwright-concurrency.test.mjs`、`batch-import-rules.test.mjs`    |
| 前端静态契约                    | `public-app-contract.test.mjs`                                      |

### 2.8 装箱

| 场景                | 用例                                                       |
| ------------------- | ---------------------------------------------------------- |
| 层优先策略          | `frontend/scripts/check-packing-level-first.js`            |
| 单层行填充          | `check-packing-single-layer-row-fill.js`                   |
| 托盘间隙            | `check-packing-pallet-gap.js`                              |
| 大批量家具与恢复    | `check-packing-large-workload.js`                          |
| 报告标签 / 剩余空间 | `check-report-label-layout.js`、`check-remaining-space.js` |

### 2.9 结构与依赖契约

| 场景                       | 用例                                     |
| -------------------------- | ---------------------------------------- |
| schema.sql 关键表/列不丢失 | `DatabaseSchemaBaselineContractTest`     |
| 构造器注入（无字段注入）   | `SpringConstructorInjectionContractTest` |

## 3. 本批新增

- `auth/HttpAuthorizationRegressionTest`：用真实 `WebConfig` 路径规则与真实拦截器，
  只把认证服务替换为桩，验证：
  - 公开路径（`/api/auth/login`、`/api/public/**`）不需要 token；
  - 内部接口无 token → 401；
  - BUSINESS 能读业务接口但不能进后台（403）；ADMIN 可进后台；
  - OVERSEA_AGENT 被后台拒绝、可读内部接口；
  - 客户通道使用独立 token，两个通道 token 不可互换；
  - OPTIONS 预检绕过鉴权。
    用 `doReturn/doThrow` 而非 `when(...).thenThrow(...)` 设置桩，避免桩串扰。

## 4. 已知未覆盖 / 后续补强

- 真实 MySQL 行为（外键、字符集、锁）不在 JUnit 覆盖，属于 T12 的验收范围。
- 前端页面级交互（路由、角色入口、错误/加载/空状态）尚无自动化，T08 拆分时补。
- 追踪服务未做真实船司抓取（避免依赖外部网络与账号），沿用模拟通道。
- 登录专用失败矩阵（设备上限、锁定）可再补 `AuthServiceLoginRegressionTest`。
