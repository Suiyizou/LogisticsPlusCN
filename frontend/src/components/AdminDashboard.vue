<template>
  <section v-if="!currentUser" class="admin-login-shell">
    <div class="admin-login-brand">
      <RouterLink class="admin-back-link" to="/workbenches">{{ t("portal.switchWorkbench") }}</RouterLink>
      <span class="brand-mark"><img src="/favicon.svg" alt="" /></span>
      <p>Admin Console</p>
      <h1>企业后台管理系统</h1>
      <strong>管理员登录后可管理员工账号、在线设备、系统运行与审计记录。</strong>
      <div class="admin-login-points">
        <span>员工账号管理</span>
        <span>设备登录限制</span>
        <span>运行监控面板</span>
      </div>
    </div>

    <form class="admin-login-card" @submit.prevent="handleLogin">
      <div class="admin-login-title">
        <span>总管理员登录</span>
        <strong>后台入口</strong>
      </div>
      <label>
        <span>账号</span>
        <input v-model.trim="loginForm.username" autocomplete="username" />
      </label>
      <label>
        <span>密码</span>
        <input v-model="loginForm.password" autocomplete="current-password" type="password" />
      </label>
      <button class="primary wide" type="submit" :disabled="loading">
        {{ loading ? "登录中..." : "登录后台" }}
      </button>
      <p v-if="message" class="admin-message error">{{ message }}</p>
    </form>
  </section>

  <section v-else class="admin-console-shell">
    <aside class="admin-console-sidebar">
    <RouterLink class="admin-console-brand" to="/workbenches">
        <span class="brand-mark"><img src="/favicon.svg" alt="" /></span>
        <div>
          <p>Browser / Server</p>
          <strong>后台管理</strong>
        </div>
      </RouterLink>

      <div class="admin-profile-card">
        <span>当前管理员</span>
        <strong>{{ displayAdminName }}</strong>
        <small>{{ currentUser.username }} · {{ roleText(currentUser.role) }}</small>
      </div>

      <nav class="admin-console-nav">
        <template v-for="(item, index) in adminPages" :key="item.key">
          <p
            v-if="index === 0 || item.group !== adminPages[index - 1].group"
            class="admin-nav-group-label"
          >{{ item.groupLabel }}</p>
          <button
            type="button"
            :class="{ active: activeAdminPage === item.key }"
            @click="selectAdminPage(item.key)"
          >
            <span>{{ item.no }}</span>
            <b>{{ item.label }}</b>
            <small>{{ item.description }}</small>
          </button>
        </template>
      </nav>
    </aside>

    <main class="admin-console-main">
      <header class="admin-console-topbar">
        <div>
          <p>{{ activePageMeta.eyebrow }}</p>
          <h1>{{ activePageMeta.title }}</h1>
          <span>{{ activePageMeta.subtitle }}</span>
        </div>
        <div class="admin-top-actions">
          <button class="admin-system-message-button" type="button" @click="emit('open-announcements')">
            {{ announcementCopy.systemMessages }}
            <em v-if="props.announcementCount > 0">{{ props.announcementCount > 99 ? '99+' : props.announcementCount }}</em>
          </button>
          <button type="button" :disabled="loading" @click="loadDashboard">
            {{ loading ? "刷新中..." : "刷新数据" }}
          </button>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </header>

      <p v-if="message" class="admin-message" :class="{ error: hasError }">{{ message }}</p>

      <section v-if="activeAdminPage === 'overview'" class="admin-page-pane">
        <div class="admin-metrics">
          <div>
            <span>{{ overviewCopy.totalUsers }}</span>
            <strong>{{ systemOverview?.totalUsers ?? "-" }}</strong>
            <small>{{ overviewCopy.totalUsersHint
              .replace("{internal}", String(systemOverview?.internalUserCount ?? 0))
              .replace("{customers}", String(systemOverview?.customerCount ?? 0)) }}</small>
          </div>
          <div>
            <span>{{ overviewCopy.activeUsers }}</span>
            <strong>{{ systemOverview?.activeUsers ?? "-" }}</strong>
            <small>{{ overviewCopy.activeUsersHint }}</small>
          </div>
          <div>
            <span>{{ overviewCopy.onlineDevices }}</span>
            <strong>{{ systemOverview?.onlineDeviceCount ?? "-" }}</strong>
            <small>{{ overviewCopy.onlineDevicesHint }}</small>
          </div>
          <div>
            <span>{{ overviewCopy.management30d }}</span>
            <strong>{{ systemOverview?.managementActions30d ?? "-" }}</strong>
            <small>{{ overviewCopy.management30dHint }}</small>
          </div>
          <div>
            <span>{{ overviewCopy.todayActivity }}</span>
            <strong>{{ systemOverview?.operationsToday ?? "-" }}</strong>
            <small>{{ overviewCopy.todayActivityHint }}</small>
          </div>
        </div>

        <div class="admin-overview-chart-grid">
          <article class="admin-panel admin-overview-chart-card admin-overview-chart-card--wide">
            <div class="admin-panel-head">
              <div>
                <p>Activity Trend</p>
                <h2>{{ overviewCopy.activityTrend }}</h2>
              </div>
              <span>{{ overviewCopy.activityTrendHint }}</span>
            </div>
            <div
              ref="overviewActivityChartRef"
              class="admin-overview-echart"
              role="img"
              :aria-label="overviewCopy.activityTrend"
            ></div>
          </article>

          <article class="admin-panel admin-overview-chart-card">
            <div class="admin-panel-head">
              <div>
                <p>User Composition</p>
                <h2>{{ overviewCopy.userComposition }}</h2>
              </div>
            </div>
            <div
              ref="overviewUserChartRef"
              class="admin-overview-echart"
              role="img"
              :aria-label="overviewCopy.userComposition"
            ></div>
          </article>

          <article class="admin-panel admin-overview-chart-card">
            <div class="admin-panel-head">
              <div>
                <p>Account Status</p>
                <h2>{{ overviewCopy.accountStatus }}</h2>
              </div>
            </div>
            <div
              ref="overviewStatusChartRef"
              class="admin-overview-echart"
              role="img"
              :aria-label="overviewCopy.accountStatus"
            ></div>
          </article>

          <article class="admin-panel admin-overview-chart-card admin-overview-chart-card--wide">
            <div class="admin-panel-head">
              <div>
                <p>Management Actions</p>
                <h2>{{ overviewCopy.operationTypes }}</h2>
              </div>
              <span>{{ overviewCopy.operationTypesHint }}</span>
            </div>
            <div
              ref="overviewOperationChartRef"
              class="admin-overview-echart admin-overview-echart--bar"
              role="img"
              :aria-label="overviewCopy.operationTypes"
            ></div>
          </article>
        </div>
      </section>

      <section v-else-if="activeAdminPage === 'audit'" class="admin-page-pane">
        <article class="admin-panel admin-audit-panel">
          <div class="admin-panel-head">
            <div>
              <p>API Audit Trail</p>
              <h2>{{ ui('admin.audit.apiTitle') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ t("admin.console.recordCount", { count: apiAuditTotal }) }}</span>
              <button type="button" :disabled="loading" @click="loadApiAuditPage">
                {{ t("admin.console.refreshAudit") }}
              </button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table
              :data="apiAuditRows"
              row-key="id"
              stripe
              class="standard-information-table admin-audit-table"
            >
              <el-table-column :label="ui('admin.audit.time')" width="148">
                <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.userRole')" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <b>{{ row.username || '-' }}</b>
                  <small>{{ row.role || '-' }} · ID {{ row.userId || '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.endpoint')" min-width="250" show-overflow-tooltip>
                <template #default="{ row }">
                  <b>{{ row.method }} {{ row.path }}</b>
                  <small>{{ row.requestId || '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.result')" width="96">
                <template #default="{ row }">
                  <el-tag :type="Number(row.status) < 400 ? 'success' : 'danger'">
                    {{ row.status || '-' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.duration')" width="92">
                <template #default="{ row }">{{ row.durationMs ?? 0 }} ms</template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.ipDevice')" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  <b>{{ row.ipAddress || '-' }}</b>
                  <small>{{ row.userAgent || '-' }}</small>
                </template>
              </el-table-column>
              <template #empty>{{ ui('admin.audit.empty') }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="apiAuditTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="apiAuditPage"
            :page-size="apiAuditPageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="apiAuditTotal"
            @current-change="changeApiAuditPage"
            @size-change="changeApiAuditPageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'employees'" class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Account List</p>
              <h2>员工管理</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ t("admin.console.accountCount", { count: employeeTotal }) }}</span>
              <button class="primary" type="button" @click="openEmployeeDialog()">新增员工</button>
              <button type="button" @click="loadDashboard">刷新</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="pagedEmployees" row-key="id" stripe class="standard-information-table">
              <el-table-column prop="username" :label="t('admin.list.username')" min-width="128" show-overflow-tooltip />
              <el-table-column prop="displayName" :label="t('admin.list.displayName')" min-width="136" show-overflow-tooltip />
              <el-table-column :label="t('admin.list.systemRole')" width="126">
                <template #default="{ row: user }">{{ roleText(user.role) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.employee.partyRole')" width="126">
                <template #default="{ row: user }">{{ partyRoleText(user.partyRole, user.role) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.status')" width="100">
                <template #default="{ row: user }">
                    <span class="admin-status" :class="{ off: user.status !== 'ACTIVE' }">
                      {{ statusText(user.status) }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('admin.list.lastLogin')" width="142">
                <template #default="{ row: user }">{{ formatDate(user.lastLoginAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.actions')" width="304" fixed="right">
                <template #default="{ row: user }">
                    <div class="table-actions">
                      <button type="button" @click="openEmployeeDialog(user)">{{ t("admin.employee.edit") }}</button>
                      <button
                        type="button"
                        :disabled="user.id === currentUser?.id"
                        :title="user.id === currentUser?.id ? t('admin.employee.selfResetDisabled') : ''"
                        @click="handleResetPassword(user)"
                      >{{ t("admin.employee.resetPassword") }}</button>
                      <button type="button" @click="toggleEmployee(user)">
                        {{ user.status === "ACTIVE" ? "禁用" : "启用" }}
                      </button>
                      <button class="danger ghost" type="button" :disabled="user.id === currentUser?.id" @click="handleDeleteEmployee(user)">删除</button>
                    </div>
                </template>
              </el-table-column>
              <template #empty>{{ t("admin.employee.empty") }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="employeeTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="employeePage"
            :page-size="employeePageSize"
            :page-sizes="[10, 20, 50]"
            :total="employeeTotal"
            @current-change="changeEmployeePage"
            @size-change="changeEmployeePageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'platform'" class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Shipment Track</p>
              <h2>{{ ui('admin.platform.title') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ ui('admin.platform.summary', {
                customers: platformInfo?.customerCount || 0,
                assigned: platformInfo?.assignedCustomerCount || 0
              }) }}</span>
              <RouterLink class="admin-inline-link primary" to="/customers">
                {{ t("admin.console.openTrackingManagement") }}
              </RouterLink>
              <button type="button" @click="loadDashboard">{{ ui('admin.files.refresh') }}</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="pagedPlatformCustomers" :row-key="platformRowKey" stripe class="standard-information-table">
              <el-table-column :label="ui('admin.platform.customer')" min-width="158" show-overflow-tooltip>
                <template #default="{ row }"><b>{{ row.customerDisplayName || row.customerUsername }}</b><small>@{{ row.customerUsername }}</small></template>
              </el-table-column>
              <el-table-column prop="clientCode" :label="ui('admin.platform.clientCode')" width="128" show-overflow-tooltip />
              <el-table-column :label="ui('admin.platform.partyRole')" width="130">
                <template #default="{ row }">{{ partyRoleText(row.partyRole) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.platform.business')" min-width="148" show-overflow-tooltip>
                <template #default="{ row }"><b>{{ row.businessDisplayName || '-' }}</b><small>@{{ row.businessUsername || '-' }}</small></template>
              </el-table-column>
              <el-table-column :label="ui('admin.platform.agent')" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <b>{{ row.agentDisplayName || ui('admin.platform.unassigned') }}</b>
                  <small>{{ row.agentUsername ? `@${row.agentUsername}` : '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="shipmentCount" :label="ui('admin.platform.shipments')" width="120" align="center" />
              <el-table-column :label="t('admin.list.status')" width="110">
                <template #default="{ row }"><span class="admin-status" :class="{ off: row.customerStatus !== 'ACTIVE' }">{{ statusText(row.customerStatus) }}</span></template>
              </el-table-column>
              <el-table-column :label="t('admin.list.actions')" width="168" fixed="right">
                <template #default="{ row }">
                  <div class="admin-platform-row-actions">
                    <RouterLink
                      class="admin-row-action"
                      :to="{ path: '/customers', query: { customer: row.customerId } }"
                    >
                      {{ t("admin.console.manage") }}
                    </RouterLink>
                    <button
                      class="admin-row-action danger"
                      type="button"
                      :disabled="loading"
                      @click="handleDeletePlatformCustomer(row)"
                    >
                      {{ platformActionCopy.delete }}
                    </button>
                  </div>
                </template>
              </el-table-column>
              <template #empty>{{ ui('admin.platform.empty') }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="platformTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="platformPage"
            :page-size="platformPageSize"
            :page-sizes="[10, 20, 50]"
            :total="platformTotal"
            @current-change="changePlatformPage"
            @size-change="changePlatformPageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'announcements'" class="admin-page-pane">
        <article class="admin-panel admin-announcement-panel">
          <div class="admin-panel-head">
            <div>
              <p>Announcement Center</p>
              <h2>{{ announcementCopy.listTitle }}</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ announcementCopy.total.replace('{count}', String(announcementTotal)) }}</span>
              <button class="primary" type="button" @click="openAnnouncementEditor()">
                {{ announcementCopy.create }}
              </button>
              <button type="button" :disabled="loading" @click="loadAnnouncementPage">
                {{ announcementCopy.refresh }}
              </button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table
              :data="announcements"
              row-key="id"
              stripe
              class="standard-information-table admin-announcement-table"
            >
              <el-table-column :label="announcementCopy.title" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="announcement-title-cell">
                    <span v-if="announcementImageUrl(row)" class="announcement-image-indicator" aria-hidden="true"></span>
                    <div>
                      <b>{{ row.title || '-' }}</b>
                      <small>{{ announcementExcerpt(row.contentMarkdown) }}</small>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="announcementCopy.visibility" width="122">
                <template #default="{ row }">
                  <span class="announcement-visibility" :class="announcementAudience(row).toLowerCase()">
                    {{ announcementVisibilityLabel(announcementAudience(row)) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="announcementCopy.displayDate" width="126">
                <template #default="{ row }">{{ row.displayDate || '-' }}</template>
              </el-table-column>
              <el-table-column :label="announcementCopy.status" width="108">
                <template #default="{ row }">
                  <span class="admin-status" :class="{ off: row.status !== 'PUBLISHED' }">
                    {{ announcementStatusLabel(row.status) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column :label="announcementCopy.updatedAt" width="148">
                <template #default="{ row }">{{ formatDate(row.updatedAt || row.publishedAt || row.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="announcementCopy.actions" width="250" fixed="right">
                <template #default="{ row }">
                  <div class="table-actions announcement-row-actions">
                    <button type="button" @click="openAnnouncementPreview(row)">{{ announcementCopy.preview }}</button>
                    <button type="button" @click="openAnnouncementEditor(row)">{{ announcementCopy.edit }}</button>
                    <button
                      v-if="row.status !== 'PUBLISHED'"
                      class="primary"
                      type="button"
                      @click="handlePublishAnnouncement(row)"
                    >{{ announcementCopy.publish }}</button>
                    <button
                      v-else
                      type="button"
                      @click="handleDeactivateAnnouncement(row)"
                    >{{ announcementCopy.deactivate }}</button>
                    <button class="danger ghost" type="button" @click="handleDeleteAnnouncement(row)">
                      {{ announcementCopy.delete }}
                    </button>
                  </div>
                </template>
              </el-table-column>
              <template #empty>{{ announcementCopy.empty }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="announcementTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="announcementPage"
            :page-size="announcementPageSize"
            :page-sizes="[10, 20, 50]"
            :total="announcementTotal"
            @current-change="changeAnnouncementPage"
            @size-change="changeAnnouncementPageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'devices'" class="admin-page-pane">
        <div class="admin-metrics compact">
          <div>
            <span>当前在线</span>
            <strong>{{ onlineDevices.length }}</strong>
            <small>可手动踢下线</small>
          </div>
          <div>
            <span>设备记录</span>
            <strong>{{ devices.length }}</strong>
            <small>最近 200 条</small>
          </div>
          <div>
            <span>设备上限</span>
            <strong>{{ monitoring?.deviceLimit ?? 5 }}</strong>
            <small>每个账号</small>
          </div>
        </div>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Login Devices</p>
              <h2>在线设备与登录 IP</h2>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="pagedDevices" row-key="id" stripe class="standard-information-table devices">
              <el-table-column :label="t('admin.list.user')" min-width="150" show-overflow-tooltip>
                <template #default="{ row: device }">{{ device.displayName }} / {{ device.username }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.device')" min-width="180" show-overflow-tooltip>
                <template #default="{ row: device }">
                    <b>{{ device.deviceName || "Web 设备" }}</b>
                    <small>{{ device.deviceId }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="ipAddress" label="IP" width="126">
                <template #default="{ row: device }">{{ device.ipAddress || "-" }}</template>
              </el-table-column>
              <el-table-column label="MAC" width="146" show-overflow-tooltip>
                <template #default="{ row: device }">{{ device.macAddress || t("admin.list.webMacUnavailable") }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.loginAt')" width="142">
                <template #default="{ row: device }">{{ formatDate(device.loggedInAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.lastSeen')" width="142">
                <template #default="{ row: device }">{{ formatDate(device.lastSeenAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.status')" width="90">
                <template #default="{ row: device }">
                    <span class="admin-status" :class="{ off: !device.online }">
                      {{ device.online ? "在线" : "离线" }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('admin.list.actions')" width="190" fixed="right">
                <template #default="{ row: device }">
                    <div class="table-actions">
                      <button type="button" :disabled="!device.online" @click="handleKickDevice(device)">踢下线</button>
                      <button class="danger ghost" type="button" @click="handleDeleteDevice(device)">删除设备</button>
                    </div>
                </template>
              </el-table-column>
              <template #empty>{{ t("admin.list.noDevices") }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="deviceTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="devicePage"
            :page-size="devicePageSize"
            :page-sizes="[10, 20, 50]"
            :total="deviceTotal"
            @current-change="changeDevicePage"
            @size-change="changeDevicePageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'files'" class="admin-page-pane">
        <div class="admin-file-scope-tabs" role="tablist" :aria-label="ui('admin.files.scopeAria')">
          <button
            type="button"
            role="tab"
            :aria-selected="activeAdminFileSection === 'workspace'"
            :class="{ active: activeAdminFileSection === 'workspace' }"
            @click="activeAdminFileSection = 'workspace'"
          >
            <span>{{ ui('admin.files.workspaceTab') }}</span>
            <b>{{ adminWorkspaceFileTotal }}</b>
            <small>{{ ui('admin.files.workspaceTabDescription') }}</small>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeAdminFileSection === 'shipment'"
            :class="{ active: activeAdminFileSection === 'shipment' }"
            @click="activeAdminFileSection = 'shipment'"
          >
            <span>{{ ui('admin.files.shipmentTab') }}</span>
            <b>{{ adminShipmentFileTotal }}</b>
            <small>{{ ui('admin.files.shipmentTabDescription') }}</small>
          </button>
        </div>

        <article v-if="activeAdminFileSection === 'workspace'" class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Temporary Workspace Files</p>
              <h2>{{ ui('admin.files.workspaceTitle') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <label class="admin-files-expired-filter">
                <input v-model="includeExpiredFiles" type="checkbox" @change="handleWorkspaceExpiredToggle" />
                <span>{{ ui('admin.files.includeExpired') }}</span>
              </label>
              <span>{{ ui('admin.files.total', { count: adminWorkspaceFileTotal }) }}</span>
              <button type="button" @click="loadAdminWorkspaceFiles">{{ ui('admin.files.refresh') }}</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="adminWorkspaceFiles" row-key="id" stripe class="standard-information-table admin-files-table">
              <el-table-column :label="ui('admin.files.user')" min-width="160">
                <template #default="{ row: file }">
                    <b>{{ file.ownerDisplayName || '-' }}</b>
                    <small>ID {{ file.userId || '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.fileName')" min-width="220">
                <template #default="{ row: file }">
                    <b>{{ file.originalFileName }}</b>
                    <small>{{ file.source || '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.size')" width="110">
                <template #default="{ row: file }">{{ formatFileSize(file.sizeBytes) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.uploadedAt')" min-width="165">
                <template #default="{ row: file }">{{ formatDate(file.uploadedAt) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.expiresAt')" min-width="165">
                <template #default="{ row: file }">{{ formatDate(file.expiresAt) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.status')" width="100">
                <template #default="{ row: file }">
                    <span class="admin-status" :class="{ off: file.expired }">
                      {{ ui(file.expired ? 'admin.files.expired' : 'admin.files.active') }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.action')" width="110" fixed="right">
                <template #default="{ row: file }">
                    <div class="table-actions">
                      <button type="button" :disabled="file.expired" @click="handleDownloadWorkspaceFile(file)">{{ ui('admin.files.download') }}</button>
                    </div>
                </template>
              </el-table-column>
              <template #empty>{{ ui('admin.files.workspaceEmpty') }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="adminWorkspaceFileTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="adminWorkspaceFilePage"
            :page-size="adminWorkspaceFilePageSize"
            :page-sizes="[10, 20, 50]"
            :total="adminWorkspaceFileTotal"
            @current-change="changeAdminWorkspaceFilePage"
            @size-change="changeAdminWorkspaceFilePageSize"
          />
        </article>

        <article v-else class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Shipment Documents</p>
              <h2>{{ ui('admin.files.shipmentTitle') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ ui('admin.files.total', { count: adminShipmentFileTotal }) }}</span>
              <button type="button" @click="loadAdminShipmentFiles">{{ ui('admin.files.refresh') }}</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="adminShipmentFiles" :row-key="shipmentFileKey" stripe class="standard-information-table admin-files-table shipment-files">
              <el-table-column :label="ui('admin.files.shipmentReference')" min-width="180">
                <template #default="{ row: file }">
                    <b>{{ shipmentFileReference(file) }}</b>
                    <small>{{ ui('admin.files.publicId') }} {{ shipmentPublicId(file) }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.uploader')" min-width="170">
                <template #default="{ row: file }">
                    <b>{{ shipmentFileUploader(file) }}</b>
                    <small>{{ shipmentFileUploaderDetail(file) }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.fileName')" min-width="220">
                <template #default="{ row: file }">
                    <b>{{ file.originalFileName || file.fileName || '-' }}</b>
                    <small>{{ file.documentCategory || file.category || file.contentType || '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.visibility')" width="130">
                <template #default="{ row: file }">
                    <span class="admin-visibility-pill" :class="shipmentFileVisibilityClass(file.visibility)">
                      {{ shipmentFileVisibilityText(file.visibility) }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.size')" width="100">
                <template #default="{ row: file }">{{ formatFileSize(file.sizeBytes) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.uploadedAt')" min-width="165">
                <template #default="{ row: file }">{{ formatDate(file.uploadedAt || file.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.status')" width="100">
                <template #default="{ row: file }">
                    <span
                      class="admin-status"
                      :class="{
                        off: isShipmentFileDeleted(file),
                        warn: isShipmentFilePending(file)
                      }"
                    >
                      {{ shipmentFileStatusText(file.status) }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.files.action')" width="250" fixed="right">
                <template #default="{ row: file }">
                    <div class="table-actions">
                      <button
                        type="button"
                        :disabled="isShipmentFileDeleted(file)"
                        @click="handlePreviewShipmentFile(file)"
                      >
                        {{ ui('admin.files.preview') }}
                      </button>
                      <button
                        type="button"
                        :disabled="isShipmentFileDeleted(file)"
                        @click="handleDownloadShipmentFile(file)"
                      >
                        {{ ui('admin.files.download') }}
                      </button>
                      <button
                        class="danger ghost"
                        type="button"
                        :disabled="isShipmentFileDeleted(file)"
                        @click="handleDeleteShipmentFile(file)"
                      >
                        {{ ui('admin.files.delete') }}
                      </button>
                    </div>
                </template>
              </el-table-column>
              <template #empty>{{ ui('admin.files.shipmentEmpty') }}</template>
            </el-table>
          </div>
          <el-pagination
            v-if="adminShipmentFileTotal"
            class="admin-pagination"
            background
            layout="prev, pager, next, sizes, total"
            :current-page="adminShipmentFilePage"
            :page-size="adminShipmentFilePageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="adminShipmentFileTotal"
            @current-change="changeAdminShipmentFilePage"
            @size-change="changeAdminShipmentFilePageSize"
          />
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'system'" class="admin-page-pane">
        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Security Policy</p>
                <h2>账号与设备策略</h2>
              </div>
            </div>
            <div class="admin-setting-list">
              <span><b>单账号设备上限</b>{{ monitoring?.deviceLimit ?? 5 }} 台</span>
              <span><b>登录凭证</b>X-Auth-Token 会话令牌</span>
              <span><b>MAC 地址</b>浏览器无法直接读取，后续桌面客户端可补齐</span>
              <span><b>超限处理</b>达到上限后拒绝新设备登录</span>
            </div>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Service Status</p>
                <h2>服务状态</h2>
              </div>
            </div>
            <div class="admin-setting-list">
              <span><b>后端接口</b>/api/auth 与 /api/admin</span>
              <span><b>服务时间</b>{{ formatDate(monitoring?.serverTime) }}</span>
              <span><b>请求总数</b>{{ monitoring?.runtime?.totalRequests ?? 0 }}</span>
              <span><b>异常请求</b>{{ monitoring?.runtime?.failedRequests ?? 0 }}</span>
            </div>
          </article>
        </div>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>LLM Settings</p>
              <h2>智能识别模型配置</h2>
            </div>
            <span class="admin-health-pill" :class="{ warn: !llmSettings?.enabled || !llmSettings?.apiKeyConfigured }">
              {{ llmStatusText }}
            </span>
          </div>
          <form class="admin-form-grid llm-settings-form" @submit.prevent="handleUpdateLlmSettings">
            <label class="admin-toggle-row">
              <span>启用 LLM 智能识别</span>
              <input v-model="llmForm.enabled" type="checkbox" />
            </label>
            <label>
              <span>Base URL</span>
              <input v-model.trim="llmForm.baseUrl" placeholder="https://api.deepseek.com" />
            </label>
            <label>
              <span>模型名称</span>
              <input v-model.trim="llmForm.model" placeholder="deepseek-v4-flash" />
            </label>
            <label>
              <span>API Key</span>
              <input v-model.trim="llmForm.apiKey" autocomplete="off" type="password" placeholder="留空则保留当前密钥" />
            </label>
            <label class="admin-toggle-row">
              <span>清空当前 API Key</span>
              <input v-model="llmForm.clearApiKey" type="checkbox" />
            </label>
            <div class="admin-setting-list llm-current-settings">
              <span><b>当前提供方</b>{{ llmSettings?.provider || "OpenAI-compatible HTTP" }}</span>
              <span><b>当前模型</b>{{ llmSettings?.model || "-" }}</span>
              <span><b>Key 状态</b>{{ llmSettings?.apiKeyConfigured ? `已配置 ${llmSettings.apiKeyPreview}` : "未配置" }}</span>
              <span><b>默认行为</b>开启但无 Key 时自动使用规则兜底</span>
            </div>
            <div class="admin-form-actions">
              <button class="primary" type="submit" :disabled="loading">保存 LLM 配置</button>
            </div>
          </form>
        </article>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Operations</p>
              <h2>系统管理预留</h2>
            </div>
          </div>
          <div class="admin-operation-grid">
            <button type="button" disabled>修改设备上限</button>
            <button type="button" disabled>数据备份</button>
            <button type="button" disabled>清理离线会话</button>
            <button type="button" disabled>系统公告</button>
          </div>
          <p class="admin-hint">这些操作入口先保留在后台面板里，后续接数据库配置和权限审计时再打开。</p>
        </article>
      </section>

    </main>

    <div v-if="announcementDialogOpen" class="modal-backdrop">
      <div class="modal announcement-editor-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <p>Announcement Editor</p>
            <h2>{{ editingAnnouncementId ? announcementCopy.editTitle : announcementCopy.createTitle }}</h2>
          </div>
          <button type="button" :aria-label="announcementCopy.close" @click="closeAnnouncementEditor">×</button>
        </header>
        <form class="announcement-editor-form" @submit.prevent="handleSaveAnnouncement">
          <div class="announcement-editor-grid">
            <div class="announcement-fields">
              <label>
                <span>{{ announcementCopy.title }}</span>
                <input v-model.trim="announcementForm.title" maxlength="160" :placeholder="announcementCopy.titlePlaceholder" />
              </label>
              <div class="announcement-field-row">
                <label>
                  <span>{{ announcementCopy.displayDate }}</span>
                  <input v-model="announcementForm.displayDate" type="date" />
                </label>
                <label>
                  <span>{{ announcementCopy.visibility }}</span>
                  <el-select v-model="announcementForm.audience" class="business-select">
                    <el-option value="CUSTOMER" :label="announcementVisibilityLabel('CUSTOMER')" />
                    <el-option value="EMPLOYEE" :label="announcementVisibilityLabel('EMPLOYEE')" />
                    <el-option value="ALL" :label="announcementVisibilityLabel('ALL')" />
                  </el-select>
                </label>
              </div>
              <div
                class="announcement-image-field"
                :class="{ 'is-dragging': announcementImageDragging }"
                @dragenter.prevent="announcementImageDragging = true"
                @dragover.prevent="announcementImageDragging = true"
                @dragleave="handleAnnouncementImageDragLeave"
                @drop.prevent="handleAnnouncementCoverDrop"
              >
                <span class="announcement-field-label">{{ announcementCopy.coverImage }}</span>
                <button
                  class="announcement-image-dropzone"
                  type="button"
                  :disabled="announcementImageUploading"
                  @click="chooseAnnouncementImage('cover')"
                >
                  <img
                    v-if="announcementImageUrl(announcementForm)"
                    :src="announcementImageUrl(announcementForm)"
                    :alt="announcementForm.title || announcementCopy.coverImage"
                  />
                  <span v-else class="announcement-image-drop-icon" aria-hidden="true">+</span>
                  <span>
                    <b>{{ announcementImageUploading
                      ? announcementCopy.uploadingImage
                      : announcementCopy.dropImage }}</b>
                    <small>{{ announcementCopy.uploadHint }}</small>
                  </span>
                  <em>{{ announcementCopy.chooseImage }}</em>
                </button>
                <input
                  ref="announcementImageInputRef"
                  class="announcement-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  @change="handleAnnouncementImageUpload"
                />
                <label class="announcement-image-url-field">
                  <span>{{ announcementCopy.imageUrl }}</span>
                  <input
                    v-model.trim="announcementForm.imageUrl"
                    type="text"
                    placeholder="https://example.com/image.jpg"
                  />
                </label>
                <small v-if="announcementUploadedPath" class="announcement-storage-path">
                  <b>{{ announcementCopy.storagePath }}</b>
                  <code>{{ announcementUploadedPath }}</code>
                </small>
              </div>
              <label>
                <span>{{ announcementCopy.illustrationRef }}</span>
                <input v-model.trim="announcementForm.illustrationRef" :placeholder="announcementCopy.illustrationPlaceholder" />
              </label>
              <div class="announcement-rich-field">
                <span class="announcement-field-label">{{ announcementCopy.content }}</span>
                <div class="announcement-rich-toolbar" :aria-label="announcementCopy.toolbar">
                  <button type="button" :title="announcementCopy.heading2" @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'h2')">H2</button>
                  <button type="button" :title="announcementCopy.heading3" @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'h3')">H3</button>
                  <button type="button" :title="announcementCopy.bold" @mousedown.prevent="applyAnnouncementFormat('bold')"><b>B</b></button>
                  <button type="button" :title="announcementCopy.italic" @mousedown.prevent="applyAnnouncementFormat('italic')"><i>I</i></button>
                  <button type="button" :title="announcementCopy.bulletList" @mousedown.prevent="applyAnnouncementFormat('insertUnorderedList')">•</button>
                  <button type="button" :title="announcementCopy.numberedList" @mousedown.prevent="applyAnnouncementFormat('insertOrderedList')">1.</button>
                  <button type="button" :title="announcementCopy.quote" @mousedown.prevent="applyAnnouncementFormat('formatBlock', 'blockquote')">“”</button>
                  <button type="button" :title="announcementCopy.link" @mousedown.prevent="insertAnnouncementLink">↗</button>
                  <button type="button" :title="announcementCopy.insertImage" @mousedown.prevent="insertAnnouncementImageIntoEditor()">▧</button>
                  <span class="announcement-toolbar-divider" aria-hidden="true"></span>
                  <details class="announcement-toolbar-palette" @mousedown="rememberAnnouncementEditorSelection">
                    <summary :title="announcementCopy.emoji">☺</summary>
                    <div>
                      <button
                        v-for="item in ANNOUNCEMENT_EMOJIS"
                        :key="item"
                        type="button"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >{{ item }}</button>
                    </div>
                  </details>
                  <details class="announcement-toolbar-palette" @mousedown="rememberAnnouncementEditorSelection">
                    <summary :title="announcementCopy.symbol">Ω</summary>
                    <div>
                      <button
                        v-for="item in ANNOUNCEMENT_SYMBOLS"
                        :key="item"
                        type="button"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >{{ item }}</button>
                    </div>
                  </details>
                  <details class="announcement-toolbar-palette announcement-toolbar-tags" @mousedown="rememberAnnouncementEditorSelection">
                    <summary :title="announcementCopy.tag">#</summary>
                    <div>
                      <button
                        v-for="item in announcementQuickTags"
                        :key="item"
                        type="button"
                        @mousedown.prevent="insertAnnouncementEditorText(item)"
                      >{{ item }}</button>
                    </div>
                  </details>
                  <span class="announcement-toolbar-spacer"></span>
                  <button type="button" :title="announcementCopy.undo" @mousedown.prevent="applyAnnouncementFormat('undo')">↶</button>
                  <button type="button" :title="announcementCopy.redo" @mousedown.prevent="applyAnnouncementFormat('redo')">↷</button>
                  <button type="button" :title="announcementCopy.clearFormat" @mousedown.prevent="applyAnnouncementFormat('removeFormat')">Tx</button>
                </div>
                <div
                  ref="announcementEditorRef"
                  class="announcement-rich-editor"
                  contenteditable="true"
                  role="textbox"
                  aria-multiline="true"
                  :data-placeholder="announcementCopy.contentPlaceholder"
                  @focus="rememberAnnouncementEditorSelection"
                  @input="syncAnnouncementMarkdownFromEditor"
                  @keyup="rememberAnnouncementEditorSelection"
                  @mouseup="rememberAnnouncementEditorSelection"
                  @paste="handleAnnouncementEditorPaste"
                  @dragover.prevent
                  @drop="handleAnnouncementEditorDrop"
                ></div>
                <small>{{ announcementCopy.editorHint }}</small>
              </div>
              <p v-if="announcementDialogError" class="announcement-dialog-error" role="alert">
                {{ announcementDialogError }}
              </p>
            </div>
            <aside class="announcement-live-preview">
              <div class="announcement-preview-heading">
                <span>{{ announcementCopy.livePreview }}</span>
                <small>{{ announcementForm.displayDate || todayDateString() }}</small>
              </div>
              <article class="announcement-preview-card">
                <img
                  v-if="announcementImageUrl(announcementForm)"
                  :src="announcementImageUrl(announcementForm)"
                  :alt="announcementForm.title || announcementCopy.preview"
                />
                <span class="announcement-preview-visibility">
                  {{ announcementVisibilityLabel(announcementForm.audience) }}
                </span>
                <h3>{{ announcementForm.title || announcementCopy.untitled }}</h3>
                <div class="announcement-markdown-preview" v-html="announcementEditorPreviewHtml"></div>
              </article>
            </aside>
          </div>
          <div class="modal-actions announcement-editor-actions">
            <button type="button" @click="closeAnnouncementEditor">{{ announcementCopy.cancel }}</button>
            <button class="primary" type="submit" :disabled="loading">{{ announcementCopy.saveDraft }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="announcementPreviewRecord" class="modal-backdrop">
      <div class="modal announcement-preview-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <p>Announcement Preview</p>
            <h2>{{ announcementPreviewRecord.title || announcementCopy.untitled }}</h2>
          </div>
          <button type="button" :aria-label="announcementCopy.close" @click="closeAnnouncementPreview">×</button>
        </header>
        <div class="announcement-preview-dialog-body">
          <article class="announcement-preview-card is-dialog">
            <img
              v-if="announcementImageUrl(announcementPreviewRecord)"
              :src="announcementImageUrl(announcementPreviewRecord)"
              :alt="announcementPreviewRecord.title || announcementCopy.preview"
            />
            <div class="announcement-preview-meta">
              <span>{{ announcementVisibilityLabel(announcementAudience(announcementPreviewRecord)) }}</span>
              <span>{{ announcementPreviewRecord.displayDate || '-' }}</span>
              <span>{{ announcementStatusLabel(announcementPreviewRecord.status) }}</span>
            </div>
            <h3>{{ announcementPreviewRecord.title || announcementCopy.untitled }}</h3>
            <div
              class="announcement-markdown-preview"
              v-html="renderAnnouncementMarkdown(announcementPreviewRecord.contentMarkdown)"
            ></div>
          </article>
        </div>
        <div class="modal-actions">
          <button class="primary" type="button" @click="closeAnnouncementPreview">{{ announcementCopy.close }}</button>
        </div>
      </div>
    </div>

    <div v-if="employeeDialogOpen" class="modal-backdrop">
      <div class="modal employee-modal">
        <header>
          <div>
            <p>Internal Account</p>
            <h2>{{ t(editingEmployeeId ? "admin.employee.editTitle" : "admin.employee.createTitle") }}</h2>
          </div>
          <button type="button" @click="closeEmployeeDialog">×</button>
        </header>
        <form class="admin-form-grid employee-dialog-form" @submit.prevent="handleSaveEmployee">
          <label>
            <span>账号</span>
            <input
              v-model.trim="employeeForm.username"
              :placeholder="t('admin.employee.usernamePlaceholder')"
              :disabled="Boolean(editingEmployeeId)"
            />
          </label>
          <label>
            <span>姓名</span>
            <input v-model.trim="employeeForm.displayName" placeholder="例如 张三" />
          </label>
          <label v-if="!editingEmployeeIsSelf">
            <span>{{ t(editingEmployeeId ? "admin.employee.newPassword" : "admin.employee.initialPassword") }}</span>
            <input
              v-model="employeeForm.password"
              type="password"
              :placeholder="t(editingEmployeeId ? 'admin.employee.newPasswordPlaceholder' : 'admin.employee.passwordPlaceholder')"
              @input="employeeDialogError = ''"
            />
            <small v-if="editingEmployeeId">{{ t("admin.employee.passwordOptionalHint") }}</small>
          </label>
          <label v-if="!editingEmployeeIsSelf">
            <span>{{ t("admin.employee.confirmPassword") }}</span>
            <input
              v-model="employeeForm.passwordConfirm"
              type="password"
              :placeholder="t('admin.employee.confirmPasswordPlaceholder')"
              @input="employeeDialogError = ''"
            />
          </label>
          <p v-if="editingEmployeeIsSelf" class="admin-hint">
            {{ t("admin.employee.selfPasswordEditHint") }}
          </p>
          <label>
            <span>角色</span>
            <el-select
              v-model="employeeForm.role"
              class="business-select"
              popper-class="business-select-popper"
            >
              <el-option value="OVERSEA_AGENT" :label="ui('profile.role.overseaAgent')" />
              <el-option value="BUSINESS" :label="ui('profile.role.business')" />
              <el-option value="ADMIN" :label="ui('profile.role.admin')" />
            </el-select>
          </label>
          <label>
            <span>{{ t("admin.employee.partyRole") }}</span>
            <el-select
              v-model="employeeForm.partyRole"
              class="business-select"
              popper-class="business-select-popper"
              :disabled="employeeForm.role !== 'OVERSEA_AGENT'"
            >
              <el-option value="AGENT" :label="t('customers.roleAgent')" />
            </el-select>
            <small>{{ t(employeeForm.role === 'OVERSEA_AGENT' ? "admin.employee.overseaAgentHint" : "admin.employee.agentForcedHint") }}</small>
          </label>
          <label>
            <span>状态</span>
            <el-select
              v-model="employeeForm.status"
              class="business-select"
              popper-class="business-select-popper"
            >
              <el-option value="ACTIVE" :label="statusText('ACTIVE')" />
              <el-option value="DISABLED" :label="statusText('DISABLED')" />
            </el-select>
          </label>
          <p v-if="employeeDialogError" class="employee-dialog-error" role="alert">
            {{ employeeDialogError }}
          </p>
          <div class="modal-actions">
            <button type="button" @click="closeEmployeeDialog">取消</button>
            <button class="primary" type="submit" :disabled="loading">
              {{ t(editingEmployeeId ? "admin.employee.save" : "admin.employee.create") }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="temporaryPasswordDialog.open" class="modal-backdrop">
      <div class="modal temporary-password-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <p>RESET CREDENTIAL</p>
            <h2>{{ t("admin.employee.temporaryPasswordTitle") }}</h2>
          </div>
          <button type="button" @click="closeTemporaryPasswordDialog">×</button>
        </header>
        <div class="temporary-password-content">
          <p>{{ t("admin.employee.temporaryPasswordDescription", { username: temporaryPasswordDialog.username }) }}</p>
          <code>{{ temporaryPasswordDialog.password }}</code>
          <strong>{{ t("admin.employee.temporaryPasswordWarning") }}</strong>
        </div>
        <div class="modal-actions">
          <button type="button" @click="copyTemporaryPassword">
            {{ t(temporaryPasswordDialog.copied ? "admin.employee.temporaryPasswordCopied" : "admin.employee.copyTemporaryPassword") }}
          </button>
          <button class="primary" type="button" @click="closeTemporaryPasswordDialog">
            {{ t("admin.employee.temporaryPasswordStored") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="filePreviewDialog.open" class="modal-backdrop">
      <div
        class="modal file-preview-modal"
        role="dialog"
        aria-modal="true"
        @click.stop
      >
        <header>
          <div>
            <p>{{ ui('admin.files.previewTitle') }}</p>
            <h2>{{ filePreviewDialog.name || ui('admin.files.previewTitle') }}</h2>
          </div>
          <button type="button" @click="closeFilePreviewDialog">×</button>
        </header>
        <div class="file-preview-content-wrapper">
          <p
            v-if="filePreviewDialog.message"
            class="file-preview-message"
            :class="{ error: filePreviewDialog.isError }"
          >
            {{ filePreviewDialog.message }}
          </p>
          <div class="file-preview-render">
            <iframe
              v-if="filePreviewDialog.kind === 'pdf' && filePreviewDialog.url"
              :src="filePreviewDialog.url"
              :title="filePreviewDialog.name || ui('admin.files.previewTitle')"
            ></iframe>
            <img
              v-else-if="filePreviewDialog.kind === 'image' && filePreviewDialog.url"
              :src="filePreviewDialog.url"
              :alt="filePreviewDialog.name || ui('admin.files.previewTitle')"
            />
            <textarea
              v-else-if="filePreviewDialog.kind === 'text'"
              class="file-preview-textarea"
              readonly
              :value="filePreviewDialog.text"
            ></textarea>
            <p
              v-else-if="filePreviewDialog.kind === 'fallback'"
              class="file-preview-fallback"
            >
              {{ filePreviewDialog.text || ui('admin.files.previewNotSupported') }}
            </p>
            <p v-else class="file-preview-fallback">{{ ui('admin.files.previewLoading') }}</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="primary" type="button" @click="closeFilePreviewDialog">
            {{ ui('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </section>
  <SystemWaitOverlay
    :visible="initialLoading"
    :message="t('app.loadingPage')"
  />
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { init as initEChart, use as useECharts } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";
import {
  clearAdminToken,
  createAdminAnnouncement,
  createEmployee,
  deleteAdminAnnouncement,
  deletePlatformCustomer,
  deleteAdminShipmentFile,
  deleteDevice,
  deleteEmployee,
  disableAdminAnnouncement,
  downloadAdminWorkspaceFile,
  downloadAdminShipmentFile,
  fetchAdminAnnouncements,
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminWorkspaceFiles,
  fetchAdminShipmentFileBlob,
  fetchAdminShipmentFiles,
  fetchAuditLog,
  fetchDevices,
  fetchEmployees,
  fetchLlmSettings,
  fetchMonitoring,
  fetchPlatformInfo,
  kickDevice,
  loginAdmin,
  publishAdminAnnouncement,
  resetEmployeePassword,
  storedAdminToken,
  uploadAdminAnnouncementImage,
  updateAdminAnnouncement,
  updateEmployee,
  updateLlmSettings
} from "../services/adminApi";
import { markApiErrorHandled } from "../services/apiClient";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

useECharts([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps({
  currentUser: { type: Object, default: null },
  announcementCount: { type: Number, default: 0 }
});
const emit = defineEmits(["logout", "user-updated", "open-announcements"]);

const rawAdminPages = [
  { key: "overview", no: "01", group: "overview", groupLabel: "\u4f01\u4e1a\u603b\u89c8", label: "\u540e\u53f0\u6982\u89c8", description: "\u7cfb\u7edf\u7528\u6237\u4e0e\u64cd\u4f5c\u8d8b\u52bf", eyebrow: "Executive Overview", title: "\u4f01\u4e1a\u7cfb\u7edf\u603b\u89c8", subtitle: "\u4ece\u4f01\u4e1a\u7ba1\u7406\u89c6\u89d2\u67e5\u770b\u8d26\u53f7\u89c4\u6a21\u3001\u7cfb\u7edf\u6d3b\u8dc3\u5ea6\u548c\u7ba1\u7406\u64cd\u4f5c\u8d8b\u52bf\u3002" },
  { key: "audit", no: "02", group: "overview", groupLabel: "\u4f01\u4e1a\u603b\u89c8", label: "\u64cd\u4f5c\u5ba1\u8ba1", description: "\u63a5\u53e3\u8bbf\u95ee\u4e0e\u64cd\u4f5c\u8ffd\u6eaf", eyebrow: "Operation Audit", title: "\u64cd\u4f5c\u5ba1\u8ba1", subtitle: "\u72ec\u7acb\u67e5\u770b\u7cfb\u7edf\u63a5\u53e3\u8bbf\u95ee\u3001\u6267\u884c\u7ed3\u679c\u3001\u8017\u65f6\u4e0e\u8bbe\u5907\u6765\u6e90\u3002" },
  { key: "employees", no: "03", group: "business", groupLabel: "\u4e1a\u52a1\u4e0e\u8d26\u53f7", label: "\u5458\u5de5\u7ba1\u7406", description: "\u4e09\u7c7b\u5185\u90e8\u8d26\u53f7", eyebrow: "Employee Management", title: "\u5458\u5de5\u7ba1\u7406", subtitle: "\u7ef4\u62a4\u7ba1\u7406\u5458\u3001\u552f\u4e00\u4e1a\u52a1\u5458\u4e0e\u6d77\u5916\u4ee3\u7406\u8d26\u53f7\u3002" },
  { key: "platform", no: "04", group: "business", groupLabel: "\u4e1a\u52a1\u4e0e\u8d26\u53f7", label: "\u8d27\u8e2a\u5e73\u53f0", description: "\u5ba2\u6237\u3001\u4ee3\u7406\u4e0e\u7968\u5355", eyebrow: "Shipment Tracking Platform", title: "\u8d27\u8e2a\u5e73\u53f0", subtitle: "\u67e5\u770b\u4e1a\u52a1\u5458\u4e3a\u5ba2\u6237\u5206\u914d\u7684\u6d77\u5916\u4ee3\u7406\u3001\u5ba2\u6237\u7801\u4e0e\u7968\u5355\u6570\u91cf\u3002" },
  { key: "announcements", no: "05", group: "business", groupLabel: "\u4e1a\u52a1\u4e0e\u8d26\u53f7", label: "\u901a\u77e5\u516c\u544a", description: "\u5f53\u65e5\u6d88\u606f\u4e0e\u53ef\u89c1\u6027", eyebrow: "Announcement Center", title: "\u901a\u77e5\u516c\u544a", subtitle: "\u4f7f\u7528\u53ef\u89c6\u5316\u5de5\u5177\u7f16\u8f91\u516c\u544a\u3001\u4e0a\u4f20\u56fe\u7247\u5e76\u914d\u7f6e\u5f53\u65e5\u53ef\u89c1\u8303\u56f4\u3002" },
  { key: "devices", no: "06", group: "security", groupLabel: "\u5b89\u5168\u4e0e\u8d44\u4ea7", label: "\u8bbe\u5907\u767b\u5f55", description: "IP \u4e0e\u5728\u7ebf\u8bbe\u5907", eyebrow: "Device Sessions", title: "\u8bbe\u5907\u4e0e\u767b\u5f55", subtitle: "\u67e5\u770b\u5f53\u524d\u767b\u5f55\u8bbe\u5907\u3001IP\u3001\u4f1a\u8bdd\u72b6\u6001\u5e76\u6267\u884c\u4e0b\u7ebf\u3002" },
  { key: "files", no: "07", group: "security", groupLabel: "\u5b89\u5168\u4e0e\u8d44\u4ea7", label: "\u7968\u5355\u6587\u4ef6", description: "\u4e1a\u52a1\u6587\u4ef6\u4e0e\u4e0a\u4f20\u8bb0\u5f55", eyebrow: "Shipment Documents", title: "\u7968\u5355\u6587\u4ef6", subtitle: "\u96c6\u4e2d\u67e5\u770b\u957f\u671f\u5173\u8054\u5230\u7968\u5355\u7684\u4e1a\u52a1\u6587\u4ef6\u4e0e\u4e0a\u4f20\u8bb0\u5f55\u3002" },
  { key: "system", no: "08", group: "settings", groupLabel: "\u7cfb\u7edf\u914d\u7f6e", label: "\u7cfb\u7edf\u7ba1\u7406", description: "\u7b56\u7565\u4e0e\u670d\u52a1\u72b6\u6001", eyebrow: "System Settings", title: "\u7cfb\u7edf\u7ba1\u7406", subtitle: "\u96c6\u4e2d\u653e\u7f6e\u8d26\u53f7\u7b56\u7565\u3001\u670d\u52a1\u72b6\u6001\u548c\u540e\u7eed\u8fd0\u7ef4\u5165\u53e3\u3002" }
];

const loading = ref(false);
const initialLoading = ref(false);
const message = ref("");
const hasError = ref(false);
const currentUser = ref(props.currentUser);
const employees = ref([]);
const employeeTotal = ref(0);
const employeePage = ref(1);
const employeePageSize = ref(20);
const platformInfo = ref(null);
const platformTotal = ref(0);
const platformPage = ref(1);
const platformPageSize = ref(20);
const announcements = ref([]);
const announcementTotal = ref(0);
const announcementPage = ref(1);
const announcementPageSize = ref(20);
const announcementsLoaded = ref(false);
const announcementDialogOpen = ref(false);
const editingAnnouncementId = ref("");
const announcementDialogError = ref("");
const announcementImageInputRef = ref(null);
const announcementEditorRef = ref(null);
const announcementImageUploading = ref(false);
const announcementImageDragging = ref(false);
const announcementImageInsertMode = ref("cover");
const announcementUploadedPath = ref("");
const announcementPreviewRecord = ref(null);
const announcementForm = reactive({
  title: "",
  contentMarkdown: "",
  imageUrl: "",
  illustrationRef: "",
  audience: "ALL",
  displayDate: ""
});
const devices = ref([]);
const deviceTotal = ref(0);
const devicePage = ref(1);
const devicePageSize = ref(20);
const apiAuditRows = ref([]);
const apiAuditTotal = ref(0);
const apiAuditPage = ref(1);
const apiAuditPageSize = ref(20);
const adminWorkspaceFiles = ref([]);
const adminWorkspaceFileTotal = ref(0);
const adminWorkspaceFilePage = ref(1);
const adminWorkspaceFilePageSize = ref(20);
const adminShipmentFiles = ref([]);
const adminShipmentFileTotal = ref(0);
const adminShipmentFilePage = ref(1);
const adminShipmentFilePageSize = ref(20);
const adminFilesLoaded = ref(false);
const includeExpiredFiles = ref(false);
const activeAdminFileSection = ref("shipment");
const monitoring = ref(null);
const systemOverview = ref(null);
const overviewActivityChartRef = ref(null);
const overviewUserChartRef = ref(null);
const overviewStatusChartRef = ref(null);
const overviewOperationChartRef = ref(null);
const llmSettings = ref(null);
const activeAdminPage = ref("overview");
const loginForm = reactive({ username: "admin", password: "" });
const employeeDialogOpen = ref(false);
const editingEmployeeId = ref("");
const employeeDialogError = ref("");
const employeeForm = reactive({
  username: "",
  displayName: "",
  password: "",
  passwordConfirm: "",
  role: "OVERSEA_AGENT",
  partyRole: "AGENT",
  status: "ACTIVE"
});
const temporaryPasswordDialog = reactive({
  open: false,
  username: "",
  password: "",
  copied: false
});
const filePreviewDialog = reactive({
  open: false,
  kind: "",
  name: "",
  url: "",
  text: "",
  message: "",
  isError: false
});
let filePreviewObjectUrl = null;
let announcementEditorRange = null;
const llmForm = reactive({
  enabled: true,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
  clearApiKey: false
});

const overviewChartInstances = {
  activity: null,
  users: null,
  status: null,
  operations: null
};

const OVERVIEW_COPY = {
  "zh-CN": {
    totalUsers: "\u7cfb\u7edf\u7528\u6237",
    totalUsersHint: "\u5185\u90e8 {internal} \u00b7 \u5ba2\u6237 {customers}",
    activeUsers: "\u6d3b\u8dc3\u8d26\u53f7",
    activeUsersHint: "\u5185\u90e8\u5458\u5de5\u4e0e\u5ba2\u6237\u5408\u8ba1",
    onlineDevices: "\u5728\u7ebf\u8bbe\u5907",
    onlineDevicesHint: "\u5f53\u524d\u6709\u6548\u4f1a\u8bdd\u8bbe\u5907",
    management30d: "\u8fd1 30 \u65e5\u7ba1\u7406\u64cd\u4f5c",
    management30dHint: "\u7528\u6237\u3001\u516c\u544a\u3001\u8bbe\u5907\u4e0e\u914d\u7f6e\u53d8\u66f4",
    todayActivity: "\u4eca\u65e5\u7cfb\u7edf\u6d3b\u52a8",
    todayActivityHint: "\u63a5\u53e3\u8bbf\u95ee\u4e0e\u7ba1\u7406\u64cd\u4f5c",
    activityTrend: "\u8fd1 7 \u65e5\u7cfb\u7edf\u6d3b\u52a8\u8d8b\u52bf",
    activityTrendHint: "\u63a5\u53e3\u8bbf\u95ee\u4e0e\u7ba1\u7406\u64cd\u4f5c\u6309\u65e5\u5bf9\u6bd4",
    userComposition: "\u7cfb\u7edf\u7528\u6237\u6784\u6210",
    accountStatus: "\u8d26\u53f7\u72b6\u6001",
    operationTypes: "\u8fd1 30 \u65e5\u7ba1\u7406\u64cd\u4f5c\u5206\u5e03",
    operationTypesHint: "\u4e0d\u542b\u666e\u901a\u63a5\u53e3\u8bbf\u95ee",
    apiRequests: "\u63a5\u53e3\u8bbf\u95ee",
    managementActions: "\u7ba1\u7406\u64cd\u4f5c",
    active: "\u6b63\u5e38",
    disabled: "\u5df2\u505c\u7528",
    noOperations: "\u6682\u65e0\u7ba1\u7406\u64cd\u4f5c",
    roles: {
      ADMIN: "\u7ba1\u7406\u5458",
      BUSINESS: "\u4e1a\u52a1\u5458",
      OVERSEA_AGENT: "\u6d77\u5916\u4ee3\u7406",
      CUSTOMER: "\u5ba2\u6237"
    },
    actions: {
      CREATE_USER: "\u65b0\u589e\u7528\u6237",
      UPDATE_USER: "\u4fee\u6539\u7528\u6237",
      RESET_PASSWORD: "\u91cd\u7f6e\u5bc6\u7801",
      DELETE_USER: "\u505c\u7528\u7528\u6237",
      KICK_DEVICE: "\u8bbe\u5907\u4e0b\u7ebf",
      DELETE_DEVICE: "\u5220\u9664\u8bbe\u5907",
      CREATE_ANNOUNCEMENT: "\u65b0\u589e\u516c\u544a",
      UPDATE_ANNOUNCEMENT: "\u4fee\u6539\u516c\u544a",
      PUBLISH_ANNOUNCEMENT: "\u53d1\u5e03\u516c\u544a",
      DISABLE_ANNOUNCEMENT: "\u505c\u7528\u516c\u544a",
      DELETE_ANNOUNCEMENT: "\u5220\u9664\u516c\u544a",
      UPLOAD_ANNOUNCEMENT_IMAGE: "\u4e0a\u4f20\u516c\u544a\u56fe\u7247",
      UPDATE_LLM_SETTINGS: "\u4fee\u6539\u6a21\u578b\u914d\u7f6e"
    }
  },
  "en-US": {
    totalUsers: "System users",
    totalUsersHint: "Internal {internal} \u00b7 Customers {customers}",
    activeUsers: "Active accounts",
    activeUsersHint: "Internal employees and customers",
    onlineDevices: "Online devices",
    onlineDevicesHint: "Devices with an active session",
    management30d: "30-day admin actions",
    management30dHint: "User, announcement, device, and settings changes",
    todayActivity: "Activity today",
    todayActivityHint: "API visits and management actions",
    activityTrend: "7-day system activity",
    activityTrendHint: "Daily API visits versus management actions",
    userComposition: "System user composition",
    accountStatus: "Account status",
    operationTypes: "30-day management actions",
    operationTypesHint: "Excludes routine API access",
    apiRequests: "API visits",
    managementActions: "Management actions",
    active: "Active",
    disabled: "Disabled",
    noOperations: "No management actions",
    roles: {
      ADMIN: "Administrators",
      BUSINESS: "Business",
      OVERSEA_AGENT: "Overseas agents",
      CUSTOMER: "Customers"
    },
    actions: {
      CREATE_USER: "Create user",
      UPDATE_USER: "Update user",
      RESET_PASSWORD: "Reset password",
      DELETE_USER: "Disable user",
      KICK_DEVICE: "Sign out device",
      DELETE_DEVICE: "Delete device",
      CREATE_ANNOUNCEMENT: "Create announcement",
      UPDATE_ANNOUNCEMENT: "Update announcement",
      PUBLISH_ANNOUNCEMENT: "Publish announcement",
      DISABLE_ANNOUNCEMENT: "Disable announcement",
      DELETE_ANNOUNCEMENT: "Delete announcement",
      UPLOAD_ANNOUNCEMENT_IMAGE: "Upload announcement image",
      UPDATE_LLM_SETTINGS: "Update model settings"
    }
  }
};

const PLATFORM_ACTION_COPY = {
  "zh-CN": {
    delete: "\u5220\u9664",
    cancel: "\u53d6\u6d88",
    confirm: "\u786e\u8ba4\u5220\u9664\u5ba2\u6237\u300c{name}\u300d\u5417\uff1f\u5220\u9664\u540e\u8be5\u5ba2\u6237\u5c06\u65e0\u6cd5\u767b\u5f55\uff0c\u5386\u53f2\u7968\u5355\u6570\u636e\u4f1a\u4fdd\u7559\u3002",
    success: "\u5ba2\u6237\u5df2\u5220\u9664"
  },
  "en-US": {
    delete: "Delete",
    cancel: "Cancel",
    confirm: "Delete customer “{name}”? The customer will no longer be able to sign in; historical shipment data is retained.",
    success: "Customer deleted"
  }
};

const ANNOUNCEMENT_EMOJIS = ["\ud83d\ude00", "\ud83d\ude80", "\ud83d\udce6", "\ud83d\udea2", "\u2705", "\u26a0\ufe0f", "\ud83d\udce2", "\ud83d\udca1", "\ud83d\udccd", "\ud83d\udcc5"];
const ANNOUNCEMENT_SYMBOLS = ["\u2022", "\u25e6", "\u2713", "\u2605", "\u2192", "\u203b", "\u2116", "\u2139", "\u00b7", "\u00a7"];

const ANNOUNCEMENT_COPY = {
  "zh-CN": {
    systemMessages: "\u7cfb\u7edf\u6d88\u606f",
    listTitle: "\u901a\u77e5\u516c\u544a\u7ba1\u7406",
    total: "\u5171 {count} \u6761\u516c\u544a",
    create: "\u65b0\u589e\u516c\u544a",
    refresh: "\u5237\u65b0",
    title: "\u516c\u544a\u6807\u9898",
    visibility: "\u53ef\u89c1\u8303\u56f4",
    displayDate: "\u5c55\u793a\u65e5\u671f",
    status: "\u72b6\u6001",
    updatedAt: "\u66f4\u65b0\u65f6\u95f4",
    actions: "\u64cd\u4f5c",
    preview: "\u9884\u89c8",
    edit: "\u7f16\u8f91",
    publish: "\u53d1\u5e03",
    deactivate: "\u505c\u7528",
    delete: "\u5220\u9664",
    empty: "\u6682\u65e0\u901a\u77e5\u516c\u544a",
    createTitle: "\u65b0\u589e\u901a\u77e5\u516c\u544a",
    editTitle: "\u7f16\u8f91\u901a\u77e5\u516c\u544a",
    close: "\u5173\u95ed",
    cancel: "\u53d6\u6d88",
    saveDraft: "\u4fdd\u5b58",
    titlePlaceholder: "\u4f8b\u5982\uff1a\u4eca\u65e5\u8d27\u8e2a\u5e73\u53f0\u5347\u7ea7\u901a\u77e5",
    coverImage: "\u516c\u544a\u56fe\u7247\uff08\u53ef\u9009\uff09",
    imageUrl: "\u6216\u4f7f\u7528\u5916\u90e8\u56fe\u7247 URL",
    uploadImage: "\u4e0a\u4f20\u5230\u7cfb\u7edf\u786c\u76d8",
    uploadingImage: "\u4e0a\u4f20\u4e2d\u2026",
    dropImage: "\u5c06\u56fe\u7247\u62d6\u5230\u8fd9\u91cc",
    chooseImage: "\u9009\u62e9\u56fe\u7247",
    uploadHint: "\u6216\u70b9\u51fb\u9009\u62e9 JPG\u3001PNG\u3001GIF\uff0c\u6700\u5927 10 MB\uff0c\u6587\u4ef6\u5b58\u5165\u7cfb\u7edf\u786c\u76d8\u3002",
    storagePath: "\u786c\u76d8\u5b58\u50a8\u8def\u5f84",
    uploadSuccess: "\u56fe\u7247\u5df2\u4e0a\u4f20\u5230\u7cfb\u7edf\u786c\u76d8",
    uploadFailed: "\u56fe\u7247\u4e0a\u4f20\u5931\u8d25",
    illustrationRef: "\u63d2\u56fe\u5f15\u7528/\u8bf4\u660e\uff08\u53ef\u9009\uff09",
    illustrationPlaceholder: "\u56fe\u7247\u6765\u6e90\u3001\u7248\u6743\u6216\u5185\u90e8\u7d20\u6750\u7f16\u53f7",
    content: "\u516c\u544a\u6b63\u6587",
    toolbar: "\u516c\u544a\u5bcc\u6587\u672c\u5de5\u5177\u680f",
    contentPlaceholder: "\u76f4\u63a5\u8f93\u5165\u516c\u544a\u6b63\u6587\uff0c\u7528\u4e0a\u65b9\u5de5\u5177\u9009\u62e9\u6807\u9898\u3001\u5217\u8868\u3001\u6807\u7b7e\u548c\u8868\u60c5\u3002",
    editorHint: "\u652f\u6301\u76f4\u63a5\u7f16\u8f91\u683c\u5f0f\uff1b\u56fe\u7247\u4e5f\u53ef\u62d6\u5165\u6b63\u6587\uff0c\u7cfb\u7edf\u4f1a\u5148\u4e0a\u4f20\u518d\u63d2\u5165\u3002",
    heading2: "\u4e8c\u7ea7\u6807\u9898",
    heading3: "\u4e09\u7ea7\u6807\u9898",
    bold: "\u52a0\u7c97",
    italic: "\u659c\u4f53",
    bulletList: "\u9879\u76ee\u7b26\u53f7",
    numberedList: "\u7f16\u53f7\u5217\u8868",
    quote: "\u5f15\u7528",
    link: "\u63d2\u5165\u94fe\u63a5",
    linkPrompt: "\u8bf7\u8f93\u5165 http/https \u94fe\u63a5",
    invalidLink: "\u94fe\u63a5\u5fc5\u987b\u4f7f\u7528 http \u6216 https\u3002",
    emoji: "\u8868\u60c5",
    symbol: "\u7b26\u53f7",
    tag: "\u5feb\u6377\u6807\u7b7e",
    undo: "\u64a4\u9500",
    redo: "\u91cd\u505a",
    clearFormat: "\u6e05\u9664\u683c\u5f0f",
    quickTags: ["\u3010\u91cd\u8981\u3011", "\u3010\u7d27\u6025\u3011", "\u3010\u66f4\u65b0\u3011", "\u3010\u7ef4\u62a4\u3011", "\u3010\u63d0\u9192\u3011", "\u3010\u901a\u77e5\u3011"],
    insertImage: "\u63d2\u5165\u56fe\u7247",
    livePreview: "\u5b9e\u65f6\u9884\u89c8",
    untitled: "\u672a\u547d\u540d\u516c\u544a",
    customer: "\u5ba2\u6237\u53ef\u89c1",
    employee: "\u5458\u5de5\u53ef\u89c1",
    all: "\u5168\u90e8\u53ef\u89c1",
    draft: "\u8349\u7a3f",
    published: "\u5df2\u53d1\u5e03",
    disabled: "\u5df2\u505c\u7528",
    required: "\u8bf7\u5b8c\u6574\u586b\u5199\u6807\u9898\u3001\u5c55\u793a\u65e5\u671f\u548c\u516c\u544a\u6b63\u6587\u3002",
    invalidImage: "\u5934\u56fe\u5730\u5740\u5fc5\u987b\u4e3a http/https URL \u6216\u7cfb\u7edf\u56fe\u7247\u8def\u5f84\u3002",
    created: "\u516c\u544a\u5df2\u521b\u5efa",
    updated: "\u516c\u544a\u5df2\u66f4\u65b0",
    publishedSuccess: "\u516c\u544a\u5df2\u53d1\u5e03",
    disabledSuccess: "\u516c\u544a\u5df2\u505c\u7528",
    deletedSuccess: "\u516c\u544a\u5df2\u5220\u9664",
    deleteConfirm: "\u786e\u8ba4\u5220\u9664\u516c\u544a\u300c{title}\u300d\u5417\uff1f",
    imageUrlNeeded: "\u8bf7\u5148\u4e0a\u4f20\u56fe\u7247\uff0c\u6216\u586b\u5199\u56fe\u7247 URL\u3002"
  },
  "en-US": {
    systemMessages: "System messages",
    listTitle: "Notification announcements",
    total: "{count} announcements",
    create: "New announcement",
    refresh: "Refresh",
    title: "Title",
    visibility: "Audience",
    displayDate: "Display date",
    status: "Status",
    updatedAt: "Updated",
    actions: "Actions",
    preview: "Preview",
    edit: "Edit",
    publish: "Publish",
    deactivate: "Disable",
    delete: "Delete",
    empty: "No announcements",
    createTitle: "Create announcement",
    editTitle: "Edit announcement",
    close: "Close",
    cancel: "Cancel",
    saveDraft: "Save",
    titlePlaceholder: "For example: Shipment tracking platform update",
    coverImage: "Announcement image (optional)",
    imageUrl: "Or use an external image URL",
    uploadImage: "Upload to system disk",
    uploadingImage: "Uploading\u2026",
    dropImage: "Drop an image here",
    chooseImage: "Choose image",
    uploadHint: "Or choose JPG, PNG, or GIF up to 10 MB. The file is stored on the system disk.",
    storagePath: "Disk storage path",
    uploadSuccess: "Image uploaded to the system disk",
    uploadFailed: "Image upload failed",
    illustrationRef: "Illustration reference (optional)",
    illustrationPlaceholder: "Source, copyright note, or internal asset reference",
    content: "Announcement content",
    toolbar: "Rich-text toolbar",
    contentPlaceholder: "Write directly, then choose headings, lists, tags, symbols, and emoji from the toolbar.",
    editorHint: "Format content directly. Images can also be dropped into the editor and will be uploaded before insertion.",
    heading2: "Heading 2",
    heading3: "Heading 3",
    bold: "Bold",
    italic: "Italic",
    bulletList: "Bulleted list",
    numberedList: "Numbered list",
    quote: "Quote",
    link: "Insert link",
    linkPrompt: "Enter an http/https link",
    invalidLink: "Links must use http or https.",
    emoji: "Emoji",
    symbol: "Symbols",
    tag: "Quick tags",
    undo: "Undo",
    redo: "Redo",
    clearFormat: "Clear formatting",
    quickTags: ["[Important]", "[Urgent]", "[Update]", "[Maintenance]", "[Reminder]", "[Notice]"],
    insertImage: "Insert image",
    livePreview: "Live preview",
    untitled: "Untitled announcement",
    customer: "Customers",
    employee: "Employees",
    all: "Everyone",
    draft: "Draft",
    published: "Published",
    disabled: "Disabled",
    required: "Title, display date, and announcement content are required.",
    invalidImage: "The cover image must use an http/https URL or a system image path.",
    created: "Announcement created",
    updated: "Announcement updated",
    publishedSuccess: "Announcement published",
    disabledSuccess: "Announcement disabled",
    deletedSuccess: "Announcement deleted",
    deleteConfirm: "Delete announcement “{title}”?",
    imageUrlNeeded: "Upload an image or enter an image URL first."
  }
};
const announcementCopy = computed(() =>
  ANNOUNCEMENT_COPY[currentLocale.value === "en-US" ? "en-US" : "zh-CN"]
);
const overviewCopy = computed(() =>
  OVERVIEW_COPY[currentLocale.value === "en-US" ? "en-US" : "zh-CN"]
);
const platformActionCopy = computed(() =>
  PLATFORM_ACTION_COPY[currentLocale.value === "en-US" ? "en-US" : "zh-CN"]
);
const announcementQuickTags = computed(() => announcementCopy.value.quickTags);

const adminPages = computed(() => rawAdminPages.map((item) => ({
  ...item,
  label: item.labelKey ? ui(item.labelKey) : tr(item.label),
  description: item.descriptionKey ? ui(item.descriptionKey) : tr(item.description),
  title: item.titleKey ? ui(item.titleKey) : tr(item.title),
  subtitle: item.subtitleKey ? ui(item.subtitleKey) : tr(item.subtitle)
})));
const activePageMeta = computed(() =>
  adminPages.value.find((item) => item.key === activeAdminPage.value) || adminPages.value[0]
);
const displayAdminName = computed(() => repairMojibake(currentUser.value?.displayName || "管理员"));
const normalizedEmployees = computed(() => employees.value.map(normalizeDisplayName));
const normalizedDevices = computed(() => devices.value.map(normalizeDisplayName));
const pagedEmployees = computed(() => normalizedEmployees.value);
const pagedDevices = computed(() => normalizedDevices.value);
const onlineDevices = computed(() => normalizedDevices.value.filter((device) => device.online));
const editingEmployeeIsSelf = computed(() =>
  Boolean(editingEmployeeId.value)
  && String(editingEmployeeId.value) === String(currentUser.value?.id)
);
const platformCustomers = computed(() => platformInfo.value?.items || []);
const pagedPlatformCustomers = computed(() => platformCustomers.value);
const announcementEditorPreviewHtml = computed(() =>
  renderAnnouncementMarkdown(announcementForm.contentMarkdown)
);
const llmStatusText = computed(() => {
  if (!llmSettings.value) return tr("未加载");
  if (!llmSettings.value.enabled) return tr("已关闭");
  return tr(llmSettings.value.apiKeyConfigured ? "已启用" : "缺少 Key");
});

onMounted(async () => {
  window.addEventListener("resize", resizeOverviewCharts);
  if (storedAdminToken()) {
    initialLoading.value = true;
    try {
      await loadDashboard(false, false);
    } finally {
      initialLoading.value = false;
    }
  }
  await nextTick();
  renderOverviewCharts();
});

onUnmounted(() => {
  window.removeEventListener("resize", resizeOverviewCharts);
  Object.values(overviewChartInstances).forEach((chart) => chart?.dispose());
});

watch(() => props.currentUser, (user) => {
  currentUser.value = user;
}, { immediate: true });

watch(activeAdminPage, async (page) => {
  if (page !== "overview") return;
  await nextTick();
  renderOverviewCharts();
});

watch(currentLocale, async () => {
  if (activeAdminPage.value !== "overview") return;
  await nextTick();
  renderOverviewCharts();
});

watch(() => employeeForm.role, (role) => {
  employeeForm.partyRole = "AGENT";
});

async function handleLogin() {
  if (loading.value) return;
  await withLoading(async () => {
    const response = await loginAdmin(loginForm.username, loginForm.password);
    if (response.user.role !== "ADMIN") {
      clearAdminToken();
      throw new Error("当前账号不是管理员");
    }
    currentUser.value = normalizeDisplayName(response.user);
    await loadDashboard(false);
    showMessage("登录成功");
  });
}

async function handleLogout() {
  emit("logout");
}

async function loadDashboard(showSuccess = true, refreshUser = true) {
  await withLoading(async () => {
    if (refreshUser) {
      currentUser.value = normalizeDisplayName(await fetchAdminMe());
      emit("user-updated", currentUser.value);
    }
    const [
      employeeData,
      deviceData,
      monitoringData,
      overviewData,
      platformData,
      auditData,
      llmData
    ] = await Promise.all([
      fetchEmployees({ page: employeePage.value - 1, size: employeePageSize.value }),
      fetchDevices({ page: devicePage.value - 1, size: devicePageSize.value }),
      fetchMonitoring(),
      fetchAdminOverview(),
      fetchPlatformInfo({ page: platformPage.value - 1, size: platformPageSize.value }),
      fetchAuditLog({ page: apiAuditPage.value - 1, size: apiAuditPageSize.value }),
      fetchLlmSettings()
    ]);
    employees.value = Array.isArray(employeeData?.items) ? employeeData.items : [];
    employeeTotal.value = Number(employeeData?.total || 0);
    devices.value = Array.isArray(deviceData?.items) ? deviceData.items : [];
    deviceTotal.value = Number(deviceData?.total || 0);
    monitoring.value = monitoringData;
    systemOverview.value = overviewData;
    platformInfo.value = platformData;
    platformTotal.value = Number(platformData?.total || 0);
    apiAuditRows.value = Array.isArray(auditData?.items) ? auditData.items : [];
    apiAuditTotal.value = Number(auditData?.total || 0);
    llmSettings.value = llmData;
    if (activeAdminPage.value === "files") await loadAdminFileListsWithoutLoading();
    if (activeAdminPage.value === "announcements") await loadAnnouncementPageWithoutLoading();
    syncLlmForm(llmData);
    await nextTick();
    renderOverviewCharts();
    if (showSuccess) showMessage("后台数据已刷新");
  });
}

function selectAdminPage(page) {
  activeAdminPage.value = page;
  if (page === "files" && !adminFilesLoaded.value) {
    void withLoading(loadAdminFileListsWithoutLoading);
  }
  if (page === "announcements" && !announcementsLoaded.value) {
    void withLoading(loadAnnouncementPageWithoutLoading);
  }
}

function renderOverviewCharts() {
  if (activeAdminPage.value !== "overview" || !systemOverview.value) return;
  const activityChart = ensureOverviewChart(
    "activity",
    overviewActivityChartRef.value
  );
  const userChart = ensureOverviewChart("users", overviewUserChartRef.value);
  const statusChart = ensureOverviewChart("status", overviewStatusChartRef.value);
  const operationChart = ensureOverviewChart(
    "operations",
    overviewOperationChartRef.value
  );
  if (!activityChart || !userChart || !statusChart || !operationChart) return;

  const trend = Array.isArray(systemOverview.value.activityTrend)
    ? systemOverview.value.activityTrend
    : [];
  activityChart.setOption({
    animationDuration: 450,
    color: ["#2f80d1", "#e49a32"],
    tooltip: { trigger: "axis" },
    legend: {
      bottom: 0,
      itemWidth: 18,
      textStyle: { color: "#61758b", fontSize: 11 }
    },
    grid: { left: 45, right: 22, top: 22, bottom: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.map((item) => formatOverviewDate(item.date)),
      axisLine: { lineStyle: { color: "#ccd8e5" } },
      axisLabel: { color: "#6c8197" }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#edf2f7" } },
      axisLabel: { color: "#8495a7" }
    },
    series: [
      {
        name: overviewCopy.value.apiRequests,
        type: "line",
        smooth: true,
        symbolSize: 7,
        areaStyle: { color: "rgba(47, 128, 209, .10)" },
        data: trend.map((item) => Number(item.apiRequests || 0))
      },
      {
        name: overviewCopy.value.managementActions,
        type: "line",
        smooth: true,
        symbolSize: 7,
        areaStyle: { color: "rgba(228, 154, 50, .08)" },
        data: trend.map((item) => Number(item.managementActions || 0))
      }
    ]
  }, true);

  userChart.setOption(overviewDonutOption(
    (systemOverview.value.userComposition || []).map((item) => ({
      name: overviewCopy.value.roles[item.code] || item.code,
      value: Number(item.value || 0)
    })),
    ["#2f80d1", "#48a8cf", "#7a6bd1", "#42a878"]
  ), true);

  statusChart.setOption(overviewDonutOption(
    (systemOverview.value.accountStatus || []).map((item) => ({
      name: item.code === "ACTIVE" ? overviewCopy.value.active : overviewCopy.value.disabled,
      value: Number(item.value || 0)
    })),
    ["#35a477", "#c8d2dd"]
  ), true);

  const operationItems = Array.isArray(systemOverview.value.operationTypes)
    ? systemOverview.value.operationTypes
    : [];
  const displayOperations = operationItems.length
    ? [...operationItems].reverse()
    : [{ code: "EMPTY", value: 0 }];
  operationChart.setOption({
    animationDuration: 450,
    color: ["#4f8ecf"],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (items) => {
        const item = items?.[0];
        return `${item?.name || ""}<br>${overviewCopy.value.managementActions}: ${item?.value || 0}`;
      }
    },
    grid: { left: 138, right: 28, top: 16, bottom: 28 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#edf2f7" } },
      axisLabel: { color: "#8495a7" }
    },
    yAxis: {
      type: "category",
      data: displayOperations.map((item) => operationActionLabel(item.code)),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#536b82", fontSize: 11 }
    },
    series: [{
      type: "bar",
      barMaxWidth: 22,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      data: displayOperations.map((item) => Number(item.value || 0))
    }]
  }, true);
}

function ensureOverviewChart(key, element) {
  if (!element) return null;
  const existing = overviewChartInstances[key];
  if (existing?.getDom() === element && !existing.isDisposed()) return existing;
  existing?.dispose();
  overviewChartInstances[key] = initEChart(element);
  return overviewChartInstances[key];
}

function overviewDonutOption(data, colors) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return {
    animationDuration: 450,
    color: colors,
    tooltip: { trigger: "item", formatter: "{b}<br>{c} ({d}%)" },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: "#61758b", fontSize: 10 }
    },
    series: [{
      type: "pie",
      radius: ["49%", "70%"],
      center: ["50%", "44%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 4 },
      label: {
        color: "#536b82",
        formatter: total ? "{b}\n{c}" : overviewCopy.value.noOperations
      },
      labelLine: { length: 10, length2: 8 },
      data
    }]
  };
}

function operationActionLabel(code) {
  if (code === "EMPTY") return overviewCopy.value.noOperations;
  return overviewCopy.value.actions[code]
    || String(code || "-").toLowerCase().replaceAll("_", " ");
}

function formatOverviewDate(value) {
  const parts = String(value || "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : String(value || "-");
}

function resizeOverviewCharts() {
  Object.values(overviewChartInstances).forEach((chart) => chart?.resize());
}

async function loadEmployeePage() {
  const data = await fetchEmployees({
    page: employeePage.value - 1,
    size: employeePageSize.value
  });
  employees.value = Array.isArray(data?.items) ? data.items : [];
  employeeTotal.value = Number(data?.total || 0);
}

async function loadDevicePage() {
  const data = await fetchDevices({
    page: devicePage.value - 1,
    size: devicePageSize.value
  });
  devices.value = Array.isArray(data?.items) ? data.items : [];
  deviceTotal.value = Number(data?.total || 0);
}

async function loadPlatformPage() {
  const data = await fetchPlatformInfo({
    page: platformPage.value - 1,
    size: platformPageSize.value
  });
  platformInfo.value = data;
  platformTotal.value = Number(data?.total || 0);
}

async function loadAnnouncementPageWithoutLoading() {
  const data = await fetchAdminAnnouncements({
    page: announcementPage.value - 1,
    size: announcementPageSize.value
  });
  announcements.value = Array.isArray(data?.items) ? data.items : [];
  announcementTotal.value = Number(data?.total ?? announcements.value.length);
  announcementsLoaded.value = true;
}

async function loadAnnouncementPage() {
  await withLoading(loadAnnouncementPageWithoutLoading);
}

async function loadApiAuditPage() {
  const data = await fetchAuditLog({
    page: apiAuditPage.value - 1,
    size: apiAuditPageSize.value
  });
  apiAuditRows.value = Array.isArray(data?.items) ? data.items : [];
  apiAuditTotal.value = Number(data?.total || 0);
}

async function changeEmployeePage(page) {
  employeePage.value = page;
  await withLoading(loadEmployeePage);
}

async function changeEmployeePageSize(size) {
  employeePageSize.value = size;
  employeePage.value = 1;
  await withLoading(loadEmployeePage);
}

async function changeDevicePage(page) {
  devicePage.value = page;
  await withLoading(loadDevicePage);
}

async function changeDevicePageSize(size) {
  devicePageSize.value = size;
  devicePage.value = 1;
  await withLoading(loadDevicePage);
}

async function changePlatformPage(page) {
  platformPage.value = page;
  await withLoading(loadPlatformPage);
}

async function changePlatformPageSize(size) {
  platformPageSize.value = size;
  platformPage.value = 1;
  await withLoading(loadPlatformPage);
}

async function handleDeletePlatformCustomer(row) {
  const name = row?.customerDisplayName || row?.customerUsername || row?.customerId || "-";
  const prompt = platformActionCopy.value.confirm.replace("{name}", name);
  try {
    await ElMessageBox.confirm(prompt, platformActionCopy.value.delete, {
      type: "warning",
      confirmButtonText: platformActionCopy.value.delete,
      cancelButtonText: platformActionCopy.value.cancel,
      customClass: "admin-error-message-box"
    });
  } catch {
    return;
  }
  await withLoading(async () => {
    await deletePlatformCustomer(row.customerId);
    if (platformCustomers.value.length === 1 && platformPage.value > 1) {
      platformPage.value -= 1;
    }
    await loadPlatformPage();
    showMessage(platformActionCopy.value.success);
  }, { popupError: true });
}

async function changeAnnouncementPage(page) {
  announcementPage.value = page;
  await withLoading(loadAnnouncementPageWithoutLoading);
}

async function changeAnnouncementPageSize(size) {
  announcementPageSize.value = size;
  announcementPage.value = 1;
  await withLoading(loadAnnouncementPageWithoutLoading);
}

async function changeApiAuditPage(page) {
  apiAuditPage.value = page;
  await withLoading(loadApiAuditPage);
}

async function changeApiAuditPageSize(size) {
  apiAuditPageSize.value = size;
  apiAuditPage.value = 1;
  await withLoading(loadApiAuditPage);
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function announcementAudience(record) {
  return String(record?.audience || record?.visibility || "ALL").toUpperCase();
}

function announcementVisibilityLabel(audience) {
  return {
    CUSTOMER: announcementCopy.value.customer,
    EMPLOYEE: announcementCopy.value.employee,
    ALL: announcementCopy.value.all
  }[String(audience || "ALL").toUpperCase()] || announcementCopy.value.all;
}

function announcementStatusLabel(status) {
  return {
    DRAFT: announcementCopy.value.draft,
    PUBLISHED: announcementCopy.value.published,
    DISABLED: announcementCopy.value.disabled
  }[String(status || "DRAFT").toUpperCase()] || announcementCopy.value.draft;
}

function resetAnnouncementForm() {
  announcementForm.title = "";
  announcementForm.contentMarkdown = "";
  announcementForm.imageUrl = "";
  announcementUploadedPath.value = "";
  announcementForm.illustrationRef = "";
  announcementForm.audience = "ALL";
  announcementForm.displayDate = todayDateString();
  announcementImageInsertMode.value = "cover";
  announcementImageDragging.value = false;
  announcementEditorRange = null;
  if (announcementEditorRef.value) announcementEditorRef.value.innerHTML = "";
}

function openAnnouncementEditor(record = null) {
  announcementDialogError.value = "";
  editingAnnouncementId.value = record?.id || "";
  announcementForm.title = record?.title || "";
  announcementForm.contentMarkdown = record?.contentMarkdown || "";
  announcementForm.imageUrl = record?.imageUrl || "";
  announcementUploadedPath.value = String(record?.imageUrl || "").startsWith("/api/public/announcement-images/")
    ? String(record.imageUrl).replace("/api/public/", "")
    : "";
  announcementForm.illustrationRef = record?.illustrationRef || "";
  announcementForm.audience = announcementAudience(record);
  announcementForm.displayDate = record?.displayDate || todayDateString();
  announcementDialogOpen.value = true;
  void nextTick(syncAnnouncementEditorFromMarkdown);
}

function closeAnnouncementEditor() {
  announcementDialogOpen.value = false;
  editingAnnouncementId.value = "";
  announcementDialogError.value = "";
  resetAnnouncementForm();
}

function openAnnouncementPreview(record) {
  announcementPreviewRecord.value = { ...record };
}

function closeAnnouncementPreview() {
  announcementPreviewRecord.value = null;
}

function chooseAnnouncementImage(mode = "cover") {
  announcementImageInsertMode.value = mode;
  announcementImageInputRef.value?.click();
}

function handleAnnouncementImageDragLeave(event) {
  if (event?.currentTarget?.contains(event?.relatedTarget)) return;
  announcementImageDragging.value = false;
}

function handleAnnouncementCoverDrop(event) {
  announcementImageDragging.value = false;
  const file = announcementImageFileFrom(event?.dataTransfer?.files);
  if (!file) return;
  void uploadAnnouncementImageFile(file, { insertIntoEditor: false });
}

async function handleAnnouncementImageUpload(event) {
  const input = event?.target;
  const file = announcementImageFileFrom(input?.files);
  if (!file) {
    if (input) input.value = "";
    return;
  }
  await uploadAnnouncementImageFile(file, {
    insertIntoEditor: announcementImageInsertMode.value === "body"
  });
  if (input) input.value = "";
}

function announcementImageFileFrom(files) {
  return Array.from(files || []).find((file) =>
    /^image\/(?:jpeg|png|gif)$/i.test(file?.type || "")
    || /\.(?:jpe?g|png|gif)$/i.test(file?.name || "")
  );
}

async function uploadAnnouncementImageFile(file, { insertIntoEditor = false } = {}) {
  if (!file || announcementImageUploading.value) return;
  announcementDialogError.value = "";
  announcementImageUploading.value = true;
  try {
    const uploaded = await uploadAdminAnnouncementImage(file);
    const uploadedUrl = String(uploaded?.url || "");
    if (!insertIntoEditor) announcementForm.imageUrl = uploadedUrl;
    announcementUploadedPath.value = String(uploaded?.storagePath || "");
    if (!announcementForm.illustrationRef.trim()) {
      announcementForm.illustrationRef = String(uploaded?.originalName || file.name || "");
    }
    if (insertIntoEditor) {
      insertAnnouncementImageIntoEditor(
        uploadedUrl,
        String(uploaded?.originalName || file.name || "")
      );
    }
    showMessage(announcementCopy.value.uploadSuccess);
  } catch (error) {
    markApiErrorHandled(error);
    announcementDialogError.value = error?.message || announcementCopy.value.uploadFailed;
  } finally {
    announcementImageUploading.value = false;
    announcementImageInsertMode.value = "cover";
  }
}

function announcementPayload() {
  return {
    title: announcementForm.title.trim(),
    contentMarkdown: announcementForm.contentMarkdown.trim(),
    imageUrl: announcementForm.imageUrl.trim() || null,
    illustrationRef: announcementForm.illustrationRef.trim() || null,
    audience: announcementForm.audience,
    displayDate: announcementForm.displayDate
  };
}

function validateAnnouncementForm() {
  announcementDialogError.value = "";
  if (!announcementForm.title.trim() || !announcementForm.contentMarkdown.trim() || !announcementForm.displayDate) {
    announcementDialogError.value = announcementCopy.value.required;
    return false;
  }
  if (announcementForm.imageUrl.trim() && !safeAnnouncementUrl(announcementForm.imageUrl)) {
    announcementDialogError.value = announcementCopy.value.invalidImage;
    return false;
  }
  return true;
}

async function handleSaveAnnouncement() {
  if (!validateAnnouncementForm()) return;
  await withLoading(async () => {
    const wasEditing = Boolean(editingAnnouncementId.value);
    if (wasEditing) {
      await updateAdminAnnouncement(editingAnnouncementId.value, announcementPayload());
    } else {
      await createAdminAnnouncement(announcementPayload());
    }
    closeAnnouncementEditor();
    await loadAnnouncementPageWithoutLoading();
    showMessage(wasEditing ? announcementCopy.value.updated : announcementCopy.value.created);
  }, { popupError: true });
}

async function handlePublishAnnouncement(record) {
  await withLoading(async () => {
    await publishAdminAnnouncement(record.id);
    await loadAnnouncementPageWithoutLoading();
    showMessage(announcementCopy.value.publishedSuccess);
  }, { popupError: true });
}

async function handleDeactivateAnnouncement(record) {
  await withLoading(async () => {
    await disableAdminAnnouncement(record.id);
    await loadAnnouncementPageWithoutLoading();
    showMessage(announcementCopy.value.disabledSuccess);
  }, { popupError: true });
}

async function handleDeleteAnnouncement(record) {
  const title = record?.title || announcementCopy.value.untitled;
  const prompt = announcementCopy.value.deleteConfirm.replace("{title}", title);
  try {
    await ElMessageBox.confirm(prompt, announcementCopy.value.delete, {
      type: "warning",
      confirmButtonText: announcementCopy.value.delete,
      cancelButtonText: announcementCopy.value.cancel,
      customClass: "admin-error-message-box"
    });
  } catch {
    return;
  }
  await withLoading(async () => {
    await deleteAdminAnnouncement(record.id);
    if (announcements.value.length === 1 && announcementPage.value > 1) {
      announcementPage.value -= 1;
    }
    await loadAnnouncementPageWithoutLoading();
    showMessage(announcementCopy.value.deletedSuccess);
  }, { popupError: true });
}

function syncAnnouncementEditorFromMarkdown() {
  const editor = announcementEditorRef.value;
  if (!editor) return;
  editor.innerHTML = renderAnnouncementMarkdown(announcementForm.contentMarkdown);
  announcementEditorRange = null;
}

function syncAnnouncementMarkdownFromEditor() {
  const editor = announcementEditorRef.value;
  if (!editor) return;
  announcementForm.contentMarkdown = announcementEditorToMarkdown(editor);
  rememberAnnouncementEditorSelection();
}

function rememberAnnouncementEditorSelection() {
  const editor = announcementEditorRef.value;
  const selection = window.getSelection?.();
  if (!editor || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;
  if (node === editor || editor.contains(node)) {
    announcementEditorRange = range.cloneRange();
  }
}

function restoreAnnouncementEditorSelection() {
  const editor = announcementEditorRef.value;
  if (!editor) return false;
  editor.focus();
  const selection = window.getSelection?.();
  if (!selection) return false;
  selection.removeAllRanges();
  if (announcementEditorRange) {
    try {
      selection.addRange(announcementEditorRange);
      return true;
    } catch {
      announcementEditorRange = null;
    }
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.addRange(range);
  announcementEditorRange = range.cloneRange();
  return true;
}

function applyAnnouncementFormat(command, value = null) {
  if (!restoreAnnouncementEditorSelection()) return;
  document.execCommand(command, false, value);
  syncAnnouncementMarkdownFromEditor();
}

function insertAnnouncementEditorText(value) {
  if (!restoreAnnouncementEditorSelection()) return;
  document.execCommand("insertText", false, String(value || ""));
  syncAnnouncementMarkdownFromEditor();
}

function insertAnnouncementEditorHtml(html) {
  if (!restoreAnnouncementEditorSelection()) return;
  document.execCommand("insertHTML", false, html);
  syncAnnouncementMarkdownFromEditor();
}

function insertAnnouncementLink() {
  rememberAnnouncementEditorSelection();
  const entered = window.prompt(announcementCopy.value.linkPrompt, "https://");
  if (!entered) return;
  const url = safeAnnouncementUrl(entered);
  if (!url) {
    announcementDialogError.value = announcementCopy.value.invalidLink;
    return;
  }
  announcementDialogError.value = "";
  if (!restoreAnnouncementEditorSelection()) return;
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed) {
    document.execCommand("createLink", false, url);
  } else {
    insertAnnouncementEditorHtml(
      `<a href="${escapeAnnouncementHtml(url)}">${escapeAnnouncementHtml(url)}</a>`
    );
    return;
  }
  syncAnnouncementMarkdownFromEditor();
}

function insertAnnouncementImageIntoEditor(source = "", altText = "") {
  const rawSource = String(source || announcementForm.imageUrl || "").trim();
  const url = safeAnnouncementUrl(rawSource);
  if (!url) {
    chooseAnnouncementImage("body");
    return;
  }
  announcementDialogError.value = "";
  const alt = String(
    altText
      || announcementForm.illustrationRef
      || announcementForm.title
      || "illustration"
  ).replace(/[\[\]]/g, "");
  const storedSource = announcementPortableUrl(rawSource, url);
  insertAnnouncementEditorHtml(
    `<img src="${escapeAnnouncementHtml(storedSource)}" alt="${escapeAnnouncementHtml(alt)}">`
  );
}

function handleAnnouncementEditorPaste(event) {
  event.preventDefault();
  rememberAnnouncementEditorSelection();
  const text = event.clipboardData?.getData("text/plain") || "";
  insertAnnouncementEditorText(text);
}

function handleAnnouncementEditorDrop(event) {
  const file = announcementImageFileFrom(event?.dataTransfer?.files);
  if (!file) return;
  event.preventDefault();
  const range = announcementDropRange(event);
  if (range) announcementEditorRange = range;
  void uploadAnnouncementImageFile(file, { insertIntoEditor: true });
}

function announcementDropRange(event) {
  const editor = announcementEditorRef.value;
  if (!editor) return null;
  let range = document.caretRangeFromPoint?.(event.clientX, event.clientY) || null;
  if (!range && document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (!range) return null;
  const node = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;
  return node === editor || editor.contains(node) ? range.cloneRange() : null;
}

function announcementEditorToMarkdown(editor) {
  const blocks = Array.from(editor.childNodes)
    .map((node) => announcementBlockToMarkdown(node))
    .filter((value) => value.trim());
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function announcementBlockToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return announcementTextValue(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    const level = Math.max(1, Math.min(4, Number(tag.slice(1))));
    return `${"#".repeat(level)} ${announcementInlineChildren(node).trim()}`;
  }
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children)
      .filter((item) => item.tagName?.toLowerCase() === "li")
      .map((item, index) => `${tag === "ol" ? `${index + 1}.` : "-"} ${announcementInlineChildren(item).trim()}`)
      .join("\n");
  }
  if (tag === "blockquote") {
    return announcementInlineChildren(node)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (tag === "pre") return `\`\`\`\n${node.textContent || ""}\n\`\`\``;
  if (tag === "br") return "";
  return announcementInlineChildren(node).trim();
}

function announcementInlineChildren(node) {
  return Array.from(node.childNodes).map(announcementInlineNodeToMarkdown).join("");
}

function announcementInlineNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return announcementTextValue(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const content = announcementInlineChildren(node);
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return content ? `**${content}**` : "";
  if (tag === "em" || tag === "i") return content ? `*${content}*` : "";
  if (tag === "code") return content ? `\`${content}\`` : "";
  if (tag === "a") {
    const raw = node.getAttribute("href") || "";
    const safe = safeAnnouncementUrl(raw);
    return safe ? `[${content || safe}](${announcementPortableUrl(raw, safe)})` : content;
  }
  if (tag === "img") {
    const raw = node.getAttribute("src") || "";
    const safe = safeAnnouncementUrl(raw);
    const alt = String(node.getAttribute("alt") || "illustration").replace(/[\[\]]/g, "");
    return safe ? `![${alt}](${announcementPortableUrl(raw, safe)})` : "";
  }
  return content;
}

function announcementTextValue(value) {
  return String(value || "").replace(/\u00a0/g, " ");
}

function announcementPortableUrl(raw, safe) {
  try {
    const parsed = new URL(safe, window.location.origin);
    if (parsed.origin === window.location.origin
        && parsed.pathname.startsWith("/api/public/announcement-images/")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return safe;
  }
  return String(raw || "").trim() || safe;
}

function safeAnnouncementUrl(value) {
  const source = String(value || "").trim().replace(/&amp;/g, "&");
  if (!source) return "";
  try {
    const url = new URL(source, window.location.origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const storedImage = url.pathname.match(
      /\/(?:tracking\/)?api\/public\/announcement-images\/([a-f0-9]{32}\.(?:jpe?g|png|gif))$/i
    );
    if (storedImage) {
      return new URL(`/api/public/announcement-images/${storedImage[1]}`, window.location.origin).href;
    }
    return url.href;
  } catch {
    return "";
  }
}

function announcementImageUrl(record) {
  return safeAnnouncementUrl(record?.imageUrl);
}

function announcementExcerpt(value) {
  const text = String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 72 ? `${text.slice(0, 72)}…` : (text || "-");
}

function escapeAnnouncementHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAnnouncementInline(value) {
  const tokens = [];
  const stash = (html) => {
    const index = tokens.push(html) - 1;
    return `\u0000${index}\u0000`;
  };
  let output = escapeAnnouncementHtml(value);
  output = output.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`));
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, source) => {
    const url = safeAnnouncementUrl(source);
    if (!url) return match;
    return stash(`<img src="${escapeAnnouncementHtml(url)}" alt="${escapeAnnouncementHtml(alt)}" loading="lazy">`);
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, source) => {
    const url = safeAnnouncementUrl(source);
    if (!url) return match;
    return stash(`<a href="${escapeAnnouncementHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });
  output = output
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return output.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
}

function renderAnnouncementMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let listType = "";
  let codeLines = null;
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (codeLines) {
        html.push(`<pre><code>${escapeAnnouncementHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        closeList();
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${renderAnnouncementInline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${nextType}>`);
      }
      html.push(`<li>${renderAnnouncementInline((unordered || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    const quote = line.match(/^\s*>\s?(.+)$/);
    html.push(quote
      ? `<blockquote>${renderAnnouncementInline(quote[1])}</blockquote>`
      : `<p>${renderAnnouncementInline(line)}</p>`);
  }
  if (codeLines) html.push(`<pre><code>${escapeAnnouncementHtml(codeLines.join("\n"))}</code></pre>`);
  closeList();
  return html.join("");
}

async function loadAdminFileListsWithoutLoading() {
  const [workspaceResult, shipmentResult] = await Promise.allSettled([
    fetchAdminWorkspaceFiles({
      page: adminWorkspaceFilePage.value - 1,
      size: adminWorkspaceFilePageSize.value,
      includeExpired: includeExpiredFiles.value
    }),
    fetchAdminShipmentFiles({
      page: adminShipmentFilePage.value - 1,
      size: adminShipmentFilePageSize.value,
      includeDeleted: true
    })
  ]);
  if (workspaceResult.status === "fulfilled") {
    const data = workspaceResult.value;
    adminWorkspaceFiles.value = Array.isArray(data?.items) ? data.items : [];
    adminWorkspaceFileTotal.value = Number(data?.total ?? adminWorkspaceFiles.value.length);
  }
  if (shipmentResult.status === "fulfilled") {
    const data = shipmentResult.value;
    adminShipmentFiles.value = Array.isArray(data?.items) ? data.items : [];
    adminShipmentFileTotal.value = Number(data?.total ?? adminShipmentFiles.value.length);
  }
  adminFilesLoaded.value = workspaceResult.status === "fulfilled" && shipmentResult.status === "fulfilled";
  const failed = [workspaceResult, shipmentResult].find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

function openEmployeeDialog(user = null) {
  employeeDialogError.value = "";
  editingEmployeeId.value = user?.id || "";
  employeeForm.username = user?.username || "";
  employeeForm.displayName = user?.displayName || "";
  employeeForm.password = "";
  employeeForm.passwordConfirm = "";
  employeeForm.role = user?.role || "OVERSEA_AGENT";
  employeeForm.partyRole = user?.partyRole || "AGENT";
  employeeForm.status = user?.status || "ACTIVE";
  employeeDialogOpen.value = true;
}

function closeEmployeeDialog() {
  employeeDialogError.value = "";
  employeeDialogOpen.value = false;
  editingEmployeeId.value = "";
  employeeForm.username = "";
  employeeForm.displayName = "";
  employeeForm.password = "";
  employeeForm.passwordConfirm = "";
  employeeForm.role = "OVERSEA_AGENT";
  employeeForm.partyRole = "AGENT";
  employeeForm.status = "ACTIVE";
}

async function handleSaveEmployee() {
  employeeDialogError.value = "";
  const passwordProvided = Boolean(employeeForm.password || employeeForm.passwordConfirm);
  if ((!editingEmployeeId.value || passwordProvided) && !isStrongEmployeePassword(employeeForm.password)) {
    employeeDialogError.value = t("admin.employee.passwordRuleError");
    return;
  }
  if ((!editingEmployeeId.value || passwordProvided)
      && employeeForm.password !== employeeForm.passwordConfirm) {
    employeeDialogError.value = t("admin.employee.passwordMismatch");
    return;
  }
  await withLoading(async () => {
    const wasEditing = Boolean(editingEmployeeId.value);
    if (wasEditing) {
      await updateEmployee(editingEmployeeId.value, {
        displayName: employeeForm.displayName,
        role: employeeForm.role,
        partyRole: employeeForm.partyRole,
        status: employeeForm.status,
        password: employeeForm.password || null
      });
    } else {
      const { passwordConfirm, ...payload } = employeeForm;
      await createEmployee(payload);
    }
    closeEmployeeDialog();
    await loadDashboard(false);
    showMessage(t(wasEditing ? "admin.employee.saved" : "admin.employee.created"));
  }, { popupError: true });
}

function isStrongEmployeePassword(value) {
  const password = String(value || "");
  const knownLegacyPassword = password === "123456" || password === "Admin@123456";
  return !knownLegacyPassword
    && password.length >= 12
    && password.length <= 128
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

async function handleResetPassword(user) {
  if (user.id === currentUser.value?.id) return;
  if (!window.confirm(t("admin.employee.resetPasswordConfirm", { username: user.username }))) return;
  await withLoading(async () => {
    const response = await resetEmployeePassword(user.id);
    const temporaryPassword = String(response?.temporaryPassword ?? "");
    if (!temporaryPassword) throw new Error(t("admin.employee.temporaryPasswordMissing"));
    temporaryPasswordDialog.open = true;
    temporaryPasswordDialog.username = user.username;
    temporaryPasswordDialog.password = temporaryPassword;
    temporaryPasswordDialog.copied = false;
    await loadDashboard(false);
    showMessage(t("admin.employee.resetPasswordSuccess", { username: user.username }));
  }, { popupError: true });
}

async function copyTemporaryPassword() {
  try {
    await navigator.clipboard.writeText(temporaryPasswordDialog.password);
    temporaryPasswordDialog.copied = true;
  } catch {
    await showAdminErrorDialog(t("admin.employee.copyTemporaryPasswordFailed"));
  }
}

function closeTemporaryPasswordDialog() {
  temporaryPasswordDialog.open = false;
  temporaryPasswordDialog.username = "";
  temporaryPasswordDialog.password = "";
  temporaryPasswordDialog.copied = false;
}

async function toggleEmployee(user) {
  await withLoading(async () => {
    await updateEmployee(user.id, {
      displayName: user.displayName,
      role: user.role,
      partyRole: user.partyRole || "AGENT",
      status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"
    });
    await loadDashboard(false);
    showMessage(user.status === "ACTIVE" ? "员工已禁用" : "员工已启用");
  });
}

async function handleDeleteEmployee(user) {
  if (!window.confirm(`确认删除/禁用账号「${user.username}」吗？`)) return;
  await withLoading(async () => {
    await deleteEmployee(user.id);
    await loadDashboard(false);
    showMessage("员工已删除并下线");
  });
}

async function handleKickDevice(device) {
  await withLoading(async () => {
    await kickDevice(device.id);
    await loadDashboard(false);
    showMessage("设备已踢下线");
  });
}

async function handleDeleteDevice(device) {
  const deviceName = device.deviceName || device.deviceId || device.ipAddress || "该设备";
  if (!window.confirm(`确认删除设备记录「${deviceName}」吗？在线设备会同步下线。`)) return;
  await withLoading(async () => {
    await deleteDevice(device.id);
    await loadDashboard(false);
    showMessage("设备记录已删除");
  });
}

async function loadAdminWorkspaceFiles() {
  await withLoading(async () => {
    const response = await fetchAdminWorkspaceFiles({
      page: adminWorkspaceFilePage.value - 1,
      size: adminWorkspaceFilePageSize.value,
      includeExpired: includeExpiredFiles.value
    });
    adminWorkspaceFiles.value = Array.isArray(response?.items) ? response.items : [];
    adminWorkspaceFileTotal.value = Number(response?.total ?? adminWorkspaceFiles.value.length);
  });
}

async function changeAdminWorkspaceFilePage(page) {
  adminWorkspaceFilePage.value = page;
  await loadAdminWorkspaceFiles();
}

async function changeAdminWorkspaceFilePageSize(size) {
  adminWorkspaceFilePageSize.value = size;
  adminWorkspaceFilePage.value = 1;
  await loadAdminWorkspaceFiles();
}

async function handleWorkspaceExpiredToggle() {
  adminWorkspaceFilePage.value = 1;
  await loadAdminWorkspaceFiles();
}

async function handleDownloadWorkspaceFile(file) {
  await withLoading(async () => {
    await downloadAdminWorkspaceFile(
      file.id,
      file.originalFileName || `workspace-file-${file.id}`
    );
  });
}

async function loadAdminShipmentFiles() {
  await withLoading(async () => {
    const response = await fetchAdminShipmentFiles({
      page: adminShipmentFilePage.value - 1,
      size: adminShipmentFilePageSize.value,
      includeDeleted: true
    });
    adminShipmentFiles.value = Array.isArray(response?.items) ? response.items : [];
    adminShipmentFileTotal.value = Number(response?.total ?? adminShipmentFiles.value.length);
  });
}

async function changeAdminShipmentFilePage(page) {
  adminShipmentFilePage.value = page;
  await loadAdminShipmentFiles();
}

async function changeAdminShipmentFilePageSize(size) {
  adminShipmentFilePageSize.value = size;
  adminShipmentFilePage.value = 1;
  await loadAdminShipmentFiles();
}

async function handleDownloadShipmentFile(file) {
  await withLoading(async () => {
    const id = shipmentFileApiId(file);
    await downloadAdminShipmentFile(
      id,
      file.originalFileName || file.fileName || `shipment-file-${id}`
    );
  });
}

const PREVIEW_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const PREVIEW_PDF_EXTENSIONS = new Set(["pdf"]);
const PREVIEW_TEXT_EXTENSIONS = new Set([
  "txt", "csv", "log", "json", "xml", "md", "markdown", "html", "htm",
  "js", "ts", "jsx", "tsx", "css", "scss", "less", "yml", "yaml",
  "ini", "conf", "properties", "sh", "bash", "bat", "ps1", "sql",
  "java", "py", "rb", "go", "rs", "c", "cc", "cpp", "h", "hpp",
  "php", "swift", "kt", "dart", "toml", "env", "gitignore"
]);
const PREVIEW_OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function getFileExtension(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  if (!name) return "";
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1);
}

function resetFilePreviewState() {
  if (filePreviewObjectUrl) {
    URL.revokeObjectURL(filePreviewObjectUrl);
    filePreviewObjectUrl = null;
  }
  filePreviewDialog.url = "";
  filePreviewDialog.text = "";
  filePreviewDialog.kind = "";
  filePreviewDialog.message = "";
  filePreviewDialog.isError = false;
}

function closeFilePreviewDialog() {
  filePreviewDialog.open = false;
  resetFilePreviewState();
}

async function handlePreviewShipmentFile(file) {
  const id = shipmentFileApiId(file);
  if (!id) return;
  const fileName = file.originalFileName || file.fileName || "";
  resetFilePreviewState();
  filePreviewDialog.name = fileName;
  filePreviewDialog.kind = "";
  filePreviewDialog.message = ui("admin.files.previewLoading");
  filePreviewDialog.open = true;
  try {
    const blob = await fetchAdminShipmentFileBlob(id);
    const extension = getFileExtension(fileName);
    if (PREVIEW_PDF_EXTENSIONS.has(extension)) {
      filePreviewObjectUrl = URL.createObjectURL(blob);
      filePreviewDialog.url = filePreviewObjectUrl;
      filePreviewDialog.kind = "pdf";
      filePreviewDialog.message = ui("admin.files.previewDownloadTip");
      return;
    }
    if (PREVIEW_IMAGE_EXTENSIONS.has(extension)) {
      filePreviewObjectUrl = URL.createObjectURL(blob);
      filePreviewDialog.url = filePreviewObjectUrl;
      filePreviewDialog.kind = "image";
      filePreviewDialog.message = ui("admin.files.previewDownloadTip");
      return;
    }
    if (PREVIEW_TEXT_EXTENSIONS.has(extension)) {
      const text = await blob.text();
      filePreviewDialog.text = text;
      filePreviewDialog.kind = "text";
      filePreviewDialog.message = ui("admin.files.previewTextFallback", { name: fileName });
      return;
    }
    if (PREVIEW_OFFICE_EXTENSIONS.has(extension)) {
      const text = await blob.text();
      if (text && /[\x09\x0A\x0D\x20-\x7E]/.test(text)) {
        filePreviewDialog.text = text;
        filePreviewDialog.kind = "text";
        filePreviewDialog.message = ui("admin.files.previewTextFallback", { name: fileName });
      } else {
        filePreviewDialog.text = ui("admin.files.previewNotSupported");
        filePreviewDialog.kind = "fallback";
        filePreviewDialog.message = ui("admin.files.previewDownloadTip");
      }
      return;
    }
    const fallbackText = await blob.text().catch(() => "");
    if (fallbackText && fallbackText.length > 0 && /[\x09\x0A\x0D\x20-\x7E]/.test(fallbackText)) {
      filePreviewDialog.text = fallbackText;
      filePreviewDialog.kind = "text";
      filePreviewDialog.message = ui("admin.files.previewTextFallback", { name: fileName });
    } else {
      filePreviewDialog.text = ui("admin.files.previewNotSupported");
      filePreviewDialog.kind = "fallback";
      filePreviewDialog.message = ui("admin.files.previewDownloadTip");
    }
  } catch (error) {
    resetFilePreviewState();
    filePreviewDialog.kind = "fallback";
    filePreviewDialog.text = ui("admin.files.previewNotSupported");
    filePreviewDialog.isError = true;
    filePreviewDialog.message = ui("admin.files.previewFailed", {
      message: error?.message || "error"
    });
  }
}

async function handleDeleteShipmentFile(file) {
  const fileName = file.originalFileName || file.fileName || shipmentFileKey(file);
  if (!window.confirm(ui("admin.files.deleteConfirm", { name: fileName }))) return;
  await withLoading(async () => {
    await deleteAdminShipmentFile(shipmentFileApiId(file));
    await loadAdminShipmentFilesWithoutLoading();
    showMessage(ui("admin.files.deleteSuccess"));
  });
}

async function loadAdminShipmentFilesWithoutLoading() {
  const response = await fetchAdminShipmentFiles({
    page: adminShipmentFilePage.value - 1,
    size: adminShipmentFilePageSize.value,
    includeDeleted: true
  });
  adminShipmentFiles.value = Array.isArray(response?.items) ? response.items : [];
  adminShipmentFileTotal.value = Number(response?.total ?? adminShipmentFiles.value.length);
}

async function handleUpdateLlmSettings() {
  await withLoading(async () => {
    const payload = {
      enabled: llmForm.enabled,
      baseUrl: llmForm.baseUrl,
      model: llmForm.model,
      clearApiKey: llmForm.clearApiKey
    };
    if (llmForm.apiKey) payload.apiKey = llmForm.apiKey;
    const next = await updateLlmSettings(payload);
    llmSettings.value = next;
    syncLlmForm(next);
    showMessage("LLM 配置已保存");
  });
}

function syncLlmForm(settings) {
  llmForm.enabled = settings?.enabled ?? true;
  llmForm.baseUrl = settings?.baseUrl || "https://api.deepseek.com";
  llmForm.model = settings?.model || "deepseek-v4-flash";
  llmForm.apiKey = "";
  llmForm.clearApiKey = false;
}

async function withLoading(action, { popupError = false } = {}) {
  loading.value = true;
  message.value = "";
  hasError.value = false;
  try {
    await action();
  } catch (error) {
    markApiErrorHandled(error);
    const errorText = tr(error.message || t("admin.employee.errorFallback"));
    if (popupError) {
      await showAdminErrorDialog(errorText);
    } else {
      hasError.value = true;
      message.value = errorText;
    }
  } finally {
    loading.value = false;
  }
}

async function showAdminErrorDialog(errorText) {
  await ElMessageBox.alert(errorText, t("admin.employee.errorTitle"), {
    type: "error",
    confirmButtonText: t("admin.employee.errorConfirm"),
    closeOnClickModal: false,
    closeOnPressEscape: false,
    showClose: false,
    customClass: "admin-error-message-box"
  });
}

function showMessage(text) {
  hasError.value = false;
  message.value = tr(text);
}

function normalizeDisplayName(record) {
  if (!record) return record;
  return { ...record, displayName: repairMojibake(record.displayName || "未命名") };
}

function repairMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂæçå€˜™œ]/.test(text)) return text;
  try {
    const bytes = [];
    for (const ch of text) {
      const code = CP1252_BYTES[ch] ?? ch.charCodeAt(0);
      if (code > 255) return text;
      bytes.push(code);
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    return hasMoreChinese(decoded, text) ? decoded : text;
  } catch {
    return text;
  }
}

function hasMoreChinese(next, prev) {
  return countChinese(next) > countChinese(prev) && !next.includes("�");
}

function countChinese(text) {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

function roleText(role) {
  const key = {
    ADMIN: "profile.role.admin",
    BUSINESS: "profile.role.business",
    OPERATOR: "profile.role.business",
    OVERSEA_AGENT: "profile.role.overseaAgent"
  }[role] || "profile.role.employee";
  return ui(key);
}

function partyRoleText(partyRole, role) {
  const normalized = partyRole || ((role === "BUSINESS" || role === "ADMIN") ? "AGENT" : "SHIPPER");
  return t({
    AGENT: "customers.roleAgent",
    SHIPPER: "customers.roleShipper",
    CONSIGNEE: "customers.roleConsignee"
  }[normalized] || "customers.roleShipper");
}

function platformRowKey(row) {
  return `${row?.customerId || "customer"}:${row?.agentUserId || "unassigned"}`;
}

function statusText(status) {
  return tr(status === "ACTIVE" ? "启用" : "禁用");
}

function eventTypeText(type) {
  const labels = {
    LOGIN_SUCCESS: "登录成功",
    LOGIN_FAIL: "登录失败",
    LOGOUT: "退出登录",
    KICK: "踢下线",
    RESET_PASSWORD: "重置密码",
    DELETE_DEVICE: "删除设备",
    DEVICE_LIMIT: "设备限流"
  };
  return tr(labels[type] || type || "-");
}

function eventClass(type) {
  return {
    LOGIN_SUCCESS: "ok",
    LOGOUT: "neutral",
    LOGIN_FAIL: "danger",
    DEVICE_LIMIT: "warn",
    KICK: "warn",
    RESET_PASSWORD: "warn",
    DELETE_DEVICE: "danger"
  }[type] || "neutral";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function shipmentFileKey(file) {
  return file?.publicId || file?.id || "";
}

function shipmentFileApiId(file) {
  return file?.id || file?.publicId || "";
}

function shipmentPublicId(file) {
  return file?.shipmentPublicId
    || file?.shipment?.publicId
    || file?.shipmentId
    || "-";
}

function shipmentFileReference(file) {
  const reference = file?.shipmentReference
    || file?.reference
    || file?.referenceNo
    || file?.shipment?.primaryReference;
  if (reference && typeof reference === "object") {
    const type = reference.referenceType || reference.type || "";
    const number = reference.referenceNo || reference.normalizedReferenceNo || reference.number || "";
    return [type, number].filter(Boolean).join(" · ") || "-";
  }
  const type = file?.referenceType || file?.shipment?.referenceType || "";
  const number = reference || file?.shipment?.referenceNo || "";
  return [type, number].filter(Boolean).join(" · ") || "-";
}

function shipmentFileUploader(file) {
  return file?.uploaderDisplayName
    || file?.uploader?.displayName
    || file?.ownerDisplayName
    || file?.uploadedBy
    || "-";
}

function shipmentFileUploaderDetail(file) {
  const role = file?.uploaderRole || file?.uploaderRoleSnapshot || file?.uploader?.role;
  const id = file?.uploaderUserId || file?.uploader?.id || file?.userId;
  const details = [];
  if (role) details.push(roleText(role));
  if (id) details.push(`ID ${id}`);
  return details.join(" · ") || "-";
}

function shipmentFileVisibilityText(visibility) {
  const key = {
    SHIPPER: "admin.files.visibilityShipper",
    CONSIGNEE: "admin.files.visibilityConsignee",
    OVERSEA_AGENT: "admin.files.visibilityOverseaAgent",
    INTERNAL: "admin.files.visibilityInternal",
    PARTIES: "admin.files.visibilityParties",
    PUBLIC: "admin.files.visibilityPublic"
  }[String(visibility || "").toUpperCase()] || "admin.files.visibilityShipper";
  return ui(key);
}

function shipmentFileVisibilityClass(visibility) {
  return String(visibility || "SHIPPER").toLowerCase();
}

function shipmentFileStatusText(status) {
  const key = {
    READY: "admin.files.statusReady",
    QUARANTINED: "admin.files.statusQuarantined",
    PENDING: "admin.files.statusPending",
    DELETED: "admin.files.statusDeleted"
  }[String(status || "READY").toUpperCase()] || "admin.files.statusReady";
  return ui(key);
}

function isShipmentFileDeleted(file) {
  return String(file?.status || "").toUpperCase() === "DELETED" || Boolean(file?.deletedAt);
}

function isShipmentFilePending(file) {
  return ["QUARANTINED", "PENDING"].includes(String(file?.status || "").toUpperCase());
}

function tr(value) {
  return translateLegacyText(value, currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

const CP1252_BYTES = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f
};
</script>

<style scoped>
.admin-nav-group-label {
  grid-column: 1 / -1;
  margin: 10px 8px 2px;
  color: #8a9aae;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.admin-nav-group-label:first-child {
  margin-top: 2px;
}

.admin-page-pane {
  animation: admin-pane-enter 0.28s ease both;
}

.admin-audit-panel {
  scroll-margin-top: 20px;
}

.admin-overview-chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.admin-overview-chart-card--wide {
  grid-column: 1 / -1;
}

.admin-overview-chart-card .admin-panel-head > span {
  max-width: 420px;
  text-align: right;
}

.admin-overview-echart {
  width: 100%;
  height: 300px;
}

.admin-overview-echart--bar {
  height: 320px;
}

.admin-table-wrap :deep(.el-table__cell) {
  padding: 9px 0;
}

.table-actions {
  flex-wrap: nowrap;
  gap: 6px;
}

.table-actions button {
  min-width: 0;
  padding: 7px 9px;
  white-space: nowrap;
}

.admin-pagination {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px 0;
  justify-content: flex-end;
  overflow: visible;
  padding: 16px 2px 2px;
}

.admin-pagination :deep(.el-pagination__sizes) {
  flex: 0 0 auto;
  margin-inline: 8px;
}

.admin-pagination :deep(.el-pagination__sizes .el-select) {
  width: 112px !important;
  min-width: 112px;
}

.admin-pagination :deep(.el-pagination__total) {
  flex: 0 0 auto;
  margin-left: 8px;
}

.admin-page-pane .admin-panel {
  border-color: #d7e3ef;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 98%), rgb(251 253 255 / 98%));
}

.admin-page-pane .admin-panel-head {
  min-height: 48px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5edf5;
}

.admin-table-wrap {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid #dce6f0;
  background: #fff;
}

.admin-table-wrap :deep(.el-table) {
  min-width: 760px;
}

.admin-table-wrap :deep(.el-table__header th) {
  color: #344e68;
  background: #f3f7fb !important;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.admin-table-wrap :deep(.el-table__body tr) {
  transition: background-color 0.18s ease;
}

.admin-inline-actions > button,
.admin-top-actions > button,
.table-actions > button {
  border-radius: 8px;
  font-weight: 700;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.admin-inline-actions > button:hover:not(:disabled),
.admin-top-actions > button:hover:not(:disabled),
.table-actions > button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 7px 16px rgb(47 128 209 / 12%);
}

.admin-system-message-button {
  position: relative;
  gap: 7px;
  white-space: nowrap;
}

.admin-system-message-button em {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  place-items: center;
  border-radius: 999px;
  color: #fff;
  background: #e6535f;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
}

.announcement-title-cell {
  display: flex;
  min-width: 0;
  gap: 10px;
  align-items: center;
}

.announcement-title-cell > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.announcement-title-cell b,
.announcement-title-cell small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-title-cell small {
  color: #7b8da1;
}

.announcement-image-indicator {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 1px solid #b9daf4;
  border-radius: 9px;
  background:
    linear-gradient(145deg, rgb(55 155 213 / 18%), rgb(96 125 218 / 8%)),
    linear-gradient(135deg, transparent 48%, #55a9da 49% 53%, transparent 54%);
}

.announcement-visibility,
.announcement-preview-visibility {
  display: inline-flex;
  min-height: 26px;
  padding: 0 9px;
  align-items: center;
  border: 1px solid #bfcee0;
  border-radius: 999px;
  color: #4d6782;
  background: #f5f8fc;
  font-size: 11px;
  font-weight: 800;
}

.announcement-visibility.customer {
  border-color: #abdccf;
  color: #17866c;
  background: #effaf6;
}

.announcement-visibility.employee {
  border-color: #b8cdf2;
  color: #346eb6;
  background: #f0f6ff;
}

.announcement-row-actions {
  gap: 5px;
}

.announcement-row-actions button {
  padding: 6px 8px;
}

.announcement-editor-modal {
  width: min(1160px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 16px;
  background: #f7faff;
}

.announcement-editor-form {
  padding: 18px 22px 20px;
}

.announcement-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 20px;
  align-items: start;
}

.announcement-fields {
  display: grid;
  gap: 13px;
}

.announcement-fields label {
  display: grid;
  min-width: 0;
  gap: 7px;
  color: #3d536a;
  font-size: 13px;
  font-weight: 800;
}

.announcement-fields input,
.announcement-fields textarea {
  width: 100%;
  border: 1px solid #bed0e2;
  border-radius: 9px;
  outline: none;
  color: #18324c;
  background: #fff;
  font: inherit;
  font-weight: 500;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.announcement-fields input {
  min-height: 42px;
  padding: 0 12px;
}

.announcement-fields textarea {
  min-height: 300px;
  padding: 12px;
  resize: vertical;
  line-height: 1.65;
}

.announcement-fields input:focus,
.announcement-fields textarea:focus {
  border-color: #4c9bde;
  box-shadow: 0 0 0 3px rgb(47 128 209 / 11%);
}

.announcement-fields :deep(.el-select__wrapper) {
  min-height: 42px;
  border-radius: 9px;
  box-shadow: 0 0 0 1px #bed0e2 inset;
}

.announcement-image-field {
  display: grid;
  gap: 8px;
}

.announcement-image-field > small {
  color: #7b8da1;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
}

.announcement-field-label {
  color: #39536c;
  font-size: 12px;
  font-weight: 800;
}

.announcement-image-dropzone {
  display: grid;
  min-height: 92px;
  padding: 10px 12px;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px dashed #86b6df;
  border-radius: 11px;
  color: #315e82;
  background: linear-gradient(135deg, #f5faff, #edf7ff);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.announcement-image-field.is-dragging .announcement-image-dropzone,
.announcement-image-dropzone:hover:not(:disabled) {
  border-color: #2f80d1;
  background: #e8f5ff;
  transform: translateY(-1px);
}

.announcement-image-dropzone > img,
.announcement-image-drop-icon {
  width: 64px;
  height: 64px;
  border: 1px solid #c7dbea;
  border-radius: 9px;
  background: #fff;
}

.announcement-image-dropzone > img {
  object-fit: cover;
}

.announcement-image-drop-icon {
  display: grid;
  place-items: center;
  color: #2f80d1;
  font-size: 29px;
  font-weight: 300;
}

.announcement-image-dropzone > span:not(.announcement-image-drop-icon) {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.announcement-image-dropzone b {
  color: #1f4f75;
  font-size: 13px;
}

.announcement-image-dropzone small {
  color: #72899e;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
}

.announcement-image-dropzone em {
  padding: 7px 10px;
  border: 1px solid #9dc3e3;
  border-radius: 7px;
  color: #256b9f;
  background: #fff;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  white-space: nowrap;
}

.announcement-image-dropzone:disabled {
  cursor: wait;
  opacity: 0.65;
}

.announcement-image-url-field {
  gap: 6px !important;
}

.announcement-image-url-field > span {
  color: #6d8195 !important;
  font-size: 11px !important;
  font-weight: 600 !important;
}

.announcement-file-input {
  display: none;
}

.announcement-storage-path {
  display: flex;
  min-width: 0;
  gap: 7px;
  align-items: center;
}

.announcement-storage-path code {
  overflow: hidden;
  color: #286b9d;
  font-family: Consolas, "Courier New", monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.announcement-rich-field {
  display: grid;
  gap: 7px;
}

.announcement-rich-field > small {
  color: #72869a;
  font-size: 11px;
  line-height: 1.45;
}

.announcement-rich-toolbar {
  position: relative;
  display: flex;
  min-height: 40px;
  padding: 5px;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  border: 1px solid #bed0e2;
  border-bottom: 0;
  border-radius: 9px 9px 0 0;
  background: #f4f8fc;
}

.announcement-rich-toolbar > button,
.announcement-toolbar-palette > summary,
.announcement-toolbar-palette div button {
  display: inline-grid;
  min-width: 30px;
  min-height: 28px;
  padding: 0 7px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #365b7b;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.announcement-rich-toolbar > button:hover,
.announcement-toolbar-palette > summary:hover,
.announcement-toolbar-palette[open] > summary {
  border-color: #a9c8e2;
  background: #fff;
}

.announcement-toolbar-divider {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: #cad8e5;
}

.announcement-toolbar-spacer {
  flex: 1 1 12px;
}

.announcement-toolbar-palette {
  position: relative;
}

.announcement-toolbar-palette > summary {
  list-style: none;
}

.announcement-toolbar-palette > summary::-webkit-details-marker {
  display: none;
}

.announcement-toolbar-palette > div {
  position: absolute;
  z-index: 6;
  top: calc(100% + 7px);
  left: 0;
  display: grid;
  width: 186px;
  padding: 8px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid #c8d8e7;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 12px 26px rgb(29 66 101 / 17%);
}

.announcement-toolbar-palette div button {
  padding: 0;
  font-size: 16px;
}

.announcement-toolbar-palette div button:hover {
  background: #edf6ff;
}

.announcement-toolbar-tags > div {
  width: 240px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.announcement-toolbar-tags div button {
  padding: 0 7px;
  font-size: 11px;
  white-space: nowrap;
}

.announcement-rich-editor {
  min-height: 285px;
  max-height: 440px;
  overflow: auto;
  padding: 14px;
  border: 1px solid #bed0e2;
  border-radius: 0 0 9px 9px;
  outline: none;
  color: #18324c;
  background: #fff;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.7;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.announcement-rich-editor:focus {
  border-color: #4c9bde;
  box-shadow: 0 0 0 3px rgb(47 128 209 / 11%);
}

.announcement-rich-editor:empty::before {
  color: #9aaabb;
  content: attr(data-placeholder);
  pointer-events: none;
}

.announcement-rich-editor h2,
.announcement-rich-editor h3,
.announcement-rich-editor p,
.announcement-rich-editor ul,
.announcement-rich-editor ol,
.announcement-rich-editor blockquote {
  margin: 0 0 10px;
}

.announcement-rich-editor ul,
.announcement-rich-editor ol {
  padding-left: 22px;
}

.announcement-rich-editor blockquote {
  padding: 8px 11px;
  border-left: 3px solid #61a5dc;
  color: #516b82;
  background: #f3f8fc;
}

.announcement-rich-editor img {
  display: block;
  max-width: 100%;
  max-height: 260px;
  margin: 10px 0;
  border-radius: 9px;
  object-fit: contain;
}

.announcement-dialog-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #f0bcc1;
  border-radius: 8px;
  color: #b43d48;
  background: #fff4f5;
  font-size: 12px;
}

.announcement-live-preview {
  position: sticky;
  top: 0;
  min-width: 0;
  padding: 15px;
  border: 1px solid #d9e6f2;
  border-radius: 13px;
  background:
    radial-gradient(circle at 90% 0, rgb(94 176 229 / 13%), transparent 34%),
    #eef4fa;
}

.announcement-preview-heading,
.announcement-preview-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.announcement-preview-heading {
  margin-bottom: 10px;
  color: #49647e;
  font-size: 12px;
  font-weight: 800;
}

.announcement-preview-heading small {
  color: #8395a8;
}

.announcement-preview-card {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  padding: 22px;
  border: 1px solid #d4e0ec;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 14px 34px rgb(35 77 116 / 9%);
}

.announcement-preview-card > img {
  display: block;
  width: calc(100% + 44px);
  max-height: 220px;
  margin: -22px -22px 20px;
  object-fit: cover;
}

.announcement-preview-card h3 {
  margin: 14px 0 16px;
  color: #173652;
  font-size: 22px;
  line-height: 1.3;
}

.announcement-preview-card.is-dialog {
  min-height: 0;
}

.announcement-preview-meta {
  justify-content: flex-start;
  color: #6b8198;
  font-size: 12px;
}

.announcement-preview-meta span + span::before {
  margin-right: 10px;
  color: #b0becb;
  content: "·";
}

.announcement-markdown-preview {
  color: #3e556b;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.announcement-markdown-preview :deep(h2),
.announcement-markdown-preview :deep(h3),
.announcement-markdown-preview :deep(h4),
.announcement-markdown-preview :deep(h5) {
  margin: 18px 0 8px;
  color: #173652;
  line-height: 1.35;
}

.announcement-markdown-preview :deep(p) {
  margin: 8px 0;
}

.announcement-markdown-preview :deep(ul),
.announcement-markdown-preview :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}

.announcement-markdown-preview :deep(a) {
  color: #1979be;
}

.announcement-markdown-preview :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 320px;
  margin: 14px auto;
  border-radius: 9px;
  object-fit: contain;
}

.announcement-markdown-preview :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 12px;
  border-left: 3px solid #51a5d8;
  color: #5c7187;
  background: #f1f7fb;
}

.announcement-markdown-preview :deep(pre) {
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  color: #e9f4ff;
  background: #13283b;
}

.announcement-markdown-preview :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef3f8;
  font-family: Consolas, "Courier New", monospace;
}

.announcement-markdown-preview :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.announcement-editor-actions {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #dce6ef;
}

.announcement-preview-modal {
  width: min(780px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 16px;
}

.announcement-preview-dialog-body {
  padding: 20px 22px 10px;
}

.admin-inline-link,
.admin-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid #c7d9ed;
  border-radius: 8px;
  color: #245f99;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.admin-inline-link:hover,
.admin-row-action:hover {
  border-color: #6ca7e2;
  box-shadow: 0 7px 18px rgb(47 128 209 / 14%);
  transform: translateY(-1px);
}

.admin-inline-link.primary {
  border-color: #2f80d1;
  background: #2f80d1;
  color: #fff;
}

.admin-row-action {
  min-height: 30px;
  padding: 0 11px;
}

.admin-platform-row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.admin-row-action.danger {
  border-color: #e5b6bb;
  color: #b64752;
  background: #fff8f8;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.admin-row-action.danger:hover:not(:disabled) {
  border-color: #d76d77;
  box-shadow: 0 7px 18px rgb(196 69 80 / 12%);
}

.admin-row-action.danger:disabled {
  cursor: wait;
  opacity: 0.55;
}

@keyframes admin-pane-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 980px) {
  .admin-overview-chart-grid {
    grid-template-columns: 1fr;
  }

  .admin-overview-chart-card--wide {
    grid-column: auto;
  }

  .announcement-editor-grid {
    grid-template-columns: 1fr;
  }

  .announcement-live-preview {
    position: relative;
  }
}

@media (max-width: 680px) {
  .admin-panel-head,
  .admin-inline-actions,
  .admin-top-actions {
    align-items: stretch;
  }

  .admin-inline-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .announcement-field-row {
    grid-template-columns: 1fr;
  }

  .announcement-image-dropzone {
    grid-template-columns: 54px minmax(0, 1fr);
  }

  .announcement-image-dropzone > img,
  .announcement-image-drop-icon {
    width: 54px;
    height: 54px;
  }

  .announcement-image-dropzone em {
    display: none;
  }

  .announcement-editor-modal,
  .announcement-preview-modal {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }

  .announcement-editor-form {
    padding: 14px;
  }

  .admin-pagination {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-page-pane {
    animation: none;
  }

  .admin-inline-link,
  .admin-row-action {
    transition: none;
  }
}
</style>
