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
        <button
          v-for="item in adminPages"
          :key="item.key"
          type="button"
          :class="{ active: activeAdminPage === item.key }"
          @click="selectAdminPage(item.key)"
        >
          <span>{{ item.no }}</span>
          <b>{{ item.label }}</b>
          <small>{{ item.description }}</small>
        </button>
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
            <span>员工账号</span>
            <strong>{{ monitoring?.userCount ?? "-" }}</strong>
            <small>管理员 {{ monitoring?.adminCount ?? 0 }} 个</small>
          </div>
          <div>
            <span>在线设备</span>
            <strong>{{ monitoring?.onlineDeviceCount ?? "-" }}</strong>
            <small>上限 {{ monitoring?.deviceLimit ?? 5 }} 台/账号</small>
          </div>
          <div>
            <span>今日登录</span>
            <strong>{{ monitoring?.loginSuccessToday ?? "-" }}</strong>
            <small>成功会话</small>
          </div>
          <div>
            <span>登录异常</span>
            <strong>{{ monitoring?.loginFailToday ?? "-" }}</strong>
            <small>失败/限流</small>
          </div>
          <div>
            <span>接口请求</span>
            <strong>{{ monitoring?.runtime?.totalRequests ?? 0 }}</strong>
            <small>失败 {{ monitoring?.runtime?.failedRequests ?? 0 }}</small>
          </div>
        </div>

        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Runtime</p>
                <h2>运行监控</h2>
              </div>
              <span class="admin-health-pill" :class="{ warn: runtimeHasFailedRequests }">
                {{ runtimeHealthLabel }}
              </span>
            </div>
            <div class="admin-runtime-list">
              <span><b>服务时间</b>{{ formatDate(monitoring?.serverTime) }}</span>
              <span><b>启动时间</b>{{ formatDate(monitoring?.runtime?.startedAt) }}</span>
              <span><b>堆内存</b>{{ monitoring?.runtime?.heapUsedMb ?? 0 }} / {{ monitoring?.runtime?.heapMaxMb ?? 0 }} MB</span>
              <span><b>内存占用</b>{{ heapPercent }}%</span>
            </div>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Recent Events</p>
                <h2>最近登录事件</h2>
              </div>
              <button type="button" @click="activeAdminPage = 'audit'">查看审计</button>
            </div>
            <ul class="admin-activity-list">
              <li v-for="event in recentEvents" :key="event.id">
                <span :class="eventClass(event.eventType)">{{ eventTypeText(event.eventType) }}</span>
                <b>{{ event.username || "-" }}</b>
                <small>{{ event.ipAddress || "-" }}</small>
                <em>{{ formatDate(event.createdAt) }}</em>
              </li>
              <li v-if="!recentEvents.length" class="admin-empty-row">暂无登录事件</li>
            </ul>
          </article>
        </div>
      </section>

      <section v-else-if="activeAdminPage === 'employees'" class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Account List</p>
              <h2>员工管理</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ employees.length }} 个账号</span>
              <button class="primary" type="button" @click="openEmployeeDialog()">新增员工</button>
              <button type="button" @click="loadDashboard">刷新</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="normalizedEmployees" row-key="id" stripe class="standard-information-table">
              <el-table-column prop="username" :label="t('admin.list.username')" min-width="140" />
              <el-table-column prop="displayName" :label="t('admin.list.displayName')" min-width="150" />
              <el-table-column :label="t('admin.list.systemRole')" width="150">
                <template #default="{ row: user }">{{ roleText(user.role) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.employee.partyRole')" width="150">
                <template #default="{ row: user }">{{ partyRoleText(user.partyRole, user.role) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.status')" width="100">
                <template #default="{ row: user }">
                    <span class="admin-status" :class="{ off: user.status !== 'ACTIVE' }">
                      {{ statusText(user.status) }}
                    </span>
                </template>
              </el-table-column>
              <el-table-column :label="t('admin.list.lastLogin')" min-width="170">
                <template #default="{ row: user }">{{ formatDate(user.lastLoginAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.actions')" width="320" fixed="right">
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
              <button type="button" @click="loadDashboard">{{ ui('admin.files.refresh') }}</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="platformCustomers" row-key="customerId" border stripe class="standard-information-table">
              <el-table-column :label="ui('admin.platform.business')" min-width="170">
                <template #default="{ row }"><b>{{ row.businessDisplayName || '-' }}</b><small>@{{ row.businessUsername || '-' }}</small></template>
              </el-table-column>
              <el-table-column :label="ui('admin.platform.agent')" min-width="180">
                <template #default="{ row }">
                  <b>{{ row.agentDisplayName || ui('admin.platform.unassigned') }}</b>
                  <small>{{ row.agentUsername ? `@${row.agentUsername}` : '-' }}</small>
                </template>
              </el-table-column>
              <el-table-column :label="ui('admin.platform.customer')" min-width="180">
                <template #default="{ row }"><b>{{ row.customerDisplayName || row.customerUsername }}</b><small>@{{ row.customerUsername }}</small></template>
              </el-table-column>
              <el-table-column prop="clientCode" :label="ui('admin.platform.clientCode')" min-width="140" />
              <el-table-column :label="ui('admin.platform.partyRole')" width="130">
                <template #default="{ row }">{{ partyRoleText(row.partyRole) }}</template>
              </el-table-column>
              <el-table-column prop="shipmentCount" :label="ui('admin.platform.shipments')" width="120" align="center" />
              <el-table-column :label="ui('admin.list.status')" width="110">
                <template #default="{ row }"><span class="admin-status" :class="{ off: row.customerStatus !== 'ACTIVE' }">{{ statusText(row.customerStatus) }}</span></template>
              </el-table-column>
              <template #empty>{{ ui('admin.platform.empty') }}</template>
            </el-table>
          </div>
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
            <el-table :data="normalizedDevices" row-key="id" stripe class="standard-information-table devices">
              <el-table-column :label="t('admin.list.user')" min-width="170">
                <template #default="{ row: device }">{{ device.displayName }} / {{ device.username }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.device')" min-width="200">
                <template #default="{ row: device }">
                    <b>{{ device.deviceName || "Web 设备" }}</b>
                    <small>{{ device.deviceId }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="ipAddress" label="IP" min-width="130">
                <template #default="{ row: device }">{{ device.ipAddress || "-" }}</template>
              </el-table-column>
              <el-table-column label="MAC" min-width="150">
                <template #default="{ row: device }">{{ device.macAddress || t("admin.list.webMacUnavailable") }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.loginAt')" min-width="170">
                <template #default="{ row: device }">{{ formatDate(device.loggedInAt) }}</template>
              </el-table-column>
              <el-table-column :label="t('admin.list.lastSeen')" min-width="170">
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
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'files'" class="admin-page-pane">
        <div v-if="false" class="admin-file-scope-tabs" role="tablist" :aria-label="ui('admin.files.scopeAria')">
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

        <article v-if="false" class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Temporary Workspace Files</p>
              <h2>{{ ui('admin.files.workspaceTitle') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <label class="admin-files-expired-filter">
                <input v-model="includeExpiredFiles" type="checkbox" @change="loadAdminWorkspaceFiles" />
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

      <section v-else class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>API Audit Trail</p>
              <h2>{{ ui('admin.audit.apiTitle') }}</h2>
            </div>
          </div>
          <div class="admin-table-wrap">
            <el-table :data="recentApiAudit" row-key="id" border stripe class="standard-information-table">
              <el-table-column :label="ui('admin.audit.time')" width="170">
                <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.userRole')" min-width="170">
                <template #default="{ row }"><b>{{ row.username || '-' }}</b><small>{{ row.role || '-' }} · ID {{ row.userId || '-' }}</small></template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.endpoint')" min-width="300">
                <template #default="{ row }"><b>{{ row.method }} {{ row.path }}</b><small>{{ row.requestId || '-' }}</small></template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.result')" width="110">
                <template #default="{ row }"><el-tag :type="Number(row.status) < 400 ? 'success' : 'danger'">{{ row.status || '-' }}</el-tag></template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.duration')" width="100">
                <template #default="{ row }">{{ row.durationMs ?? 0 }} ms</template>
              </el-table-column>
              <el-table-column :label="ui('admin.audit.ipDevice')" min-width="220">
                <template #default="{ row }"><b>{{ row.ipAddress || '-' }}</b><small>{{ row.userAgent || '-' }}</small></template>
              </el-table-column>
              <template #empty>{{ ui('admin.audit.empty') }}</template>
            </el-table>
          </div>
        </article>
        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Audit Trail</p>
                <h2>登录审计</h2>
              </div>
            </div>
            <ul class="admin-activity-list audit">
              <li v-for="event in recentEvents" :key="event.id">
                <span :class="eventClass(event.eventType)">{{ eventTypeText(event.eventType) }}</span>
                <b>{{ event.username || "-" }}</b>
                <small>{{ event.ipAddress || "-" }}</small>
                <em>{{ event.message || "-" }}</em>
                <strong>{{ formatDate(event.createdAt) }}</strong>
              </li>
              <li v-if="!recentEvents.length" class="admin-empty-row">暂无审计记录</li>
            </ul>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Hot Endpoints</p>
                <h2>接口访问排行</h2>
              </div>
            </div>
            <div class="admin-table-wrap">
              <el-table :data="topEndpoints" row-key="endpoint" stripe class="standard-information-table endpoints">
                <el-table-column prop="endpoint" :label="t('admin.list.endpoint')" min-width="280" />
                <el-table-column prop="hits" :label="t('admin.list.requests')" width="120" />
                <template #empty>{{ t("admin.list.noEndpoints") }}</template>
              </el-table>
            </div>
          </article>
        </div>
      </section>
    </main>

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
          <label v-if="!editingEmployeeId">
            <span>{{ t("admin.employee.initialPassword") }}</span>
            <input
              v-model="employeeForm.password"
              type="password"
              :placeholder="t('admin.employee.passwordPlaceholder')"
              @input="employeeDialogError = ''"
            />
          </label>
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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";
import {
  clearAdminToken,
  createEmployee,
  deleteAdminShipmentFile,
  deleteDevice,
  deleteEmployee,
  fetchAdminMe,
  fetchAdminShipmentFileBlob,
  fetchAdminShipmentFiles,
  fetchDevices,
  fetchEmployees,
  fetchLlmSettings,
  fetchMonitoring,
  fetchPlatformInfo,
  kickDevice,
  loginAdmin,
  resetEmployeePassword,
  storedAdminToken,
  downloadAdminShipmentFile,
  updateEmployee,
  updateLlmSettings
} from "../services/adminApi";
import { markApiErrorHandled } from "../services/apiClient";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

const props = defineProps({
  currentUser: { type: Object, default: null }
});
const emit = defineEmits(["logout", "user-updated"]);

const rawAdminPages = [
  { key: "overview", no: "01", label: "后台概览", description: "指标与运行监控", eyebrow: "Admin Console", title: "后台总览", subtitle: "查看账号、设备、接口运行的关键状态。" },
  { key: "employees", no: "02", label: "\u5458\u5de5\u7ba1\u7406", description: "\u4e09\u7c7b\u5185\u90e8\u8d26\u53f7", eyebrow: "Employee Management", title: "\u5458\u5de5\u7ba1\u7406", subtitle: "\u7ef4\u62a4\u7ba1\u7406\u5458\u3001\u552f\u4e00\u4e1a\u52a1\u5458\u4e0e\u6d77\u5916\u4ee3\u7406\u8d26\u53f7\u3002" },
  { key: "platform", no: "03", label: "\u5e73\u53f0\u4fe1\u606f", description: "\u5ba2\u6237\u3001\u4ee3\u7406\u4e0e\u7968\u5355", eyebrow: "Platform Information", title: "\u8d27\u8e2a\u5e73\u53f0\u4fe1\u606f", subtitle: "\u67e5\u770b\u4e1a\u52a1\u5458\u4e3a\u5ba2\u6237\u5206\u914d\u7684\u6d77\u5916\u4ee3\u7406\u3001\u5ba2\u6237\u7801\u4e0e\u7968\u5355\u6570\u91cf\u3002" },
  { key: "devices", no: "04", label: "\u8bbe\u5907\u767b\u5f55", description: "IP \u4e0e\u5728\u7ebf\u8bbe\u5907", eyebrow: "Device Sessions", title: "\u8bbe\u5907\u4e0e\u767b\u5f55", subtitle: "\u67e5\u770b\u5f53\u524d\u767b\u5f55\u8bbe\u5907\u3001IP\u3001\u4f1a\u8bdd\u72b6\u6001\u5e76\u6267\u884c\u4e0b\u7ebf\u3002" },
  { key: "files", no: "05", label: "\u7968\u5355\u6587\u4ef6", description: "\u4e1a\u52a1\u6587\u4ef6\u4e0e\u4e0a\u4f20\u8bb0\u5f55", eyebrow: "Shipment Documents", title: "\u7968\u5355\u6587\u4ef6", subtitle: "\u96c6\u4e2d\u67e5\u770b\u957f\u671f\u5173\u8054\u5230\u7968\u5355\u7684\u4e1a\u52a1\u6587\u4ef6\u4e0e\u4e0a\u4f20\u8bb0\u5f55\u3002" },
  { key: "system", no: "06", label: "\u7cfb\u7edf\u7ba1\u7406", description: "\u7b56\u7565\u4e0e\u670d\u52a1\u72b6\u6001", eyebrow: "System Settings", title: "\u7cfb\u7edf\u7ba1\u7406", subtitle: "\u96c6\u4e2d\u653e\u7f6e\u8d26\u53f7\u7b56\u7565\u3001\u670d\u52a1\u72b6\u6001\u548c\u540e\u7eed\u8fd0\u7ef4\u5165\u53e3\u3002" },
  { key: "audit", no: "07", label: "\u5ba1\u8ba1\u65e5\u5fd7", description: "\u767b\u5f55\u4e0e\u63a5\u53e3\u8bb0\u5f55", eyebrow: "Audit Log", title: "\u5ba1\u8ba1\u65e5\u5fd7", subtitle: "\u8ffd\u8e2a\u767b\u5f55\u4e8b\u4ef6\u548c\u63a5\u53e3\u8bbf\u95ee\u70ed\u5ea6\u3002" }
];

const loading = ref(false);
const initialLoading = ref(false);
const message = ref("");
const hasError = ref(false);
const currentUser = ref(props.currentUser);
const employees = ref([]);
const platformInfo = ref(null);
const devices = ref([]);
const adminWorkspaceFiles = ref([]);
const adminWorkspaceFileTotal = ref(0);
const adminShipmentFiles = ref([]);
const adminShipmentFileTotal = ref(0);
const adminFilesLoaded = ref(false);
const includeExpiredFiles = ref(false);
const activeAdminFileSection = ref("shipment");
const monitoring = ref(null);
const llmSettings = ref(null);
const activeAdminPage = ref("overview");
const loginForm = reactive({ username: "admin", password: "" });
const employeeDialogOpen = ref(false);
const editingEmployeeId = ref("");
const employeeDialogError = ref("");
const employeeForm = reactive({ username: "", displayName: "", password: "", role: "OVERSEA_AGENT", partyRole: "AGENT", status: "ACTIVE" });
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
const llmForm = reactive({
  enabled: true,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
  clearApiKey: false
});

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
const onlineDevices = computed(() => normalizedDevices.value.filter((device) => device.online));
const recentEvents = computed(() => monitoring.value?.recentEvents || []);
const platformCustomers = computed(() => platformInfo.value?.items || []);
const recentApiAudit = computed(() => monitoring.value?.recentApiAudit || []);
const topEndpoints = computed(() => monitoring.value?.runtime?.topEndpoints || []);
const runtimeFailedRequestCount = computed(() => Number(monitoring.value?.runtime?.failedRequests || 0));
const runtimeHasFailedRequests = computed(() => runtimeFailedRequestCount.value > 0);
const runtimeHealthLabel = computed(() =>
  runtimeHasFailedRequests.value
    ? ui("admin.runtimeHasFailedRequests", { count: runtimeFailedRequestCount.value })
    : ui("admin.runtimeRunningNormally")
);
const llmStatusText = computed(() => {
  if (!llmSettings.value) return tr("未加载");
  if (!llmSettings.value.enabled) return tr("已关闭");
  return tr(llmSettings.value.apiKeyConfigured ? "已启用" : "缺少 Key");
});
const heapPercent = computed(() => {
  const used = Number(monitoring.value?.runtime?.heapUsedMb || 0);
  const max = Number(monitoring.value?.runtime?.heapMaxMb || 0);
  if (!max) return 0;
  return Math.round((used / max) * 100);
});

onMounted(async () => {
  if (storedAdminToken()) {
    initialLoading.value = true;
    try {
      await loadDashboard(false, false);
    } finally {
      initialLoading.value = false;
    }
  }
});

watch(() => props.currentUser, (user) => {
  currentUser.value = user;
}, { immediate: true });

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
      employeeRows,
      deviceRows,
      monitoringData,
      platformData,
      llmData
    ] = await Promise.all([
      fetchEmployees(),
      fetchDevices(),
      fetchMonitoring(),
      fetchPlatformInfo(),
      fetchLlmSettings()
    ]);
    employees.value = employeeRows;
    devices.value = deviceRows;
    monitoring.value = monitoringData;
    platformInfo.value = platformData;
    llmSettings.value = llmData;
    if (activeAdminPage.value === "files") await loadAdminFileListsWithoutLoading();
    syncLlmForm(llmData);
    if (showSuccess) showMessage("后台数据已刷新");
  });
}

function selectAdminPage(page) {
  activeAdminPage.value = page;
  if (page === "files" && !adminFilesLoaded.value) {
    void withLoading(loadAdminFileListsWithoutLoading);
  }
}

async function loadAdminFileListsWithoutLoading() {
  const [shipmentResult] = await Promise.allSettled([
    fetchAdminShipmentFiles({ page: 0, size: 200, includeDeleted: true })
  ]);
  if (shipmentResult.status === "fulfilled") {
    const data = shipmentResult.value;
    adminShipmentFiles.value = Array.isArray(data?.items) ? data.items : [];
    adminShipmentFileTotal.value = Number(data?.total ?? adminShipmentFiles.value.length);
  }
  adminFilesLoaded.value = shipmentResult.status === "fulfilled";
  const failed = [shipmentResult].find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

function openEmployeeDialog(user = null) {
  employeeDialogError.value = "";
  editingEmployeeId.value = user?.id || "";
  employeeForm.username = user?.username || "";
  employeeForm.displayName = user?.displayName || "";
  employeeForm.password = "";
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
  employeeForm.role = "OVERSEA_AGENT";
  employeeForm.partyRole = "AGENT";
  employeeForm.status = "ACTIVE";
}

async function handleSaveEmployee() {
  employeeDialogError.value = "";
  if (!editingEmployeeId.value && !isStrongEmployeePassword(employeeForm.password)) {
    employeeDialogError.value = t("admin.employee.passwordRuleError");
    return;
  }
  await withLoading(async () => {
    const wasEditing = Boolean(editingEmployeeId.value);
    if (wasEditing) {
      await updateEmployee(editingEmployeeId.value, {
        displayName: employeeForm.displayName,
        role: employeeForm.role,
        partyRole: employeeForm.partyRole,
        status: employeeForm.status
      });
    } else {
      await createEmployee({ ...employeeForm });
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

async function loadAdminShipmentFiles() {
  await withLoading(async () => {
    const response = await fetchAdminShipmentFiles({
      page: 0,
      size: 200,
      includeDeleted: true
    });
    adminShipmentFiles.value = Array.isArray(response?.items) ? response.items : [];
    adminShipmentFileTotal.value = Number(response?.total ?? adminShipmentFiles.value.length);
  });
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
    page: 0,
    size: 200,
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
