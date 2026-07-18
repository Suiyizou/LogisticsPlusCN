<template>
  <el-config-provider :locale="elementPlusLocale">
  <PublicLandingPage
    v-if="activePage === 'landing'"
    :current-user="currentUser"
  />
  <template v-else>
  <LanguageSwitcher v-if="!authChecked || !currentUser" class="global-language-switcher" />
  <LoginPage v-if="authChecked && !currentUser" @logged-in="handleLoggedIn" />
  <SystemWaitOverlay
    v-else-if="!authChecked"
    :visible="true"
    :message="t('app.loadingAuth')"
  />
  <AdminDashboard
    v-else-if="activePage === 'admin' && currentUser?.role === 'ADMIN'"
    key="admin"
    :current-user="currentUser"
    @logout="handleLogout"
    @user-updated="handleUserUpdated"
  />
  <WorkbenchPortal
    v-else-if="activePage === 'workbenches'"
    key="workbenches"
    :current-user="currentUser"
    @logout="handleLogout"
  />
  <BusinessCustomerPage
    v-else-if="activePage === 'customers' && ['BUSINESS', 'ADMIN'].includes(currentUser?.role)"
    key="customers"
    :current-user="currentUser"
    @logout="handleLogout"
  />
  <div v-else class="app-shell" :class="{ 'is-page-leaving': pageLeaving }">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><img src="/favicon.svg" alt="" /></span>
        <div>
          <p>Browser / Server</p>
          <h1>货代装箱体积规划系统</h1>
        </div>
      </div>
      <el-breadcrumb separator="/" class="top-breadcrumb">
        <el-breadcrumb-item>工作台</el-breadcrumb-item>
        <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
        <el-breadcrumb-item v-if="activePage === 'planner'">{{ activePlannerStepLabel }}</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="top-user">
        <a
          class="top-home-link"
          href="/"
          :aria-label="t('landing.brandAria')"
          @click="handleReturnHome"
        >
          <el-icon><House /></el-icon>
          <span>DrewesLogistics {{ t("landing.nav.home") }}</span>
        </a>
        <LanguageSwitcher class="topbar-language-switcher" />
        <el-tag effect="plain" type="primary">{{ pageTitle }}</el-tag>
        <el-button type="primary" plain class="user-button" @click="profileOpen = true">
          <strong>{{ userDisplayName }}</strong>
          <small>{{ currentUser?.username }}</small>
        </el-button>
      </div>
    </header>

    <div class="app-body" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="app-sidebar">
        <el-button class="sidebar-toggle" :icon="sidebarCollapsed ? Expand : Fold" @click="sidebarCollapsed = !sidebarCollapsed">
          <span>{{ sidebarCollapsed ? "展开" : "收起" }}</span>
        </el-button>

        <div class="side-user-card">
          <span>当前工作区</span>
          <strong>{{ userDisplayName }}</strong>
          <small>{{ cargos.length }} 类货物 · {{ containers.length }} 个箱型</small>
        </div>

        <el-menu
          class="side-menu"
          :collapse="sidebarCollapsed"
          :default-active="activeMenuIndex"
          background-color="transparent"
          text-color="#24415f"
          active-text-color="#165DFF"
          :collapse-transition="false"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/workbenches">
            <el-icon><Grid /></el-icon>
            <span>{{ t("portal.switchWorkbench") }}</span>
          </el-menu-item>
          <el-menu-item index="/home">
            <el-icon><House /></el-icon>
            <span>工作台首页</span>
          </el-menu-item>
          <el-sub-menu index="/planner">
            <template #title>
              <el-icon><Box /></el-icon>
              <span>装箱计算</span>
            </template>
            <el-menu-item index="/planner/config">
              <el-icon><Setting /></el-icon>
              <span>01 配置与货物管理</span>
            </el-menu-item>
            <el-menu-item index="/planner/results" :disabled="!cargos.length">
              <el-icon><DataAnalysis /></el-icon>
              <span>02 计算方案</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item index="/algorithm">
            <el-icon><Document /></el-icon>
            <span>算法说明</span>
          </el-menu-item>
          <el-menu-item index="/containers">
            <el-icon><DataAnalysis /></el-icon>
            <span>箱型资料</span>
          </el-menu-item>
        </el-menu>

      </aside>

      <section class="workspace">

    <Transition name="page-switch" mode="out-in">
    <HomePage
      v-if="activePage === 'home'"
      key="home"
      :user="currentUser"
      :cargo-count="cargos.length"
      :utilization-percent="utilizationPercent"
      :global-gap-cm="globalGapCm"
      @save-settings="applyUserSettings"
    />
    <main v-else-if="activePage === 'planner'" key="planner" class="planner-page">
      <el-card class="planner-step-card" shadow="never">
        <el-steps :active="activeStepIndex" finish-status="success" align-center>
          <el-step
            v-for="(step, index) in plannerWorkflowSteps"
            :key="step.key"
            :status="activePlannerStep === step.key ? 'process' : index < activeStepIndex ? 'success' : 'wait'"
          >
            <template #title>
              <el-button
                link
                :type="activePlannerStep === step.key ? 'primary' : 'default'"
                :disabled="step.disabled"
                class="step-title-button"
                @click="goPlannerStep(step.key)"
              >
                {{ step.no }} {{ step.label }}
              </el-button>
            </template>
            <template #description>
              <span class="step-description">{{ step.description }}</span>
            </template>
          </el-step>
        </el-steps>
      </el-card>

      <Transition name="planner-view" mode="out-in">
      <section v-if="plannerMode === 'config'" key="config-view" class="planner-section">
        <el-card class="planner-page-head" shadow="never">
          <div class="page-heading">
            <p>Calculation Setup</p>
            <h2>计算配置</h2>
          </div>
          <div class="section-actions page-head-actions">
            <el-tag :type="loading ? 'warning' : 'primary'" effect="light">{{ apiStatus }}</el-tag>
            <el-button class="page-head-cta" type="primary" size="large" :icon="Tickets" @click="goPlannerStep('cargos')">
              进入货物总览
            </el-button>
          </div>
        </el-card>
        <el-alert
          v-if="showPackingWorkloadHint"
          class="calculation-load-hint"
          :class="packingWorkloadHint.level"
          :title="tr(packingWorkloadHint.title)"
          :description="packingWorkloadDescription"
          :type="packingWorkloadHint.level === 'heavy' ? 'error' : packingWorkloadHint.level === 'medium' ? 'warning' : 'info'"
          show-icon
          :closable="false"
        />

        <div class="planner-config-grid">
          <el-card class="planner-card" shadow="hover">
            <template #header>
              <div class="card-header-title">
                <el-icon><Operation /></el-icon>
                <strong>装箱参数</strong>
              </div>
            </template>
            <div class="slider-form">
              <div class="slider-row">
                <div>
                  <span class="field-label">计划可用率</span>
                  <el-tag type="primary" effect="light">{{ utilizationPercent }}%</el-tag>
                </div>
                <el-slider v-model="utilizationPercent" :min="75" :max="98" />
              </div>
              <div class="slider-row">
                <div>
                  <span class="field-label">货物间隙</span>
                  <el-tag type="info" effect="light">{{ globalGapCm }} cm</el-tag>
                </div>
                <el-slider v-model="globalGapCm" :min="0" :max="8" />
              </div>
              <div class="slider-row">
                <div>
                  <span class="field-label">{{ t("planner.supportRatio") }}</span>
                  <el-tag type="success" effect="light">{{ supportRatioPercent }}%</el-tag>
                </div>
                <el-slider v-model="supportRatioPercent" :min="50" :max="100" :step="5" />
              </div>
              <div class="slider-row">
                <div>
                  <span class="field-label">{{ t("planner.nonStackSupportRatio") }}</span>
                  <el-tag type="warning" effect="light">{{ nonStackSupportRatioPercent }}%</el-tag>
                </div>
                <el-slider v-model="nonStackSupportRatioPercent" :min="80" :max="100" :step="0.5" />
              </div>
              <div class="priority-container-box">
                <div class="priority-container-head">
                  <div>
                    <span class="field-label">{{ t("planner.priorityContainers") }}</span>
                    <small>{{ t("planner.priorityContainersHint", { count: calculationContainers.length }) }}</small>
                  </div>
                  <el-button-group>
                    <el-button size="small" @click="selectCommonPriorityContainers">{{ t("planner.priorityCommon") }}</el-button>
                    <el-button size="small" @click="selectAllPriorityContainers">{{ t("planner.priorityAll") }}</el-button>
                  </el-button-group>
                </div>
                <el-checkbox-group
                  v-model="priorityContainerIds"
                  class="priority-container-grid"
                  @change="handlePriorityContainerChange"
                >
                  <el-checkbox-button
                    v-for="container in containers"
                    :key="container.id"
                    :value="container.id"
                  >
                    <span>{{ trContainerName(container.name) }}</span>
                    <small>{{ containerUsageText(container.usagePriority) }}</small>
                  </el-checkbox-button>
                </el-checkbox-group>
              </div>
              <div class="balance-settings-box">
                <div class="balance-settings-head">
                  <div>
                    <span class="field-label">偏载约束</span>
                    <small>作为合规拦截阈值参与每次装箱计算</small>
                  </div>
                  <el-radio-group v-model="activeBalancePreset" size="small" @change="applyBalancePreset">
                    <el-radio-button label="strict">严格</el-radio-button>
                    <el-radio-button label="standard">标准</el-radio-button>
                    <el-radio-button label="loose">宽松</el-radio-button>
                    <el-radio-button label="custom">自定义</el-radio-button>
                  </el-radio-group>
                </div>
                <div class="balance-setting-grid">
                  <div class="mini-slider-row">
                    <span>绿灯阈值</span>
                    <el-tag size="small" effect="plain">{{ balanceSettings.greenLimitPercent }}%</el-tag>
                    <el-slider v-model="balanceSettings.greenLimitPercent" :min="1" :max="5" :step="0.5" @change="markBalanceCustom" />
                  </div>
                  <div class="mini-slider-row">
                    <span>红色拦截</span>
                    <el-tag size="small" type="danger" effect="plain">{{ balanceSettings.redLimitPercent }}%</el-tag>
                    <el-slider v-model="balanceSettings.redLimitPercent" :min="3" :max="12" :step="0.5" @change="markBalanceCustom" />
                  </div>
                  <div class="mini-slider-row">
                    <span>左右偏移</span>
                    <el-tag size="small" type="warning" effect="plain">≤ {{ balanceSettings.lateralOffsetLimitCm * 10 }} mm</el-tag>
                    <el-slider v-model="balanceSettings.lateralOffsetLimitCm" :min="4" :max="20" :step="1" @change="markBalanceCustom" />
                  </div>
                  <div class="mini-slider-row">
                    <span>轻载不拦截</span>
                    <el-tag size="small" type="info" effect="plain">≤ {{ formatTons(balanceSettings.skipBelowWeightKg) }}</el-tag>
                    <el-slider v-model="balanceSettings.skipBelowWeightKg" :min="0" :max="30000" :step="1000" @change="markBalanceCustom" />
                  </div>
                  <div class="mini-slider-row">
                    <span>前半最大</span>
                    <el-tag size="small" effect="plain">≤ {{ balanceSettings.frontMaxPercent }}%</el-tag>
                    <el-slider v-model="balanceSettings.frontMaxPercent" :min="55" :max="70" :step="1" @change="markBalanceCustom" />
                  </div>
                  <div class="mini-slider-row">
                    <span>40FR 后半最低</span>
                    <el-tag size="small" effect="plain">≥ {{ balanceSettings.rearMinPercent40FR }}%</el-tag>
                    <el-slider v-model="balanceSettings.rearMinPercent40FR" :min="20" :max="45" :step="1" @change="markBalanceCustom" />
                  </div>
                </div>
              </div>
            </div>
            <el-divider />
            <div class="config-toolbox">
              <strong>常用工具</strong>
              <div class="config-tool-grid">
                <el-button :icon="Star" @click="smartImportOpen = !smartImportOpen">{{ smartImportOpen ? "收起智能导入" : "智能/Excel 导入" }}</el-button>
                <el-select v-model="quickImportMode" class="quick-import-mode" :aria-label="ui('excel.importMode')" :disabled="fileImporting">
                  <el-option :label="ui('excel.appendCargo')" value="append" />
                  <el-option :label="ui('excel.replaceCargo')" value="replace" />
                </el-select>
                <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls,.csv,.tsv,text/csv" :disabled="fileImporting" :on-change="handleWorkbookQuickUpload">
                  <el-button :icon="Upload" :loading="fileImporting">导入 Excel</el-button>
                </el-upload>
                <el-button :icon="Box" @click="openContainerModal">添加箱型</el-button>
                <el-button :icon="MagicStick" @click="loadSample">套用示例</el-button>
                <el-button :icon="Download" @click="exportCsv">导出 CSV</el-button>
                <el-button :icon="Refresh" @click="resetContainers">恢复默认箱型</el-button>
                <el-button type="danger" plain :icon="Delete" @click="clearCargos">清空货物</el-button>
              </div>
            </div>
          </el-card>

          <el-card class="planner-card template-container-card" shadow="hover">
            <template #header>
              <div class="card-header-title">
                <el-icon><Box /></el-icon>
                <strong>箱型尺寸管理</strong>
              </div>
            </template>
            <div class="container-source-compact">
              <div class="compact-section-head">
                <div>
                  <strong>箱型尺寸管理</strong>
                  <small>{{ t("planner.containerScopeNote") }}</small>
                </div>
                <RouterLink to="/containers">
                  <el-button size="small" type="primary" plain :icon="DataAnalysis">资料库</el-button>
                </RouterLink>
              </div>
              <div class="container-management-actions compact">
                <el-button size="small" :icon="Box" @click="openContainerModal()">添加箱型</el-button>
                <el-button size="small" :icon="Refresh" @click="resetContainers">恢复默认</el-button>
              </div>
              <el-table :data="containerSourceRows" size="small" class="container-source-table compact" max-height="calc(100vh - 370px)">
                <el-table-column prop="name" label="箱型" min-width="120" />
                <el-table-column :label="ui('common.dimensionsCm')" min-width="190">
                  <template #default="{ row }">{{ containerDimensionText(row) }}</template>
                </el-table-column>
                <el-table-column :label="ui('container.referencePrice')" width="138">
                  <template #default="{ row }">
                    <span class="source-basis" :class="{ edited: row.priceEdited }">{{ containerPriceText(row) }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="ui('common.actions')" width="210" fixed="right" class-name="container-action-cell">
                  <template #default="{ row }">
                    <div class="container-row-actions">
                      <el-button link type="primary" @click="openContainerModal(row)">编辑</el-button>
                      <el-button link :disabled="!canRestoreContainerPrice(row)" @click="restoreContainerPrice(row)">{{ ui('container.restorePriceShort') }}</el-button>
                      <el-button link :disabled="!isDefaultContainer(row.id)" @click="restoreContainerDefaults(row)">恢复</el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-card>
        </div>
        <el-collapse-transition>
          <div v-if="smartImportOpen" class="embedded-smart-import config-embedded-import">
            <ExcelTemplatePage key="config-smart-import" :current-cargo-count="cargos.length" @import-cargos="importExcelCargos" />
          </div>
        </el-collapse-transition>
      </section>

      <section v-else-if="plannerMode === 'cargos'" key="cargo-detail-view" class="planner-section">
        <el-card class="planner-page-head" shadow="never">
          <div class="page-heading">
            <p>Cargo Overview</p>
            <h2>货物总览</h2>
          </div>
          <div class="section-actions page-head-actions">
            <el-button :icon="ArrowLeft" @click="goPlannerStep('config')">返回配置</el-button>
            <el-button class="page-head-cta" type="primary" :disabled="!cargos.length" @click="goPlannerStep('results')">进入计算方案</el-button>
          </div>
        </el-card>

        <div class="planner-metrics">
          <el-card shadow="never"><el-statistic title="货物品类数" :value="cargoTypeCount" /></el-card>
          <el-card shadow="never"><el-statistic title="总件数" :value="cargoTotalQuantity" /></el-card>
          <el-card shadow="never"><el-statistic title="总重量" :value="cargoTotalWeightKg / 1000" :precision="2" suffix="t" /></el-card>
          <el-card shadow="never"><el-statistic title="总体积" :value="cargoTotalVolumeM3" :precision="2" suffix="m³" /></el-card>
        </div>
        <el-alert
          v-if="showPackingWorkloadHint"
          class="calculation-load-hint compact"
          :class="packingWorkloadHint.level"
          :title="tr(packingWorkloadHint.title)"
          :description="tr(`${packingWorkloadHint.detail}。${packingWorkloadHint.advice}`)"
          :type="packingWorkloadHint.level === 'heavy' ? 'error' : packingWorkloadHint.level === 'medium' ? 'warning' : 'info'"
          show-icon
          :closable="false"
        />

        <el-card class="panel cargo-template-panel" shadow="never">
          <template #header>
            <div class="section-head">
              <div>
                <p>Templates</p>
                <h2>{{ ui('template.cargoTemplates') }}</h2>
              </div>
              <el-button type="primary" :disabled="!cargos.length" @click="saveCargoTemplate">{{ ui('template.save') }}</el-button>
            </div>
          </template>
          <div class="cargo-template-content">
            <div class="template-save-row">
              <el-input v-model.trim="templateName" placeholder="模板名称，例如：E-House 项目" clearable />
              <el-button :icon="MagicStick" @click="loadSample">套用示例</el-button>
            </div>
            <el-table v-if="cargoTemplates.length" :data="cargoTemplates" row-key="id" size="small" class="template-table-lite cargo-template-table" max-height="220">
              <el-table-column :label="ui('template.name')" min-width="180">
                <template #default="{ row }">{{ templateDisplayName(row) }}</template>
              </el-table-column>
              <el-table-column :label="ui('template.scale')" width="140">
                <template #default="{ row }">{{ row.cargos.length }} 类 / {{ templateQuantity(row) }} 件</template>
              </el-table-column>
              <el-table-column :label="ui('common.actions')" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="primary" plain @click="applyCargoTemplate(row.id)">套用</el-button>
                  <el-button size="small" type="danger" plain @click="deleteCargoTemplate(row.id)">{{ ui('common.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="还没有本机货物模板" :image-size="48" />
          </div>
        </el-card>

        <el-card class="panel cargo-overview-panel" shadow="never">
          <template #header>
          <div class="section-head">
            <div>
              <p>Current Cargo</p>
              <h2>{{ ui('app.currentCargoList') }}</h2>
            </div>
            <div class="section-actions cargo-list-actions">
              <el-button type="primary" :icon="Plus" @click="openCargoModal()">{{ ui('app.manualEntry') }}</el-button>
              <el-button data-i18n-ignore :icon="Star" @click="smartImportOpen = !smartImportOpen">{{ smartImportOpen ? ui('app.hideSmartImport') : ui('excel.title') }}</el-button>
              <el-button :icon="Delete" :disabled="!selectedCargoRows.length" @click="deleteSelectedCargos">{{ ui('app.batchDelete') }}</el-button>
              <el-button type="danger" plain :icon="Delete" :disabled="!cargos.length" @click="clearCargos">{{ ui('app.clearAll') }}</el-button>
            </div>
          </div>
          </template>
          <el-collapse-transition>
            <div v-if="smartImportOpen" class="embedded-smart-import">
              <ExcelTemplatePage key="embedded-smart-import" :current-cargo-count="cargos.length" @import-cargos="importExcelCargos" />
            </div>
          </el-collapse-transition>
          <el-alert
            v-if="cargoImportNoticeText"
            data-i18n-ignore
            class="cargo-import-check-notice"
            type="warning"
            show-icon
            :title="cargoImportNoticeText"
            @close="cargoImportNotice = null"
          />
          <el-table
            v-if="cargos.length"
            :data="cargos"
            row-key="id"
            class="cargo-overview-table"
            size="large"
            max-height="520"
            :row-style="cargoOverviewRowStyle"
            @selection-change="handleCargoSelectionChange"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column :label="ui('common.cargo')" min-width="220">
              <template #default="{ row, $index }">
                <span class="cargo-name-cell">
                  <i :style="{ background: row.color || systemColorFor($index) }"></i>
                  <b>{{ row.name }}</b>
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="model" :label="ui('common.model')" width="92">
              <template #default="{ row }">{{ row.model || "-" }}</template>
            </el-table-column>
            <el-table-column :label="ui('common.dimensionsCm')" min-width="172">
              <template #default="{ row }">{{ row.lengthCm }} × {{ row.widthCm }} × {{ row.heightCm }}</template>
            </el-table-column>
            <el-table-column :label="ui('common.quantity')" width="144">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" :step="1" size="small" controls-position="right" @change="touchCargoList" />
              </template>
            </el-table-column>
            <el-table-column :label="ui('common.unitWeight')" width="132">
              <template #default="{ row }">{{ fmt(row.weightKg, 2) }} kg</template>
            </el-table-column>
            <el-table-column :label="ui('common.subtotalVolume')" width="148">
              <template #default="{ row }">{{ fmt((row.lengthCm * row.widthCm * row.heightCm * row.quantity) / 1000000, 3) }} m³</template>
            </el-table-column>
            <el-table-column :label="ui('common.type')" min-width="230">
              <template #default="{ row }">
                <div class="cargo-rule-tags">
                  <el-tag
                    v-for="tag in cargoRuleTags(row)"
                    :key="tag.key"
                    class="cargo-type-tag"
                    :type="tag.type"
                    effect="plain"
                  >
                    {{ tag.label }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="ui('common.actions')" width="144" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openCargoModal(row)">{{ ui('common.edit') }}</el-button>
                <el-button link type="danger" @click="deleteCargo(row.id, row.name)">{{ ui('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else :description="ui('app.emptyCargoList')" />
        </el-card>
      </section>

      <section v-else key="results-view" class="planner-section">
        <section class="panel result-summary-panel">
          <div class="section-head">
            <div>
              <p>Calculation Summary</p>
              <h2>计算结论</h2>
            </div>
            <el-tag :type="resultSummary.red ? 'danger' : resultSummary.yellow || resultSummary.estimated ? 'warning' : 'success'" effect="light">
              {{ resultSummary.recommendationText }}
            </el-tag>
          </div>
          <div class="result-summary-grid">
            <div class="summary-card success">
              <span>{{ tr("绿色合格") }}</span>
              <b>{{ resultSummary.green }}</b>
              <small>{{ tr("可直接输出") }}</small>
            </div>
            <div class="summary-card warning">
              <span>{{ tr("黄色预警") }}</span>
              <b>{{ resultSummary.yellow }}</b>
              <small>{{ tr("允许微调") }}</small>
            </div>
            <div class="summary-card warning">
              <span>{{ ui("result.estimatedCandidates") }}</span>
              <b>{{ resultSummary.estimated }}</b>
              <small>{{ ui("result.verificationIncomplete") }}</small>
            </div>
            <div class="summary-card danger">
              <span>{{ tr("红色拦截") }}</span>
              <b>{{ resultSummary.red }}</b>
              <small>{{ tr("不可输出") }}</small>
            </div>
            <div class="summary-card muted">
              <span>{{ tr("不可装") }}</span>
              <b>{{ resultSummary.oversize }}</b>
              <small>{{ tr("尺寸/承载失败") }}</small>
            </div>
            <div class="summary-card primary">
              <span>{{ ui("result.currentPlanBoxes") }}</span>
              <b>{{ resultSummary.boxesText }}</b>
              <small>{{ trPlanSummary(resultSummary.containerName) }}</small>
            </div>
            <div class="summary-card freight">
              <span>{{ resultSummary.freightLabel }}</span>
              <b>{{ resultSummary.freightText }}</b>
              <small>{{ ui("result.freightFormula") }}</small>
            </div>
          </div>
          <div v-if="resultOptimizationRows.length" class="optimization-explainer">
            <div class="optimization-head">
              <span>{{ ui("result.optimizationEyebrow") }}</span>
              <strong>{{ ui("result.optimizationTitle") }}</strong>
              <small>{{ ui("result.optimizationBasis") }}</small>
            </div>
            <div class="optimization-list">
              <div v-for="row in resultOptimizationRows" :key="row.key" class="optimization-row">
                <span>{{ row.label }}</span>
                <b>{{ row.value }}</b>
                <small>{{ row.detail }}</small>
              </div>
            </div>
            <div v-if="resultMixedHoldRows.length" class="optimization-holds">
              <div v-for="row in resultMixedHoldRows" :key="row.key">
                <span>{{ row.label }}</span>
                <b>{{ row.value }}</b>
                <small>{{ row.detail }}</small>
              </div>
            </div>
          </div>
        </section>
        <section class="panel ranking-panel">
          <div class="section-head">
            <div>
              <p>{{ tr("箱型选择") }}</p>
              <h2>{{ ui("result.calculatedPlanComparison") }}</h2>
            </div>
            <div class="view-actions">
              <el-tag :type="loading ? 'warning' : 'primary'" effect="light">{{ tr(apiStatus) }}</el-tag>
              <el-button :icon="ArrowLeft" @click="goPlannerStep('cargos')">{{ tr("返回货物总览") }}</el-button>
              <el-button type="primary" :icon="Refresh" @click="recalculate(true)">{{ ui("result.recalculate") }}</el-button>
            </div>
          </div>
          <div class="container-grid">
            <el-button
              v-for="evaluation in sortedEvaluations"
              :key="evaluation.container.id"
              :class="{
                active: selectedContainerId === evaluation.container.id,
                best: result?.bestContainerId === evaluation.container.id,
                'balance-blocked': evaluation.fitStatus === 'balance-blocked',
                unavailable: evaluation.fitStatus === 'oversize'
              }"
              class="container-card"
              text
              :title="evaluationHint(evaluation)"
              @click="selectContainer(evaluation.container.id)"
            >
              <span class="container-icon">{{ containerIcon(evaluation.container.name) }}</span>
              <mark v-if="result?.bestContainerId === evaluation.container.id" class="container-recommend-mark">{{ ui("result.currentBestMark") }}</mark>
              <strong>{{ evaluationCardTitle(evaluation) }}</strong>
              <small>{{ evaluationCardSubtitle(evaluation) }}</small>
              <em class="freight-cost">{{ evaluationFreightText(evaluation) }}</em>
              <small class="utilization-line">{{ evaluationCardMetric(evaluation) }}</small>
              <b v-if="evaluationCardStatus(evaluation)" :class="['fit-status', evaluation.fitStatus || 'fit']">{{ evaluationCardStatus(evaluation) }}</b>
            </el-button>
          </div>
        </section>

        <section class="panel visual-panel">
          <div class="section-head">
            <div>
              <p>Interactive 3D Packing</p>
              <h2>{{ trContainerName(selectedContainer?.name || "请选择箱型") }} · {{ tr(`第 ${selectedBoxIndex} 货舱`) }}</h2>
            </div>
          </div>
          <ContainerScene
            :container="selectedContainer"
            :placements="selectedPlacements"
            :evaluation="selectedEvaluation"
            :selected-box="selectedBox"
            :balance-validation="selectedBox?.balanceValidation"
            v-model:show-remaining="showRemaining"
            v-model:show-mass-balance="showMassBalance"
            :busy="visualBusy"
            :waiting-for-result="sceneWaitingForResult"
            :exporting="exportingReport"
            :export-zip-label="exportZipLabel"
            :can-export="selectedPlanExportable"
            :can-export-zip="selectedPlanExportable && Boolean(selectedEvaluation?.packedBoxes?.length)"
            @render-state="handleSceneRenderState"
            @export-image="exportCurrentReport('png')"
            @export-pdf="exportCurrentReport('pdf')"
            @export-zip="exportAllReportsZip"
            @print="printCurrentPlan"
          >
            <template #box-switch>
              <div class="box-switch visual-box-switch visual-box-switch-bottom" v-if="selectedEvaluation?.packedBoxes?.length > 1">
                <span>{{ boxSwitchLabel }}</span>
                <el-button
                  v-for="box in selectedEvaluation.packedBoxes"
                  :key="box.index"
                  :class="{ active: selectedBoxIndex === box.index }"
                  size="small"
                  :type="selectedBoxIndex === box.index ? 'primary' : 'default'"
                  @click="switchBox(box.index)"
                >
                  {{ boxTabLabel(box) }}
                </el-button>
              </div>
            </template>
          </ContainerScene>
        </section>
        <section class="panel decision-flow-panel">
          <div class="section-head">
            <div>
              <p>{{ t("decisionFlow.eyebrow") }}</p>
              <h2>{{ t("decisionFlow.title") }}</h2>
            </div>
          </div>
          <div class="packing-progress-card">
            <div class="packing-progress-main">
              <span>{{ packingProgressState.kicker }}</span>
              <div class="packing-progress-title">
                <strong>{{ packingProgressState.title }}</strong>
                <b>{{ packingProgressState.percentText }}</b>
              </div>
              <div class="packing-progress-timer">
                <small>{{ packingProgressState.timerText }}</small>
                <em v-if="packingProgressState.slowHint">{{ packingProgressState.slowHint }}</em>
              </div>
            </div>
            <el-progress
              :percentage="packingProgressState.percent"
              :stroke-width="12"
              :show-text="false"
            />
            <div class="packing-progress-track" :aria-label="t('decisionFlow.progressTitle')">
              <div
                v-for="stage in packingProgressState.stages"
                :key="stage.key"
                :class="['packing-progress-stage', stage.status]"
              >
                <i></i>
                <span>{{ stage.label }}</span>
              </div>
            </div>
            <div class="packing-progress-live" :aria-label="t('decisionFlow.broadcast')">
              <Transition name="decision-line-slide" mode="out-in">
                <div :key="packingProgressState.liveKey" class="decision-live-line">
                  <span class="decision-live-kicker">{{ packingProgressState.liveKicker }}</span>
                  <strong class="decision-live-phase">{{ packingProgressState.phaseLabel }}</strong>
                  <p>{{ packingProgressState.liveText }}</p>
                  <small>{{ packingProgressState.liveMeta }}</small>
                </div>
              </Transition>
            </div>
          </div>
        </section>
      </section>
      </Transition>
    </main>

    <AlgorithmPage
      v-else-if="activePage === 'algorithm'"
      key="algorithm"
      :evaluation="selectedEvaluation"
    />
    <ContainerReferencePage
      v-else-if="activePage === 'containers'"
      key="containers"
      :containers="containers"
    />
    </Transition>
      </section>
    </div>

    <CargoModal v-if="cargoModalOpen" :cargo="editingCargo" @close="closeCargoModal" @save="saveCargo" />
    <ContainerModal
      v-if="containerModalOpen"
      :container="editingContainer"
      @close="closeContainerModal"
      @save="saveContainer"
    />
    <div v-if="profileOpen" class="modal-backdrop profile-backdrop">
      <div class="modal profile-modal">
        <header class="profile-modal-head">
          <div class="profile-identity">
            <span class="profile-avatar">{{ profileInitial }}</span>
          <div>
            <p>{{ ui("profile.personalCenter") }}</p>
            <h2>{{ userDisplayName }}</h2>
            <small>{{ currentUser?.username }}</small>
          </div>
        </div>
          <el-button class="icon-button" text @click="profileOpen = false">×</el-button>
        </header>
        <div class="profile-hero">
          <div>
            <span class="profile-role-pill">{{ profileRoleText }}</span>
            <span class="profile-role-pill profile-party-pill">{{ profilePartyRoleText }}</span>
            <h3>{{ ui("profile.welcomeUser", { name: userDisplayName }) }}</h3>
            <p>{{ ui("profile.description") }}</p>
          </div>
          <div class="profile-session-card">
            <span>{{ ui("profile.tokenValidUntil") }}</span>
            <strong>{{ sessionExpiryText }}</strong>
            <small>{{ ui("profile.autoLogout") }}</small>
          </div>
        </div>
        <div class="profile-summary-grid refined">
          <div><span>{{ ui("profile.cargoTypes") }}</span><strong>{{ cargoTypeCount }}</strong><small>{{ ui("profile.currentPlan") }}</small></div>
          <div><span>{{ ui("profile.totalCargoPieces") }}</span><strong>{{ cargoTotalQuantity }}</strong><small>{{ ui("unit.piece") }}</small></div>
          <div><span>{{ ui("profile.containerTypes") }}</span><strong>{{ containers.length }}</strong><small>{{ ui("profile.availableForCalculation") }}</small></div>
          <div><span>{{ ui("profile.planParameters") }}</span><strong>{{ utilizationPercent }}% / {{ globalGapCm }}cm</strong><small>{{ ui("profile.utilizationGap") }}</small></div>
        </div>
        <div class="profile-action-grid">
          <RouterLink to="/planner/config" @click="profileOpen = false">
            <b>{{ ui("profile.packingCalculation") }}</b><span>{{ ui("profile.configParametersContainers") }}</span>
          </RouterLink>
          <RouterLink to="/planner/cargos" @click="profileOpen = false">
            <b>{{ ui("profile.smartImport") }}</b><span>{{ ui("profile.excelTextRecognition") }}</span>
          </RouterLink>
          <RouterLink to="/algorithm" @click="profileOpen = false">
            <b>{{ ui("profile.algorithmNotes") }}</b><span>{{ ui("profile.viewRulesStrategies") }}</span>
          </RouterLink>
          <RouterLink v-if="currentUser?.role === 'ADMIN'" to="/admin" @click="profileOpen = false">
            <b>{{ ui("profile.adminConsole") }}</b><span>{{ ui("profile.employeesDevicesSystem") }}</span>
          </RouterLink>
        </div>
        <div class="profile-footer">
          <span>{{ profileRoleText }} / {{ currentUser?.username }}</span>
          <el-button type="danger" plain @click="handleLogout">{{ ui("profile.logout") }}</el-button>
        </div>
      </div>
    </div>
    <div v-if="packingTimeoutDialogOpen" class="modal-backdrop timeout-backdrop" @click.self="packingTimeoutDialogOpen = false">
      <div class="modal timeout-modal" role="dialog" aria-modal="true" :aria-label="t('packingTimeout.title')">
        <header class="timeout-modal-head">
          <div>
            <p>{{ t("packingTimeout.eyebrow") }}</p>
            <h2>{{ t("packingTimeout.title") }}</h2>
          </div>
          <el-button class="icon-button" text @click="packingTimeoutDialogOpen = false">×</el-button>
        </header>
        <div class="timeout-modal-body">
          <p class="timeout-lead">{{ t("packingTimeout.lead") }}</p>
          <div class="timeout-stat-grid">
            <div v-for="row in packingTimeoutDetailRows" :key="row.key">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
          <section class="timeout-section">
            <h3>{{ t("packingTimeout.reasonTitle") }}</h3>
            <p>{{ packingTimeoutReason }}</p>
          </section>
          <section v-if="packingTimeoutInfo?.lastDecision" class="timeout-section timeout-last-decision">
            <h3>{{ t("packingTimeout.lastDecisionTitle") }}</h3>
            <span>{{ t(`decisionFlow.steps.${packingTimeoutInfo.lastDecision.phaseKey}.label`) }} · {{ t("decisionFlow.recordIndex", { index: packingTimeoutInfo.lastDecision.index }) }}</span>
            <p>{{ tr(packingTimeoutInfo.lastDecision.text) }}</p>
          </section>
          <section class="timeout-section">
            <h3>{{ t("packingTimeout.suggestionTitle") }}</h3>
            <ul class="timeout-suggestion-list">
              <li v-for="item in packingTimeoutSuggestions" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
        <footer class="timeout-modal-footer">
          <el-button @click="packingTimeoutDialogOpen = false">{{ t("packingTimeout.close") }}</el-button>
          <el-button @click="goPlannerStep('config'); packingTimeoutDialogOpen = false">{{ t("packingTimeout.adjust") }}</el-button>
          <el-button type="primary" @click="packingTimeoutDialogOpen = false; recalculate(true)">{{ t("packingTimeout.retry") }}</el-button>
        </footer>
      </div>
    </div>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
  <SystemWaitOverlay
    :visible="loginRedirecting || pageLeaving"
    :message="pageLeaving ? t('landing.transition.returnHome') : loginRedirectText"
  />
  </template>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { UploadFile } from "element-plus";
import {
  ArrowLeft,
  Box,
  DataAnalysis,
  Delete,
  Document,
  Download,
  Expand,
  Fold,
  Grid,
  House,
  MagicStick,
  Operation,
  Plus,
  Refresh,
  Setting,
  Star,
  Tickets,
  Upload
} from "@element-plus/icons-vue";
import LanguageSwitcher from "./components/LanguageSwitcher.vue";
import LoginPage from "./components/LoginPage.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import WorkbenchPortal from "./components/WorkbenchPortal.vue";
import { exportPackingReportsZip, exportPackingReport } from "./services/exportReport";
import { assignCargoModels } from "./utils/cargoModels";
import { buildPreviewInWorker, readWorkbookInWorker } from "./services/excelImportClient";
import { calculatePacking, estimatePackingWorkload } from "./services/packingClient";
import { cloneDefaultContainers, defaultContainerForId, effectiveContainerHeight, isDefaultContainerId, mergeDefaultContainers, normalizeContainerHeightFields, restoreDefaultContainer, restoreDefaultContainerPrice } from "./services/localData";
import { fetchAdminMe, logoutAdmin } from "./services/adminApi";
import { clearSession, isSessionExpired, storedExpiresAt, storedToken, storedUser } from "./services/authSession";
import { currentLocale, elementPlusLocale, t } from "./i18n";
import { translateLegacyText } from "./i18n/legacyText";
import { translateUiText } from "./i18n/uiText";
import { cargoLabel, fmt, shortType, uid } from "./utils/format";
import { cargoConstraintFlags, cargoHandlingUnitType, normalizeCargoConstraints } from "./utils/cargoConstraints";

const AdminDashboard = defineAsyncComponent(() => import("./components/AdminDashboard.vue"));
const AlgorithmPage = defineAsyncComponent(() => import("./components/AlgorithmPage.vue"));
const ExcelTemplatePage = defineAsyncComponent(() => import("./components/ExcelTemplatePage.vue"));
const HomePage = defineAsyncComponent(() => import("./components/HomePage.vue"));
const PublicLandingPage = defineAsyncComponent(() => import("./components/PublicLandingPage.vue"));
const BusinessCustomerPage = defineAsyncComponent(() => import("./components/BusinessCustomerPage.vue"));
const CargoModal = defineAsyncComponent(() => import("./components/CargoModal.vue"));
const ContainerModal = defineAsyncComponent(() => import("./components/ContainerModal.vue"));
const ContainerReferencePage = defineAsyncComponent(() => import("./components/ContainerReferencePage.vue"));
const ContainerScene = defineAsyncComponent(() => import("./components/ContainerScene.vue"));

const STORAGE_KEY = "cargo-planner-vue-state";
const TEMPLATE_STORAGE_KEY = "cargo-planner-cargo-templates";
const PACKING_RESULT_CACHE_LIMIT = 6;
const packingResultCache = new Map<string, any>();
const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const DEFAULT_BALANCE_SETTINGS = {
  greenLimitPercent: 2.5,
  redLimitPercent: 5,
  frontMaxPercent: 60,
  rearMinPercent40FR: 30,
  lateralOffsetLimitCm: 8,
  skipBelowWeightKg: 18000
};
const BALANCE_PRESETS = {
  strict: {
    greenLimitPercent: 2,
    redLimitPercent: 4,
    frontMaxPercent: 58,
    rearMinPercent40FR: 35,
    lateralOffsetLimitCm: 6,
    skipBelowWeightKg: 12000
  },
  standard: DEFAULT_BALANCE_SETTINGS,
  loose: {
    greenLimitPercent: 4,
    redLimitPercent: 8,
    frontMaxPercent: 65,
    rearMinPercent40FR: 25,
    lateralOffsetLimitCm: 12,
    skipBelowWeightKg: 24000
  }
};

const route = useRoute();
const router = useRouter();
const profileVersion = ref(0);
const sidebarCollapsed = ref(false);
const authChecked = ref(false);
const workspaceReady = ref(false);
const hasStoredWorkspace = ref(false);
const currentUser = ref(storedUser());
const profileOpen = ref(false);
const pageLeaving = ref(false);
const loginRedirecting = ref(false);
const loginRedirectText = ref("正在进入系统...");
const routeName = computed(() => String(route.name || ""));
const activePage = computed(() => {
  if (routeName.value.startsWith("planner")) return "planner";
  if (routeName.value === "containers") return "containers";
  return routeName.value || "home";
});
const plannerMode = computed(() => {
  if (routeName.value === "planner-cargos") return "cargos";
  if (routeName.value === "planner-results") return "results";
  return "config";
});
const activePlannerStep = computed(() => plannerMode.value === "results" ? "results" : "config");
const activeStepIndex = computed(() => activePlannerStep.value === "results" ? 1 : 0);
const activePlannerStepLabelRaw = computed(() =>
  activePlannerStep.value === "results" ? "计算方案" : "配置与货物管理"
);
const activePlannerStepLabel = computed(() => tr(activePlannerStepLabelRaw.value));
const activeMenuIndex = computed(() => {
  if (activePage.value === "workbenches") return "/workbenches";
  if (activePage.value === "planner") return activePlannerStep.value === "results" ? "/planner/results" : "/planner/config";
  if (activePage.value === "algorithm") return "/algorithm";
  if (activePage.value === "containers") return "/containers";
  return "/home";
});
const pageTitleRaw = computed(() => ({
  home: "工作台首页",
  planner: "装箱计算",
  algorithm: "算法说明",
  containers: "箱型资料",
  admin: "管理后台"
}[activePage.value] || "工作台"));
const pageTitle = computed(() => tr(pageTitleRaw.value));
const userDisplayName = computed(() => {
  profileVersion.value;
  return currentUser.value?.displayName || currentUser.value?.username || "操作员";
});
const profileInitial = computed(() => userDisplayName.value.slice(0, 1).toUpperCase());
const profileRoleText = computed(() => ui({
  ADMIN: "profile.role.admin",
  BUSINESS: "profile.role.business",
  EMPLOYEE: "profile.role.employee"
}[currentUser.value?.role] || "profile.role.employee"));
const profilePartyRoleText = computed(() => t({
  AGENT: "customers.roleAgent",
  SHIPPER: "customers.roleShipper",
  CONSIGNEE: "customers.roleConsignee"
}[currentUser.value?.partyRole || (["BUSINESS", "ADMIN"].includes(currentUser.value?.role) ? "AGENT" : "SHIPPER")] || "customers.roleShipper"));
const sessionExpiryText = computed(() => {
  const value = storedExpiresAt();
  if (!value) return "6 小时";
  return new Intl.DateTimeFormat(dateLocale(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
});
const cargos = ref([]);
const containers = ref([]);
const result = ref(null);
const selectedContainerId = ref("");
const priorityContainerIds = ref<string[]>([]);
const selectedBoxIndex = ref(1);
const utilizationPercent = ref(90);
const globalGapCm = ref(1);
const supportRatioPercent = ref(80);
const nonStackSupportRatioPercent = ref(98.5);
const balanceSettings = ref(normalizeBalanceSettings());
const activeBalancePreset = ref("standard");
const loading = ref(false);
const fileImporting = ref(false);
const quickImportMode = ref("append");
const switchingBox = ref(false);
const sceneRendering = ref(false);
const showRemaining = ref(true);
const showMassBalance = ref(true);
const cargoModalOpen = ref(false);
const containerModalOpen = ref(false);
const smartImportOpen = ref(false);
const selectedCargoRows = ref<any[]>([]);
const editingCargo = ref(null);
const editingContainer = ref(null);
const cargoTemplates = ref([]);
const templateName = ref("");
const exportingReport = ref(false);
const toast = ref("");
const cargoImportNotice = ref<{ key: string; params?: Record<string, unknown> } | null>(null);
const apiStatus = ref("本机计算");
const decisionLogs = ref<any[]>([]);
const packingWorkerProgress = ref<any | null>(null);
const packingTimeoutDialogOpen = ref(false);
const packingTimeoutInfo = ref<any | null>(null);
const calcElapsedSeconds = ref(0);

let timer = 0;
let calcSeq = 0;
let calcElapsedTimer = 0;
let pageLeaveTimer = 0;

const sortedEvaluations = computed(() => result.value?.evaluations || []);
const cargoImportNoticeText = computed(() => {
  if (!cargoImportNotice.value?.key) return "";
  return ui(cargoImportNotice.value.key, cargoImportNotice.value.params || {});
});
const selectedEvaluation = computed(() => {
  if (!sortedEvaluations.value.length) return null;
  return sortedEvaluations.value.find((item) => item.container.id === selectedContainerId.value) || sortedEvaluations.value[0];
});
const selectedBox = computed(() => {
  const boxes = selectedEvaluation.value?.packedBoxes || [];
  return boxes.find((box) => box.index === selectedBoxIndex.value) || boxes[0] || { placed: [] };
});
const selectedContainer = computed(() => selectedBox.value?.container || selectedEvaluation.value?.container || containers.value[0] || null);
const selectedPlacements = computed(() =>
  (selectedBox.value.placed || []).map((item) => ({ ...item, type: shortType(item.type) }))
);
const detailedBoxCount = computed(() => selectedEvaluation.value?.packedBoxes?.length || 0);
const hasUndetailedBoxes = computed(() =>
  Boolean(selectedEvaluation.value?.estimatedBoxes && Number(selectedEvaluation.value?.boxes || 0) > detailedBoxCount.value)
);
const boxSwitchLabel = computed(() => {
  const total = Number(selectedEvaluation.value?.boxes || 0);
  if (hasUndetailedBoxes.value) return tr(`显示已详算货舱 ${detailedBoxCount.value} / 约 ${total}`);
  return tr(`显示货舱 ${detailedBoxCount.value || total}`);
});
const exportZipLabel = computed(() => hasUndetailedBoxes.value ? "导出已详算 ZIP" : "导出整套 ZIP");
const selectedPlanExportable = computed(() =>
  Boolean(selectedPlacements.value.length && isEvaluationExportable(selectedEvaluation.value))
);
const resultSummary = computed(() => {
  const evaluations = sortedEvaluations.value || [];
  const counts = evaluations.reduce((acc, evaluation) => {
    const level = evaluationBalanceLevel(evaluation);
    acc[level] += 1;
    return acc;
  }, { green: 0, yellow: 0, estimated: 0, red: 0, oversize: 0 });
  const best = evaluations.find((evaluation) => evaluation?.fitStatus === "fit") || null;
  const boxes = Number(best?.boxes || 0);
  return {
    ...counts,
    boxesText: boxes > 0 ? `${best?.estimatedBoxes ? "约 " : ""}${boxes} 箱` : "-",
    containerName: best?.mixedPlan?.summary || best?.container?.name || ui("result.noFeasiblePlan"),
    freightLabel: best?.fitStatus === "fit" && evaluationPriceComparisonEligible(best) ? ui("result.bestFreight") : best ? evaluationFreightLabel(best) : ui("result.bestFreight"),
    freightText: best ? evaluationFreightAmountText(best) : "-",
    recommendationText: best
      ? `${best.mixedPlan?.summary || best.container.name} / ${evaluationFitText(best)}`
      : evaluations.length ? ui("result.noFeasiblePlan") : "暂无计算结果"
  };
});
const resultOptimizationRows = computed(() => buildResultOptimizationRows(sortedEvaluations.value));
const resultMixedHoldRows = computed(() => buildMixedHoldRows(sortedEvaluations.value.find((evaluation) => evaluation?.fitStatus === "fit")));
const decisionFlowSteps = computed(() => {
  currentLocale.value;
  return buildDecisionFlow(decisionLogs.value, loading.value);
});
const decisionFlowCurrent = computed(() => {
  const latest = [...decisionLogs.value].reverse().find((item) => item?.level !== "detail" && item?.text);
  return latest ? enrichDecisionLog(latest) : null;
});
const visualBusy = computed(() => switchingBox.value || sceneRendering.value);
const sceneWaitingForResult = computed(() => loading.value && !selectedPlacements.value.length);
const packingProgressState = computed(() => {
  currentLocale.value;
  return buildPackingProgressState({
    current: decisionFlowCurrent.value,
    progress: packingWorkerProgress.value,
    logTotal: decisionLogTotal.value,
    loading: loading.value,
    rendering: sceneRendering.value || switchingBox.value,
    hasResult: Boolean(selectedEvaluation.value?.packedBoxes?.length),
    elapsedSeconds: calcElapsedSeconds.value
  });
});
const decisionLogTotal = computed(() => {
  const latestIndex = Number(decisionFlowCurrent.value?.index || 0);
  return Math.max(decisionLogs.value.length, latestIndex);
});
const packingTimeoutDetailRows = computed(() => {
  const info = packingTimeoutInfo.value || {};
  const workload = info.workload || packingWorkloadHint.value;
  return [
    { key: "elapsed", label: t("packingTimeout.elapsed"), value: Number.isFinite(info.elapsedSeconds) ? durationText(info.elapsedSeconds) : "-" },
    { key: "timeout", label: t("packingTimeout.timeout"), value: Number.isFinite(info.timeoutSeconds) ? durationText(info.timeoutSeconds) : "-" },
    { key: "cargo", label: t("packingTimeout.cargoScale"), value: t("packingTimeout.cargoScaleValue", { types: workload.typeCount || 0, pieces: workload.rawUnitCount || 0 }) },
    { key: "containers", label: t("packingTimeout.containerScale"), value: t("packingTimeout.containerScaleValue", { count: workload.containerCount || containers.value.length || 0 }) },
    { key: "records", label: t("packingTimeout.decisionRecords"), value: t("decisionFlow.recordTotal", { count: info.decisionCount || decisionLogTotal.value || 0 }) },
    { key: "status", label: t("packingTimeout.currentStatus"), value: info.statusKey ? t(info.statusKey) : apiStatus.value || "-" }
  ];
});
const packingTimeoutReason = computed(() => {
  const workload = packingTimeoutInfo.value?.workload || packingWorkloadHint.value;
  const base = [
    tr(workload.detail || ""),
    tr(workload.advice || "")
  ].filter(Boolean).join(" ");
  return base || t("packingTimeout.reasonFallback");
});
const packingTimeoutSuggestions = computed(() => [
  t("packingTimeout.suggestionReduceContainers"),
  t("packingTimeout.suggestionSplitCargo"),
  t("packingTimeout.suggestionUsePartial")
]);
const containerSourceRows = computed(() =>
  containers.value.map((container: any) => ({
    ...container,
    dimensionSource: container.dimensionSource || "用户自定义",
    dimensionBasis: container.dimensionBasis || "手动录入尺寸",
    dimensionNote: container.dimensionNote || "自定义箱型，请按实际设备复核。"
  }))
);
const calculationContainers = computed(() => {
  const selectedIds = new Set(priorityContainerIds.value);
  const selected = containers.value.filter((container: any) => selectedIds.has(container.id));
  return selected.length ? selected : defaultPriorityContainers();
});
const cargoTypeCount = computed(() => cargos.value.length);
const cargoTotalQuantity = computed(() =>
  cargos.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const cargoTotalWeightKg = computed(() =>
  cargos.value.reduce((sum, cargo) => sum + Number(cargo.weightKg || 0) * Number(cargo.quantity || 0), 0)
);
const cargoTotalVolumeM3 = computed(() =>
  cargos.value.reduce((sum, cargo) =>
    sum + Number(cargo.lengthCm || 0) * Number(cargo.widthCm || 0) * Number(cargo.heightCm || 0) * Number(cargo.quantity || 0) / 1000000,
  0)
);
const packingWorkloadHint = computed(() => estimatePackingWorkload({
  cargos: cargos.value,
  containers: calculationContainers.value,
  utilizationPercent: utilizationPercent.value,
  globalGapCm: globalGapCm.value,
  supportRatioPercent: supportRatioPercent.value,
  nonStackSupportRatioPercent: nonStackSupportRatioPercent.value,
  balanceSettings: balanceSettings.value
}));
const showPackingWorkloadHint = computed(() =>
  packingWorkloadHint.value.rawUnitCount >= 120
  || packingWorkloadHint.value.typeCount >= 40
  || packingWorkloadHint.value.seconds >= 20
);
const packingWorkloadDescription = computed(() => {
  currentLocale.value;
  return [packingWorkloadHint.value.detail, packingWorkloadHint.value.advice]
    .filter(Boolean)
    .map((item) => tr(item))
    .join(" ");
});
const plannerWorkflowSteps = computed(() => [
  {
    key: "config",
    no: "01",
    label: tr("配置与货物管理"),
    description: tr(`${utilizationPercent.value}% 可用率 / ${globalGapCm.value}cm 间隙 · ${cargoTypeCount.value} 类货物`),
    done: cargos.value.length > 0,
    disabled: false
  },
  {
    key: "results",
    no: "02",
    label: tr("计算方案"),
    description: selectedEvaluation.value ? `${trContainerName(selectedEvaluation.value.container.name)} / ${tr(evaluationFitText(selectedEvaluation.value))}` : tr("可视化与导出"),
    done: Boolean(selectedEvaluation.value?.packedBoxes?.length),
    disabled: !cargos.value.length
  }
]);

onMounted(async () => {
  window.addEventListener("auth-expired", handleAuthExpired);
  window.addEventListener("pageshow", resetGlobalWaitState);
  window.addEventListener("pagehide", resetGlobalWaitState);
  await initializeAuth();
  restoreState();
  restoreCargoTemplates();
  cargos.value = normalizeCargoModels(cargos.value);
  if (!containers.value.length) containers.value = cloneDefaultContainers();
  priorityContainerIds.value = normalizePriorityContainerIds(priorityContainerIds.value);
  if (!selectedContainerId.value && containers.value[0]) selectedContainerId.value = containers.value[0].id;
  if (!cargos.value.length && !hasStoredWorkspace.value) loadSample(false);
  workspaceReady.value = true;
  recalculate();
});

onUnmounted(() => {
  window.removeEventListener("auth-expired", handleAuthExpired);
  window.removeEventListener("pageshow", resetGlobalWaitState);
  window.removeEventListener("pagehide", resetGlobalWaitState);
  stopPackingElapsedTimer();
  window.clearTimeout(pageLeaveTimer);
});

watch([cargos, containers, priorityContainerIds, utilizationPercent, globalGapCm, supportRatioPercent, nonStackSupportRatioPercent, balanceSettings], () => {
  persistState();
  window.clearTimeout(timer);
  timer = window.setTimeout(recalculate, 400);
}, { deep: true });

watch([showRemaining, showMassBalance], persistState);
watch([workspaceReady, activePage, plannerMode, cargoTypeCount], () => {
  if (workspaceReady.value && activePage.value === "planner" && plannerMode.value === "results" && !cargos.value.length) {
    router.replace("/planner/config");
    showToast("请先确认配置并录入货物，再进入计算方案。");
  }
});
watch([activePage, currentUser, authChecked], () => {
  if (authChecked.value && activePage.value === "admin" && currentUser.value?.role !== "ADMIN") {
    router.replace("/workbenches");
  }
  if (authChecked.value && activePage.value === "customers" && !["BUSINESS", "ADMIN"].includes(currentUser.value?.role)) {
    router.replace("/workbenches");
  }
});

async function initializeAuth() {
  const cachedUser = storedUser();
  if (!storedToken() || isSessionExpired()) {
    clearSession();
    currentUser.value = null;
    authChecked.value = true;
    return;
  }
  try {
    currentUser.value = await fetchAdminMe();
  } catch (error) {
    if (cachedUser && storedToken() && error?.retryable !== false) {
      currentUser.value = cachedUser;
      showToast("已恢复本地登录状态，后台连接恢复后会自动继续校验。");
    } else {
      clearSession();
      currentUser.value = null;
    }
  } finally {
    authChecked.value = true;
  }
}

async function handleLoggedIn(user) {
  currentUser.value = user;
  profileVersion.value += 1;
  const isAdmin = user?.role === "ADMIN";
  const target = isAdmin ? "/admin" : "/workbenches";
  loginRedirectText.value = t(isAdmin ? "portal.enteringAdmin" : "portal.entering");
  loginRedirecting.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 520));
  await router.replace(target);
  window.setTimeout(() => {
    loginRedirecting.value = false;
  }, 260);
}

async function handleLogout() {
  try {
    await logoutAdmin();
  } catch {
    clearSession();
  }
  currentUser.value = null;
  profileOpen.value = false;
  router.push("/workbenches");
}

function handleAuthExpired() {
  clearSession();
  currentUser.value = null;
  profileOpen.value = false;
  showToast("登录已过期，请重新登录。");
}

function handleUserUpdated(user) {
  if (user) currentUser.value = user;
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    hasStoredWorkspace.value = Boolean(raw);
    const saved = JSON.parse(raw || "{}");
    cargos.value = saved.cargos || [];
    containers.value = mergeDefaultContainers(saved.containers || []);
    utilizationPercent.value = saved.utilizationPercent || 90;
    globalGapCm.value = saved.globalGapCm ?? 1;
    supportRatioPercent.value = clampNumber(saved.supportRatioPercent, 50, 100, 80);
    nonStackSupportRatioPercent.value = clampNumber(saved.nonStackSupportRatioPercent, 80, 100, 98.5);
    const savedBalanceSettings = (!saved.balancePreset || saved.balancePreset === "standard") && Number(saved.balanceSettings?.skipBelowWeightKg) === 10000
      ? { ...saved.balanceSettings, skipBelowWeightKg: DEFAULT_BALANCE_SETTINGS.skipBelowWeightKg }
      : saved.balanceSettings;
    balanceSettings.value = normalizeBalanceSettings(savedBalanceSettings);
    activeBalancePreset.value = saved.balancePreset || detectBalancePreset(balanceSettings.value);
    showRemaining.value = saved.showRemaining ?? true;
    showMassBalance.value = saved.showMassBalance ?? true;
    selectedContainerId.value = saved.selectedContainerId || "";
    priorityContainerIds.value = Array.isArray(saved.priorityContainerIds) ? saved.priorityContainerIds : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    hasStoredWorkspace.value = false;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    cargos: cargos.value,
    containers: containers.value,
    utilizationPercent: utilizationPercent.value,
    globalGapCm: globalGapCm.value,
    supportRatioPercent: supportRatioPercent.value,
    nonStackSupportRatioPercent: nonStackSupportRatioPercent.value,
    balanceSettings: balanceSettings.value,
    balancePreset: activeBalancePreset.value,
    showRemaining: showRemaining.value,
    showMassBalance: showMassBalance.value,
    selectedContainerId: selectedContainerId.value,
    priorityContainerIds: priorityContainerIds.value
  }));
}

function restoreCargoTemplates() {
  try {
    const stored = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
    cargoTemplates.value = Array.isArray(stored)
      ? stored.filter((template) => template?.id && template?.name && Array.isArray(template.cargos)).slice(0, 20)
      : [];
  } catch {
    localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    cargoTemplates.value = [];
  }
}

function persistCargoTemplates() {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(cargoTemplates.value.slice(0, 20)));
}

function normalizeTemplateName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function templateDisplayName(template) {
  return normalizeTemplateName(template?.name) || ui("template.unnamed");
}

function defaultCargoTemplateName() {
  return ui("template.generatedName", {
    types: cargos.value.length,
    pieces: cargos.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
  });
}

function uniqueCargoTemplateName(baseName) {
  const normalizedBase = normalizeTemplateName(baseName) || defaultCargoTemplateName();
  const existingNames = new Set(cargoTemplates.value.map((item) => normalizeTemplateName(item.name)));
  if (!existingNames.has(normalizedBase)) return normalizedBase;
  let index = 2;
  let candidate = `${normalizedBase} (${index})`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${normalizedBase} (${index})`;
  }
  return candidate;
}

function goPlannerStep(stepKey) {
  if (stepKey === "results" && !cargos.value.length) {
    showToast("请先录入货物，再计算装箱方案。");
    router.push("/planner/cargos");
    return;
  }
  const routeMap = {
    config: "/planner/config",
    cargos: "/planner/cargos",
    results: "/planner/results"
  };
  router.push(routeMap[stepKey] || "/planner/config");
}

function handleMenuSelect(index) {
  if (index === "/planner/results") {
    goPlannerStep("results");
    return;
  }
  router.push(index);
}

function handleReturnHome(event: MouseEvent) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;

  event.preventDefault();
  if (pageLeaving.value) return;
  pageLeaving.value = true;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.clearTimeout(pageLeaveTimer);
  pageLeaveTimer = window.setTimeout(() => {
    // A full navigation releases the heavy planning workspace and lets `/`
    // boot through the dedicated lightweight landing entry.
    window.location.assign("/");
  }, reduceMotion ? 0 : 180);
}

function resetGlobalWaitState() {
  window.clearTimeout(pageLeaveTimer);
  pageLeaveTimer = 0;
  pageLeaving.value = false;
  loginRedirecting.value = false;
}

function buildPackingPayload(activeContainers = calculationContainers.value) {
  return {
    cargos: cargos.value,
    containers: activeContainers,
    utilizationPercent: utilizationPercent.value,
    globalGapCm: globalGapCm.value,
    supportRatioPercent: supportRatioPercent.value,
    nonStackSupportRatioPercent: nonStackSupportRatioPercent.value,
    balanceSettings: balanceSettings.value
  };
}

function normalizeCacheValue(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeCacheValue(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((next, key) => {
      const field = value[key];
      if (typeof field !== "function" && field !== undefined) {
        next[key] = normalizeCacheValue(field);
      }
      return next;
    }, {});
  }
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(4)) : value;
  return value;
}

function packingCacheKey(payload) {
  return JSON.stringify(normalizeCacheValue(payload));
}

function cloneForCache(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function rememberPackingResult(key, nextResult) {
  if (!key || !nextResult) return false;
  try {
    // Clone before Vue turns the result into a reactive Proxy. Some browsers
    // reject Proxy instances in structuredClone even though the packing result
    // itself only contains serializable data.
    const cachedResult = cloneForCache(nextResult);
    packingResultCache.delete(key);
    packingResultCache.set(key, cachedResult);
    while (packingResultCache.size > PACKING_RESULT_CACHE_LIMIT) {
      const oldestKey = packingResultCache.keys().next().value;
      packingResultCache.delete(oldestKey);
    }
    return true;
  } catch (error) {
    // A cache is only an optimization. Never turn a completed packing run into
    // a calculation failure because the browser could not clone a large result.
    packingResultCache.delete(key);
    console.warn("Packing result cache skipped because cloning failed.", error);
    return false;
  }
}

function restorePackingResult(key) {
  if (!key) return null;
  const cachedResult = packingResultCache.get(key);
  if (!cachedResult) return null;
  try {
    return normalizeResult(cloneForCache(cachedResult));
  } catch (error) {
    packingResultCache.delete(key);
    console.warn("Packing result cache was discarded because restoring failed.", error);
    return null;
  }
}

function buildResultOptimizationRows(evaluations = []) {
  const best = evaluations.find((evaluation) => evaluation?.fitStatus === "fit");
  if (!best) return [];
  const rows = [{
    key: "best",
    label: ui("result.optimizationBest"),
    value: evaluationPlanName(best),
    detail: `${evaluationFitText(best)} / ${evaluationFreightText(best)}`
  }];
  const bestComparable = evaluationPriceComparisonEligible(best);
  const baseline = bestComparable
    ? evaluations.find((item) => item && item !== best && !item.isMixedPlan && !item.container?.mixedPlan && item.fitStatus === "fit" && evaluationPriceComparisonEligible(item))
      || evaluations.find((item) => item && item !== best && item.fitStatus === "fit" && evaluationPriceComparisonEligible(item))
    : null;
  if (baseline) {
    const saving = evaluationFreightValue(baseline) - evaluationFreightValue(best);
    rows.push({
      key: "compare",
      label: ui("result.optimizationCompare"),
      value: evaluationPlanName(baseline),
      detail: saving > 0
        ? ui("result.optimizationSaving", { amount: formatCurrency(saving, evaluationFreightCurrency(best)) })
        : ui("result.optimizationNoSaving")
    });
  }
  if (best.isMixedPlan || best.container?.mixedPlan) {
    rows.push({
      key: "mixed",
      label: ui("result.optimizationMixed"),
      value: best.mixedPlan?.summary ? trPlanSummary(best.mixedPlan.summary) : ui("result.mixedPlan"),
      detail: ui("result.optimizationMixedDetail")
    });
  }
  return rows;
}

function buildMixedHoldRows(evaluation) {
  if (!(evaluation?.isMixedPlan || evaluation?.container?.mixedPlan)) return [];
  return (evaluation.packedBoxes || []).map((box) => ({
    key: `hold-${box.index}`,
    label: ui("result.holdLabel", { index: box.index }),
    value: trContainerName(box.container?.name || ""),
    detail: ui("result.holdDetail", {
      pieces: sumPlacementQuantity(box.placed),
      freight: formatCurrency(containerReferencePrice(box.container), containerReferenceCurrency(box.container))
    })
  }));
}

function evaluationPlanName(evaluation) {
  if (!evaluation) return "-";
  const summary = evaluation?.mixedPlan?.summary;
  if (summary) return trPlanSummary(summary);
  const name = trContainerName(evaluation?.container?.name || "");
  const boxes = Number(evaluation?.boxes || 0);
  return boxes > 1 ? `${name} x ${boxes}` : name;
}

function sumPlacementQuantity(placements = []) {
  return placements.reduce((sum, item) => sum + Number(item?.quantity || 1), 0);
}

async function recalculate(force = false) {
  const activeContainers = calculationContainers.value;
  if (!cargos.value.length || !activeContainers.length) return;
  const seq = ++calcSeq;
  const payload = buildPackingPayload(activeContainers);
  const cacheKey = packingCacheKey(payload);
  const cachedResult = force ? null : restorePackingResult(cacheKey);
  if (cachedResult) {
    result.value = cachedResult;
    apiStatus.value = ui("result.cacheHit");
    selectedContainerId.value = result.value.bestContainerId || result.value.evaluations[0]?.container.id || selectedContainerId.value;
    selectedBoxIndex.value = 1;
    loading.value = false;
    packingTimeoutDialogOpen.value = false;
    stopPackingElapsedTimer();
    return;
  }

  const startedAt = Date.now();
  const workload = estimatePackingWorkload(payload);
  loading.value = true;
  startPackingElapsedTimer(startedAt);
  decisionLogs.value = [];
  packingWorkerProgress.value = null;
  packingTimeoutDialogOpen.value = false;
  apiStatus.value = workload.seconds >= 20 ? `预计 ${workload.durationLabel}` : "正在计算";
  try {
    const nextResult = await calculatePacking(payload, {
      maxDecisionEntries: 800,
      decisionBatchSize: 10,
      progressIntervalMs: 250,
      onDecision(decisions) {
        if (seq !== calcSeq) return;
        appendDecisionLogs(decisions);
      },
      onProgress(progress) {
        if (seq !== calcSeq) return;
        packingWorkerProgress.value = progress;
      },
      onPartialResult(partialResult) {
        if (seq !== calcSeq || !partialResult) return;
        result.value = normalizeResult(partialResult);
        apiStatus.value = t("packingStatus.partialReady");
        selectedContainerId.value = result.value.bestContainerId || result.value.evaluations[0]?.container.id || selectedContainerId.value;
        selectedBoxIndex.value = 1;
      }
    });
    if (seq !== calcSeq) return;
    const normalizedResult = normalizeResult(nextResult);
    rememberPackingResult(cacheKey, normalizedResult);
    result.value = normalizedResult;
    apiStatus.value = "本机计算";
    selectedContainerId.value = result.value.bestContainerId || result.value.evaluations[0]?.container.id || selectedContainerId.value;
    selectedBoxIndex.value = 1;
  } catch (error) {
    if (seq !== calcSeq) return;
    apiStatus.value = "计算异常";
    if (error?.code === "PACKING_TIMEOUT") {
      apiStatus.value = t("packingTimeout.status");
      openPackingTimeoutDialog(error, workload, startedAt);
    } else {
      showToast(error.message || "本机计算失败，请检查货物参数。");
    }
  } finally {
    if (seq === calcSeq) {
      loading.value = false;
      stopPackingElapsedTimer(startedAt);
    }
  }
}
function appendDecisionLogs(decisions: any[]) {
  const normalized = (Array.isArray(decisions) ? decisions : [])
    .map((item) => ({
      index: Number(item?.index || 0),
      phase: String(item?.phase || "search"),
      level: String(item?.level || "summary"),
      text: String(item?.text || "").trim()
    }))
    .filter((item) => item.text);
  if (!normalized.length) return;
  decisionLogs.value = [...decisionLogs.value, ...normalized].slice(-300);
}

function clearDecisionLogs() {
  decisionLogs.value = [];
}

function handleSceneRenderState(active) {
  sceneRendering.value = Boolean(active);
}

function startPackingElapsedTimer(startedAt) {
  stopPackingElapsedTimer();
  calcElapsedSeconds.value = 0;
  calcElapsedTimer = window.setInterval(() => {
    calcElapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }, 1000);
}

function stopPackingElapsedTimer(startedAt = null) {
  if (calcElapsedTimer) {
    window.clearInterval(calcElapsedTimer);
    calcElapsedTimer = 0;
  }
  if (startedAt) {
    calcElapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }
}

function buildPackingProgressState({ current, progress, logTotal, loading: isLoading, rendering, hasResult, elapsedSeconds }) {
  const stages = packingProgressStages();
  const workerProgress = normalizePackingProgressState(progress);
  const currentPhase = workerProgress?.phaseKey || current?.phaseKey || "start";
  const activeStageKey = rendering
    ? "render"
    : isLoading
      ? packingStageKeyForPhase(currentPhase)
      : hasResult
        ? "done"
        : "start";
  const activeIndex = stages.findIndex((stage) => stage.key === activeStageKey);
  const percent = packingProgressPercent(activeStageKey, currentPhase, logTotal, isLoading, rendering, hasResult, workerProgress);
  const percentText = progressPercentText(percent);
  const timerText = t("decisionFlow.elapsedTimer", { value: durationText(elapsedSeconds || 0) });
  const slowHint = isLoading && Number(elapsedSeconds || 0) >= 20 ? t("decisionFlow.slowHint") : "";
  const enrichedStages = stages.map((stage, index) => ({
    ...stage,
    status: hasResult && !isLoading && !rendering
      ? "done"
      : index < activeIndex
        ? "done"
        : index === activeIndex
          ? "active"
          : "idle"
  }));

  if (rendering) {
    return {
      percent,
      percentText,
      stages: enrichedStages,
      kicker: t("decisionFlow.renderKicker"),
      title: t("decisionFlow.renderStage"),
      meta: t("decisionFlow.renderMeta"),
      timerText,
      slowHint,
      liveKey: `render-${selectedContainerId.value}-${selectedBoxIndex.value}`,
      liveKicker: t("decisionFlow.currentProgress"),
      phaseLabel: t("decisionFlow.renderStage"),
      liveText: t("decisionFlow.renderingText"),
      liveMeta: selectedEvaluation.value?.container?.name ? customerContainerMeta(selectedEvaluation.value.container.name) : t("decisionFlow.visualizing")
    };
  }

  if ((workerProgress || current?.text) && (isLoading || !hasResult)) {
    const customerProgress = workerProgress
      ? customerWorkerProgress(workerProgress, current)
      : customerDecisionProgress(current);
    return {
      percent,
      percentText,
      stages: enrichedStages,
      kicker: isLoading ? t("decisionFlow.calculating") : t("decisionFlow.latest"),
      title: customerProgress.title,
      meta: customerProgress.meta,
      timerText,
      slowHint,
      liveKey: workerProgress
        ? `progress-${workerProgress.phaseKey}-${workerProgress.containerIndex}-${workerProgress.boxIndex}-${workerProgress.strategyIndex}-${workerProgress.layerNo}-${workerProgress.percent}`
        : `decision-${current.index}-${current.phaseKey}`,
      liveKicker: t("decisionFlow.currentProgress"),
      phaseLabel: customerProgress.phaseLabel,
      liveText: customerProgress.text,
      liveMeta: customerProgress.meta
    };
  }

  if (hasResult) {
    return {
      percent,
      percentText,
      stages: enrichedStages,
      kicker: t("decisionFlow.latest"),
      title: t("decisionFlow.completeStage"),
      meta: t("decisionFlow.doneMeta"),
      timerText,
      slowHint: "",
      liveKey: "done",
      liveKicker: t("decisionFlow.currentProgress"),
      phaseLabel: t("decisionFlow.completeStage"),
      liveText: t("decisionFlow.doneText"),
      liveMeta: t("decisionFlow.doneMeta")
    };
  }

  return {
    percent,
    percentText,
    stages: enrichedStages,
    kicker: t("decisionFlow.calculating"),
    title: t("decisionFlow.waitingTitle"),
    meta: t("decisionFlow.waitingMeta"),
    timerText,
    slowHint,
    liveKey: "waiting",
    liveKicker: t("decisionFlow.currentProgress"),
    phaseLabel: t("decisionFlow.waitingTitle"),
    liveText: t("decisionFlow.waiting"),
    liveMeta: t("decisionFlow.waitingMeta")
  };
}

function packingProgressStages() {
  return [
    { key: "prepare", label: t("decisionFlow.steps.start.label") },
    { key: "preprocess", label: t("decisionFlow.steps.prepare.label") },
    { key: "container", label: t("decisionFlow.steps.container.label") },
    { key: "calculate", label: t("decisionFlow.calculateStage") },
    { key: "render", label: t("decisionFlow.renderStage") },
    { key: "done", label: t("decisionFlow.completeStage") }
  ];
}

function packingStageKeyForPhase(phaseKey) {
  if (phaseKey === "prepare") return "preprocess";
  if (phaseKey === "container") return "container";
  if (["strategy", "layer", "repair", "box", "recommendation"].includes(phaseKey)) return "calculate";
  return "prepare";
}

function packingProgressPercent(stageKey, phaseKey, logTotal, isLoading, rendering, hasResult, workerProgress = null) {
  if (rendering) return 96;
  if (hasResult && !isLoading) return 100;
  if (Number.isFinite(workerProgress?.percent)) {
    return Math.min(94.9, Math.max(1, Number(workerProgress.percent)));
  }
  const baseByPhase = {
    start: 8,
    prepare: 18,
    container: 30,
    strategy: 45,
    layer: 62,
    repair: 74,
    box: 84,
    recommendation: 90
  };
  const base = baseByPhase[phaseKey] ?? (stageKey === "calculate" ? 45 : 6);
  const recordBoost = Math.min(6, Math.log10(Math.max(1, Number(logTotal || 0))) * 3);
  return Math.min(94, Math.round(base + recordBoost));
}

function normalizePackingProgressState(progress) {
  if (!progress || typeof progress !== "object") return null;
  const percent = Number(progress.percent);
  return {
    ...progress,
    percent: Number.isFinite(percent) ? Math.min(99, Math.max(0, percent)) : 0,
    phaseKey: decisionPhaseKey(progress.phase),
    completedContainers: Number(progress.completedContainers || 0),
    totalContainers: Number(progress.totalContainers || 0),
    containerIndex: Number(progress.containerIndex || 0),
    boxIndex: Number(progress.boxIndex || 0),
    strategyIndex: Number(progress.strategyIndex || 0),
    strategyCount: Number(progress.strategyCount || 0),
    layerNo: Number(progress.layerNo || 0),
    remainingUnits: Number(progress.remainingUnits || 0),
    placedUnits: Number(progress.placedUnits || 0),
    containerName: String(progress.containerName || "")
  };
}

function progressPercentText(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function customerWorkerProgress(progress, current) {
  const raw = String(current?.text || "");
  const readable = tr(raw);
  const phaseKey = progress.phaseKey || current?.phaseKey || "start";
  const containerName = progress.containerName || decisionContainerName(raw);
  const scope = containerName ? customerContainerMeta(containerName) : t("decisionFlow.customerCurrentPlan");
  const layerNo = progress.layerNo || decisionLayerNumber(raw);
  const holdNo = progress.boxIndex || decisionHoldNumber(raw);
  const detail = compactDecisionText(decisionCustomerDetail(readable));
  const containerCounter = progress.totalContainers
    ? t("decisionFlow.containerCounter", {
      current: Math.min(progress.containerIndex || progress.completedContainers + 1, progress.totalContainers),
      total: progress.totalContainers
    })
    : "";
  const strategyCounter = progress.strategyIndex
    ? t("decisionFlow.strategyCounter", { current: progress.strategyIndex, total: progress.strategyCount || SEARCH_STRATEGIES_FALLBACK_COUNT })
    : "";
  const remainingMeta = progress.remainingUnits
    ? t("decisionFlow.remainingUnits", { count: progress.remainingUnits })
    : "";
  const layerMeta = layerNo ? t("decisionFlow.layerMeta", { layer: layerNo }) : "";
  const holdMeta = holdNo ? t("decisionFlow.holdMeta", { hold: holdNo }) : "";
  const meta = [scope, containerCounter, strategyCounter, holdMeta, layerMeta, remainingMeta].filter(Boolean).join(" · ");

  if (phaseKey === "layer") {
    return {
      title: t("decisionFlow.customerLoadingTitle"),
      phaseLabel: layerNo ? t("decisionFlow.customerLayerPhase", { layer: layerNo }) : t("decisionFlow.steps.layer.label"),
      text: layerNo
        ? t("decisionFlow.customerLayerText", { scope, layer: layerNo, detail })
        : t("decisionFlow.customerGenericText", { scope, detail }),
      meta
    };
  }
  if (phaseKey === "repair") {
    return {
      title: t("decisionFlow.customerOptimizingTitle"),
      phaseLabel: t("decisionFlow.steps.repair.label"),
      text: t("decisionFlow.customerSupportTuningText", { scope }),
      meta
    };
  }
  if (phaseKey === "box") {
    return {
      title: t("decisionFlow.customerSummaryTitle"),
      phaseLabel: t("decisionFlow.steps.box.label"),
      text: holdNo
        ? t("decisionFlow.customerBoxProgressText", { scope, hold: holdNo, remaining: progress.remainingUnits || 0 })
        : t("decisionFlow.customerGenericText", { scope, detail }),
      meta
    };
  }
  if (phaseKey === "strategy") {
    return {
      title: t("decisionFlow.customerStrategyTitle"),
      phaseLabel: t("decisionFlow.steps.strategy.label"),
      text: t("decisionFlow.customerStrategyProgressText", {
        scope,
        current: progress.strategyIndex || 1,
        total: progress.strategyCount || SEARCH_STRATEGIES_FALLBACK_COUNT,
        detail
      }),
      meta
    };
  }
  if (phaseKey === "container") {
    return {
      title: t("decisionFlow.customerEvaluatingTitle"),
      phaseLabel: t("decisionFlow.steps.container.label"),
      text: t("decisionFlow.customerContainerText", { scope }),
      meta
    };
  }
  if (phaseKey === "recommendation") {
    return {
      title: progress.partialReady ? t("packingStatus.partialReady") : t("decisionFlow.completeStage"),
      phaseLabel: t("decisionFlow.steps.recommendation.label"),
      text: progress.partialReady ? t("decisionFlow.partialReadyText", { scope }) : t("decisionFlow.customerRecommendationText"),
      meta: progress.partialReady ? t("decisionFlow.partialReadyMeta") : meta
    };
  }
  return {
    title: t("decisionFlow.customerPrepareTitle"),
    phaseLabel: t("decisionFlow.steps.start.label"),
    text: t("decisionFlow.customerPrepareText"),
    meta
  };
}

const SEARCH_STRATEGIES_FALLBACK_COUNT = 5;

function customerDecisionProgress(current) {
  const raw = String(current?.text || "");
  const readable = tr(raw);
  const phaseKey = current?.phaseKey || decisionPhaseKey(current?.phase);
  const containerName = decisionContainerName(raw);
  const scope = containerName ? customerContainerMeta(containerName) : t("decisionFlow.customerCurrentPlan");
  const layerNo = decisionLayerNumber(raw);
  const holdNo = decisionHoldNumber(raw);
  const detail = compactDecisionText(decisionCustomerDetail(readable));
  const layerMeta = layerNo ? t("decisionFlow.layerMeta", { layer: layerNo }) : "";
  const holdMeta = holdNo ? t("decisionFlow.holdMeta", { hold: holdNo }) : "";
  const meta = [scope, holdMeta, layerMeta].filter(Boolean).join(" · ");

  if (phaseKey === "layer") {
    return {
      title: t("decisionFlow.customerLoadingTitle"),
      phaseLabel: layerNo ? t("decisionFlow.customerLayerPhase", { layer: layerNo }) : t("decisionFlow.steps.layer.label"),
      text: layerNo
        ? t("decisionFlow.customerLayerText", { scope, layer: layerNo, detail })
        : t("decisionFlow.customerGenericText", { scope, detail }),
      meta
    };
  }
  if (phaseKey === "repair") {
    return {
      title: t("decisionFlow.customerOptimizingTitle"),
      phaseLabel: t("decisionFlow.steps.repair.label"),
      text: /lower-gap|support|tail|backfill|sparse/i.test(raw)
        ? t("decisionFlow.customerSupportTuningText", { scope })
        : t("decisionFlow.customerGenericText", { scope, detail }),
      meta
    };
  }
  if (phaseKey === "container") {
    return {
      title: t("decisionFlow.customerEvaluatingTitle"),
      phaseLabel: t("decisionFlow.steps.container.label"),
      text: t("decisionFlow.customerContainerText", { scope }),
      meta
    };
  }
  if (phaseKey === "strategy") {
    return {
      title: t("decisionFlow.customerStrategyTitle"),
      phaseLabel: t("decisionFlow.steps.strategy.label"),
      text: t("decisionFlow.customerStrategyText", { scope }),
      meta
    };
  }
  if (phaseKey === "box") {
    return {
      title: t("decisionFlow.customerSummaryTitle"),
      phaseLabel: t("decisionFlow.steps.box.label"),
      text: holdNo
        ? t("decisionFlow.customerHoldText", { scope, hold: holdNo, detail })
        : t("decisionFlow.customerGenericText", { scope, detail }),
      meta
    };
  }
  if (phaseKey === "recommendation") {
    return {
      title: t("decisionFlow.completeStage"),
      phaseLabel: t("decisionFlow.steps.recommendation.label"),
      text: t("decisionFlow.customerRecommendationText"),
      meta: t("decisionFlow.customerCurrentPlan")
    };
  }
  return {
    title: t("decisionFlow.customerPrepareTitle"),
    phaseLabel: current?.phaseLabel || t("decisionFlow.steps.start.label"),
    text: t("decisionFlow.customerPrepareText"),
    meta: t("decisionFlow.customerCurrentPlan")
  };
}

function customerContainerMeta(containerName) {
  const index = containers.value.findIndex((container) => String(container?.name || "") === containerName);
  return index >= 0
    ? t("decisionFlow.customerContainerMeta", { index: index + 1, container: trContainerName(containerName) })
    : trContainerName(containerName);
}

function decisionContainerName(raw) {
  const text = String(raw || "");
  const matched = containers.value.find((container) => container?.name && text.includes(container.name));
  if (matched?.name) return matched.name;
  return text.split(/\s+[·-]\s+/)[0]?.trim() || "";
}

function decisionLayerNumber(raw) {
  const match = String(raw || "").match(new RegExp("\\u7b2c\\s*(\\d+)\\s*\\u5c42")) || String(raw || "").match(/layer\s*(\d+)/i);
  return match?.[1] || "";
}

function decisionHoldNumber(raw) {
  const match = String(raw || "").match(new RegExp("\\u7b2c\\s*(\\d+)\\s*\\u8d27\\u8231")) || String(raw || "").match(/hold\s*(\d+)|box\s*(\d+)/i);
  return match?.[1] || match?.[2] || "";
}

function decisionCustomerDetail(text) {
  const value = String(text || "").trim();
  const colonIndex = Math.max(value.lastIndexOf("："), value.lastIndexOf(":"));
  const detail = colonIndex >= 0 ? value.slice(colonIndex + 1).trim() : value;
  return detail.replace(/\s+/g, " ") || t("decisionFlow.customerDetailFallback");
}

function openPackingTimeoutDialog(error, workload, startedAt) {
  const elapsedMs = Number(error?.elapsedMs || 0) || Math.max(0, Date.now() - startedAt);
  const timeoutMs = Number(error?.timeoutMs || 0) || elapsedMs;
  const lastDecision = decisionFlowCurrent.value;
  packingTimeoutInfo.value = {
    message: error?.message || t("packingTimeout.title"),
    workload: error?.workload || workload,
    elapsedSeconds: Math.ceil(elapsedMs / 1000),
    timeoutSeconds: Math.ceil(timeoutMs / 1000),
    decisionCount: decisionLogTotal.value,
    lastDecision,
    statusKey: result.value?.partial ? "packingTimeout.partialStatus" : "packingTimeout.noFinalStatus"
  };
  toast.value = "";
  packingTimeoutDialogOpen.value = true;
}

function durationText(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds || 0)));
  currentLocale.value;
  if (value < 60) return t("duration.secondsShort", { value });
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest
    ? t("duration.minutesSecondsShort", { minutes, seconds: rest })
    : t("duration.minutesShort", { minutes });
}

function enrichDecisionLog(item) {
  const phaseKey = decisionPhaseKey(item?.phase);
  return {
    ...item,
    phaseKey,
    phaseLabel: t(`decisionFlow.steps.${phaseKey}.label`)
  };
}

function decisionPhaseKey(phase) {
  const normalized = String(phase || "search");
  if (["layer", "placement"].includes(normalized)) return "layer";
  if (["strategy", "search"].includes(normalized)) return "strategy";
  return ["start", "prepare", "container", "repair", "box", "recommendation"].includes(normalized)
    ? normalized
    : "strategy";
}

function buildDecisionFlow(logs, isLoading) {
  const phases = [
    { key: "start", index: "01" },
    { key: "prepare", index: "02" },
    { key: "container", index: "03" },
    { key: "strategy", index: "04" },
    { key: "layer", index: "05" },
    { key: "repair", index: "06" },
    { key: "box", index: "07" },
    { key: "recommendation", index: "08" }
  ];
  const source = Array.isArray(logs) ? logs : [];
  const latestPhaseKey = decisionPhaseKey([...source].reverse().find((item) => item?.text)?.phase);
  const firstPendingIndex = phases.findIndex((phase) => !source.some((item) => decisionPhaseMatches(item?.phase, phase.key)));

  return phases.map((phase, phaseIndex) => {
    const phaseLogs = source.filter((item) => decisionPhaseMatches(item?.phase, phase.key));
    const summaryLog = [...phaseLogs].reverse().find((item) => item?.level !== "detail") || phaseLogs[phaseLogs.length - 1];
    const status = phaseLogs.length
      ? (isLoading && latestPhaseKey === phase.key ? "active" : "done")
      : (isLoading && phaseIndex === firstPendingIndex ? "active" : "idle");
    const description = t(`decisionFlow.steps.${phase.key}.description`);
    return {
      ...phase,
      label: t(`decisionFlow.steps.${phase.key}.label`),
      description,
      status,
      statusLabel: t(`decisionFlow.status.${status}`),
      count: phaseLogs.length,
      hasLog: Boolean(summaryLog?.text),
      summary: compactDecisionText(summaryLog?.text ? tr(summaryLog.text) : description)
    };
  });
}

function decisionPhaseMatches(phase, key) {
  const normalized = String(phase || "search");
  if (key === "layer") return ["layer", "placement"].includes(normalized);
  if (key === "strategy") return ["strategy", "search"].includes(normalized);
  return normalized === key;
}

function compactDecisionText(text) {
  const value = String(text || "").trim();
  if (value.length <= 96) return value;
  return `${value.slice(0, 94)}...`;
}

function normalizeResult(nextResult) {
  const evaluations = [...(nextResult?.evaluations || [])].sort(compareEvaluationForUi);
  return {
    ...nextResult,
    bestContainerId: evaluations.find((evaluation) => evaluation?.fitStatus === "fit")?.container?.id || null,
    evaluations
  };
}

function compareEvaluationForUi(a, b) {
  const statusDiff = evaluationStatusRank(a) - evaluationStatusRank(b);
  if (statusDiff) return statusDiff;
  const comparableDiff = (evaluationPriceComparisonEligible(a) ? 0 : 1) - (evaluationPriceComparisonEligible(b) ? 0 : 1);
  if (comparableDiff) return comparableDiff;
  const priceAvailabilityDiff = (evaluationPriceConfigured(a) ? 0 : 1) - (evaluationPriceConfigured(b) ? 0 : 1);
  if (priceAvailabilityDiff) return priceAvailabilityDiff;
  if (evaluationPriceComparisonEligible(a) && evaluationPriceComparisonEligible(b) && evaluationFreightCurrency(a) === evaluationFreightCurrency(b)) {
    const freightDiff = compareFiniteNumbers(evaluationFreightValue(a), evaluationFreightValue(b));
    if (freightDiff) return freightDiff;
  }
  const boxDiff = normalizedEvaluationBoxes(a) - normalizedEvaluationBoxes(b);
  if (boxDiff) return boxDiff;
  const fillDiff = evaluationAverageFill(b) - evaluationAverageFill(a);
  if (fillDiff) return fillDiff;
  const scoreA = Number(a?.recommendation?.score);
  const scoreB = Number(b?.recommendation?.score);
  if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) return scoreA - scoreB;
  return 0;
}

function defaultPriorityContainers() {
  const defaults = containers.value.filter((container: any) => isCommonBusinessContainer(container));
  const source = defaults.length ? defaults : containers.value.slice(0, Math.min(4, containers.value.length));
  return source;
}

function defaultPriorityContainerIds() {
  return defaultPriorityContainers().map((container: any) => container.id).filter(Boolean);
}

function normalizePriorityContainerIds(ids: unknown) {
  const validIds = new Set(containers.value.map((container: any) => container.id));
  const normalized = Array.isArray(ids)
    ? ids.map((id) => String(id)).filter((id) => validIds.has(id))
    : [];
  return normalized.length ? [...new Set(normalized)] : defaultPriorityContainerIds();
}

function isCommonBusinessContainer(container: any) {
  const text = `${container?.id || ""} ${container?.name || ""} ${container?.usagePriority || ""} ${container?.visualKind || ""} ${container?.equipmentClass || ""}`.toLowerCase();
  if (/rf|reefer|fr|flat|rack|\u51b7\u85cf|\u5e73\u677f/.test(text)) return false;
  return /gp|hq|high|common|dry/.test(text);
}

function applyPriorityContainerIds(values: string[]) {
  priorityContainerIds.value = normalizePriorityContainerIds(values);
  if (!calculationContainers.value.some((container: any) => container.id === selectedContainerId.value)) {
    selectedContainerId.value = calculationContainers.value[0]?.id || selectedContainerId.value;
    selectedBoxIndex.value = 1;
  }
  persistState();
}

function handlePriorityContainerChange(values: string[]) {
  applyPriorityContainerIds(values);
}

function selectCommonPriorityContainers() {
  applyPriorityContainerIds(defaultPriorityContainerIds());
}

function selectAllPriorityContainers() {
  applyPriorityContainerIds(containers.value.map((container: any) => container.id).filter(Boolean));
}

function selectContainer(id) {
  selectedContainerId.value = id;
  selectedBoxIndex.value = 1;
  persistState();
}

async function switchBox(index) {
  switchingBox.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  selectedBoxIndex.value = index;
  switchingBox.value = false;
}

function openCargoModal(cargo = null) {
  editingCargo.value = cargo ? { ...cargo } : null;
  cargoModalOpen.value = true;
}

function closeCargoModal() {
  cargoModalOpen.value = false;
  editingCargo.value = null;
}

function saveCargo(cargo) {
  const index = cargos.value.findIndex((item) => item.id === cargo.id);
  if (index >= 0) cargos.value.splice(index, 1, cargo);
  else cargos.value.push(cargo);
  cargos.value = normalizeCargoModels(cargos.value);
  closeCargoModal();
}

function deleteCargo(id, name) {
  if (!window.confirm(`确认删除「${name}」吗？`)) return;
  cargos.value = cargos.value.filter((item) => item.id !== id);
  if (!cargos.value.length) result.value = null;
  showToast("已删除货物。");
}

function handleCargoSelectionChange(rows: any[]) {
  selectedCargoRows.value = rows;
}

function deleteSelectedCargos() {
  if (!selectedCargoRows.value.length) return;
  if (!window.confirm(`确认删除选中的 ${selectedCargoRows.value.length} 类货物吗？`)) return;
  const ids = new Set(selectedCargoRows.value.map((item) => item.id));
  cargos.value = cargos.value.filter((item) => !ids.has(item.id));
  selectedCargoRows.value = [];
  if (!cargos.value.length) result.value = null;
  selectedBoxIndex.value = 1;
  showToast("已批量删除货物。");
}

function touchCargoList() {
  result.value = null;
  selectedBoxIndex.value = 1;
}

function openContainerModal(container = null) {
  editingContainer.value = container ? { ...container } : null;
  containerModalOpen.value = true;
}

function saveContainer(container) {
  const heightNormalizedContainer = normalizeContainerHeightFields(container);
  const existingIndex = containers.value.findIndex((item) => item.id === heightNormalizedContainer.id);
  const defaultContainer = defaultContainerForId(heightNormalizedContainer.id);
  const isDefault = Boolean(defaultContainer);
  const dimensionEdited = isDefault && containerDimensionsEdited(heightNormalizedContainer, defaultContainer);
  const referencePrice = Number(heightNormalizedContainer.referencePrice || 0);
  const defaultReferencePrice = Number(defaultContainer?.referencePrice || 0);
  const priceCleared = isDefault && Boolean(heightNormalizedContainer.priceEdited) && !(referencePrice > 0);
  const priceEdited = isDefault && (priceCleared || (referencePrice > 0 && Math.abs(referencePrice - defaultReferencePrice) >= 0.01));
  const normalized = {
    ...heightNormalizedContainer,
    dimensionEdited,
    priceEdited
  };
  if (dimensionEdited) {
    normalized.dimensionSource = "用户编辑尺寸";
    normalized.dimensionBasis = "手动编辑尺寸";
    normalized.dimensionNote = "已手动调整默认箱型尺寸，可在配置页一键恢复公开默认值。";
  } else if (isDefault) {
    normalized.dimensionSource = defaultContainer.dimensionSource;
    normalized.dimensionSourceUrl = defaultContainer.dimensionSourceUrl;
    normalized.dimensionBasis = defaultContainer.dimensionBasis;
    normalized.dimensionNote = defaultContainer.dimensionNote;
  }
  if (priceEdited) {
    normalized.referencePrice = referencePrice > 0 ? referencePrice : 0;
    normalized.referenceCurrency = "USD";
    normalized.routeQuoteId = "";
    normalized.referencePriceSource = referencePrice > 0 ? "\u7528\u6237\u7f16\u8f91\u53c2\u8003\u4ef7" : "\u672a\u8bbe\u7f6e\u4ef7\u683c";
    normalized.referencePriceSourceUrl = "";
    normalized.referencePriceBasis = referencePrice > 0
      ? "\u7528\u6237\u81ea\u5b9a\u4e49\u53c2\u8003\u4ef7\uff1b\u5b9e\u9645\u8ba2\u8231\u524d\u8bf7\u6309\u5b9e\u65f6\u8be2\u4ef7\u590d\u6838\u3002"
      : "\u5f53\u524d\u7bb1\u578b\u4ec5\u53c2\u4e0e\u53ef\u88c5\u6027\u8ba1\u7b97\uff0c\u4e0d\u53c2\u4e0e\u6700\u4f4e\u8fd0\u4ef7\u6bd4\u8f83\u3002";
  } else if (isDefault) {
    normalized.costFactor = defaultContainer.costFactor;
    normalized.referencePrice = defaultContainer.referencePrice;
    normalized.referenceCurrency = defaultContainer.referenceCurrency;
    normalized.referencePriceSource = defaultContainer.referencePriceSource;
    normalized.referencePriceSourceUrl = defaultContainer.referencePriceSourceUrl;
    normalized.referencePriceBasis = defaultContainer.referencePriceBasis;
    normalized.routeQuoteId = defaultContainer.routeQuoteId;
    normalized.priceTier = defaultContainer.priceTier;
    normalized.equipmentClass = defaultContainer.equipmentClass;
  }
  if (existingIndex >= 0) {
    containers.value.splice(existingIndex, 1, normalized);
  } else {
    containers.value.push(normalized);
    priorityContainerIds.value = normalizePriorityContainerIds([...priorityContainerIds.value, normalized.id]);
  }
  selectedContainerId.value = heightNormalizedContainer.id;
  closeContainerModal();
  showToast(existingIndex >= 0 ? ui("container.parametersUpdated") : ui("container.customAdded"));
}

function closeContainerModal() {
  containerModalOpen.value = false;
  editingContainer.value = null;
}

function resetContainers() {
  containers.value = cloneDefaultContainers();
  priorityContainerIds.value = defaultPriorityContainerIds();
  selectedContainerId.value = containers.value[0]?.id || "";
  showToast("已恢复默认箱型。");
}

function restoreContainerDefaults(container) {
  const restored = restoreDefaultContainer(container);
  if (!restored || !container?.id) return;
  containers.value = containers.value.map((item) => item.id === container.id ? restored : item);
  showToast(ui("container.restoredDefaults", { name: restored.name }));
}

function restoreContainerPrice(container) {
  const restored = restoreDefaultContainerPrice(container);
  if (!restored || !container?.id) return;
  containers.value = containers.value.map((item) => item.id === container.id ? restored : item);
  showToast(ui("container.restoredDefaultPrice", { name: restored.name || container.name }));
}

function isDefaultContainer(id) {
  return isDefaultContainerId(id);
}

function canRestoreContainerPrice(container) {
  if (!isDefaultContainerId(container?.id)) return false;
  const defaultContainer = defaultContainerForId(container.id);
  if (!defaultContainer) return false;
  return Boolean(container.priceEdited)
    || Math.abs(Number(container.referencePrice || 0) - Number(defaultContainer.referencePrice || 0)) >= 0.01;
}

function containerDimensionsEdited(container, defaultContainer) {
  if (!container || !defaultContainer) return false;
  return ["lengthCm", "widthCm", "heightCm", "heightLimitCm", "payloadKg"].some((field) =>
    Math.abs(Number(container[field] || 0) - Number(defaultContainer[field] || 0)) >= 0.01
  ) || Boolean(container.ignoreHeightLimit) !== Boolean(defaultContainer.ignoreHeightLimit);
}

function applyBalancePreset(value) {
  if (value === "custom") return;
  const preset = BALANCE_PRESETS[value] || BALANCE_PRESETS.standard;
  balanceSettings.value = normalizeBalanceSettings(preset);
}

function markBalanceCustom() {
  balanceSettings.value = normalizeBalanceSettings(balanceSettings.value);
  activeBalancePreset.value = detectBalancePreset(balanceSettings.value);
}

function normalizeBalanceSettings(settings = DEFAULT_BALANCE_SETTINGS) {
  const raw = { ...DEFAULT_BALANCE_SETTINGS, ...(settings || {}) };
  const redLimitPercent = clampNumber(raw.redLimitPercent, 3, 12, DEFAULT_BALANCE_SETTINGS.redLimitPercent);
  return {
    greenLimitPercent: Math.min(
      redLimitPercent,
      clampNumber(raw.greenLimitPercent, 1, 5, DEFAULT_BALANCE_SETTINGS.greenLimitPercent)
    ),
    redLimitPercent,
    frontMaxPercent: clampNumber(raw.frontMaxPercent, 55, 70, DEFAULT_BALANCE_SETTINGS.frontMaxPercent),
    rearMinPercent40FR: clampNumber(raw.rearMinPercent40FR, 20, 45, DEFAULT_BALANCE_SETTINGS.rearMinPercent40FR),
    lateralOffsetLimitCm: clampNumber(raw.lateralOffsetLimitCm, 4, 20, DEFAULT_BALANCE_SETTINGS.lateralOffsetLimitCm),
    skipBelowWeightKg: clampNumber(raw.skipBelowWeightKg, 0, 30000, DEFAULT_BALANCE_SETTINGS.skipBelowWeightKg)
  };
}

function detectBalancePreset(settings) {
  const normalized = normalizeBalanceSettings(settings);
  return Object.entries(BALANCE_PRESETS).find(([, preset]) =>
    Object.keys(DEFAULT_BALANCE_SETTINGS).every((key) => Number(preset[key]) === Number(normalized[key]))
  )?.[0] || "custom";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function applyUserSettings(settings) {
  utilizationPercent.value = Number(settings.utilizationPercent || utilizationPercent.value);
  globalGapCm.value = Number(settings.globalGapCm ?? globalGapCm.value);
  supportRatioPercent.value = clampNumber(settings.supportRatioPercent, 50, 100, supportRatioPercent.value);
  nonStackSupportRatioPercent.value = clampNumber(settings.nonStackSupportRatioPercent, 80, 100, nonStackSupportRatioPercent.value);
  const nextDisplayName = String(settings.displayName || "").trim();
  if (nextDisplayName) {
    currentUser.value = {
      ...(currentUser.value || {}),
      displayName: nextDisplayName
    };
  }
  profileVersion.value += 1;
  persistState();
  showToast("个人偏好已应用。");
}

function loadSample(notify = true) {
  cargos.value = normalizeCargoModels([
    { id: uid("cargo"), name: "蝶阀木箱 A", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: systemColorFor(0) },
    { id: uid("cargo"), name: "纸箱 B", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: systemColorFor(1) },
    { id: uid("cargo"), name: "易碎品 C", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: systemColorFor(2) }
  ]);
  result.value = null;
  selectedBoxIndex.value = 1;
  if (notify) showToast("已套用示例货物。");
}

function clearCargos() {
  if (!cargos.value.length) {
    showToast("当前没有货物可清空。");
    return;
  }
  if (!window.confirm("确认清空当前全部货物吗？这个操作不会删除已保存的模板。")) return;
  cargos.value = [];
  result.value = null;
  selectedBoxIndex.value = 1;
  showToast("已清空货物。");
}

function saveCargoTemplate() {
  if (!cargos.value.length) {
    showToast("请先录入货物，再保存模板。");
    return;
  }
  const name = uniqueCargoTemplateName(templateName.value || defaultCargoTemplateName());
  const snapshot = cargos.value.map(({ id, ...cargo }) => ({ ...cargo }));
  const template = {
    id: uid("tpl"),
    name,
    cargos: snapshot,
    createdAt: new Date().toISOString()
  };
  cargoTemplates.value = [template, ...cargoTemplates.value].slice(0, 20);
  persistCargoTemplates();
  restoreCargoTemplates();
  templateName.value = "";
  showToast(ui("template.saved", { name }));
}

function applyCargoTemplate(templateId) {
  const template = cargoTemplates.value.find((item) => item.id === templateId);
  if (!template) return;
  cargos.value = normalizeCargoModels(template.cargos.map((cargo, index) => ({
    ...cargo,
    id: uid("cargo"),
    color: cargo.color || systemColorFor(index)
  })));
  result.value = null;
  selectedBoxIndex.value = 1;
  router.push("/planner/cargos");
  showToast(`已套用模板「${template.name}」。`);
}

function deleteCargoTemplate(templateId) {
  const template = cargoTemplates.value.find((item) => item.id === templateId);
  if (!template) return;
  if (!window.confirm(ui("template.deleteConfirm", { name: template.name }))) return;
  cargoTemplates.value = cargoTemplates.value.filter((item) => item.id !== template.id);
  persistCargoTemplates();
  showToast(ui("template.deleted"));
}

function templateQuantity(template) {
  return (template.cargos || []).reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0);
}

function exportCsv() {
  const header = ["name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "nonStack", "keepUpright", "color"];
  const rows = cargos.value.map((cargo) => {
    const flags = cargoConstraintFlags(cargo);
    const normalized = {
      ...cargo,
      type: cargoHandlingUnitType(cargo),
      nonStack: flags.nonStack,
      keepUpright: flags.keepUpright
    };
    return header.map((key) => normalized[key]).join(",");
  });
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cargo-list.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCurrentReport(format) {
  const isPdf = format === "pdf";
  const hasPdfBoxes = Boolean(selectedEvaluation.value?.packedBoxes?.some((box) => box?.placed?.length));
  if (!selectedContainer.value || (!isPdf && !selectedPlacements.value.length) || (isPdf && !hasPdfBoxes)) {
    showToast("当前没有可导出的摆放结果。");
    return;
  }
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能导出正式图纸。");
    return;
  }
  exportingReport.value = true;
  showToast(format === "pdf" ? "正在生成 PDF 报告..." : "正在生成剖析图片...");
  try {
    await exportPackingReport({
      format,
      container: selectedContainer.value,
      evaluation: normalizeEvaluationForExport(selectedEvaluation.value),
      placements: selectedPlacements.value,
      cargos: cargos.value,
      boxIndex: selectedBoxIndex.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value,
      showMassBalance: showMassBalance.value,
      locale: currentLocale.value,
      userName: userDisplayName.value,
      username: currentUser.value?.username,
      taskId: currentExportTaskId()
    });
    showToast(format === "pdf" ? "PDF 已导出。" : "图片已导出。");
  } catch (error) {
    showToast(error.message || "导出失败，请稍后重试。");
  } finally {
    exportingReport.value = false;
  }
}

async function exportAllReportsZip() {
  if (!selectedContainer.value || !selectedEvaluation.value?.packedBoxes?.length) {
    showToast("当前没有可打包导出的装箱方案。");
    return;
  }
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能导出正式图纸。");
    return;
  }
  exportingReport.value = true;
  showToast(hasUndetailedBoxes.value ? "正在打包已详算货舱报告..." : "正在打包整套装箱报告...");
  try {
    await exportPackingReportsZip({
      container: selectedContainer.value,
      evaluation: normalizeEvaluationForExport(selectedEvaluation.value),
      cargos: cargos.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value,
      showMassBalance: showMassBalance.value,
      locale: currentLocale.value,
      userName: userDisplayName.value,
      username: currentUser.value?.username,
      taskId: currentExportTaskId()
    });
    showToast(hasUndetailedBoxes.value ? "已详算货舱报告 ZIP 已导出。" : "整套装箱报告 ZIP 已导出。");
  } catch (error) {
    showToast(error.message || "批量导出失败，请稍后重试。");
  } finally {
    exportingReport.value = false;
  }
}

function printCurrentPlan() {
  if (!selectedContainer.value || !selectedPlacements.value.length) {
    showToast("当前没有可打印的装箱方案。");
    return;
  }
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能打印正式图纸。");
    return;
  }
  window.print();
}

function currentExportTaskId() {
  const trace = selectedEvaluation.value?.trace || result.value?.trace || {};
  return trace.taskId || trace.runId || result.value?.taskId || `cargo-${cargos.value.length}-${cargoTotalQuantity.value}`;
}

function normalizeEvaluationForExport(evaluation) {
  if (!evaluation) return evaluation;
  return {
    ...evaluation,
    packedBoxes: (evaluation.packedBoxes || []).map((box) => ({
      ...box,
      placed: (box.placed || []).map((item) => ({ ...item, type: shortType(item.type) }))
    }))
  };
}

function handleCsvUpload(uploadFile: UploadFile) {
  const file = uploadFile.raw;
  if (file) importStructuredCargoFile(file, "CSV");
}

function handleWorkbookQuickUpload(uploadFile: UploadFile) {
  const file = uploadFile.raw;
  if (file) importStructuredCargoFile(file, "Excel");
}

function importCsv(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importStructuredCargoFile(file, "CSV");
  input.value = "";
}

function importCsvFile(file: Blob) {
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result || "").split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",") || [];
    cargos.value = lines.map((line, index) => {
      const values = line.split(",");
      const item = Object.fromEntries(header.map((key, i) => [key, values[i]]));
      return {
        id: uid("cargo"),
        name: item.name || `货物 ${index + 1}`,
        model: item.model || "",
        lengthCm: Number(item.lengthCm || 1),
        widthCm: Number(item.widthCm || 1),
        heightCm: Number(item.heightCm || 1),
        quantity: Number(item.quantity || 1),
        weightKg: Number(item.weightKg || 0),
        type: item.type || "normal",
        nonStack: item.nonStack,
        keepUpright: item.keepUpright,
        color: item.color || ""
      };
    });
    cargos.value = normalizeCargoModels(cargos.value);
    result.value = null;
    selectedBoxIndex.value = 1;
    showToast("CSV 已导入。");
  };
  reader.readAsText(file, "utf-8");
}

async function importStructuredCargoFile(file: File, label = "文件") {
  if (fileImporting.value) return;
  fileImporting.value = true;
  showToast(`正在解析${label}，大文件会在后台处理...`);
  try {
    const workbook = await readWorkbookInWorker(file);
    const sheet = workbook?.sheets?.[0];
    if (!sheet) throw new Error("没有找到可导入的工作表。");
    const preview = await buildPreviewInWorker(sheet, sheet.mapping || {}, { dimensionUnit: "auto", weightUnit: "auto" });
    const imported = (preview.aggregated || []).map((cargo, index) => normalizeImportedCargo(cargo, index));
    if (!imported.length) {
      showToast(`未识别到有效货物，已发现 ${preview.invalidRows?.length || 0} 行异常，请打开智能/Excel 导入查看明细。`);
      smartImportOpen.value = true;
      return;
    }
    importExcelCargos({
      cargos: imported,
      mode: quickImportMode.value,
      skippedRows: preview.invalidRows?.length || 0,
      importKind: "quick"
    });
  } catch (error) {
    showToast(error?.message || `${label} 导入失败，请检查文件格式。`);
  } finally {
    fileImporting.value = false;
  }
}

function containerIcon(name) {
  if (name.includes("组合") || name.includes("智能")) return "MIX";
  if (name.includes("FR") || name.includes("平板")) return "FR";
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function containerDimensionText(container: any) {
  return `${formatDimensionNumber(container?.lengthCm)} × ${formatDimensionNumber(container?.widthCm)} × ${formatDimensionNumber(effectiveContainerHeight(container))}`;
}

function containerPayloadText(container: any) {
  const value = Number(container?.payloadKg || 0);
  if (!value) return "-";
  return value >= 1000 ? `${formatDimensionNumber(value / 1000)} t` : `${formatDimensionNumber(value)} kg`;
}

function containerPriceText(container: any) {
  const value = Number(container?.referencePrice ?? container?.price ?? container?.freightPrice ?? 0);
  if (!(value > 0)) return ui("container.priceMissing");
  const formatted = new Intl.NumberFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    maximumFractionDigits: 0
  }).format(value);
  return `${String(container?.referenceCurrency || "USD").toUpperCase()} ${formatted}`;
}

function containerUsageText(value: string) {
  return {
    common: "常用箱型",
    limited: "少量使用",
    special: "特殊设备"
  }[value] || "自定义";
}

function containerSourceShort(container: any) {
  return `来源：${container?.dimensionSource || "用户自定义"}`;
}

function evaluationCardSubtitle(evaluation) {
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    return evaluationFitText(evaluation);
  }
  return `${containerDimensionText(evaluation?.container)} cm`;
}

function evaluationCardTitle(evaluation) {
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    return trPlanSummary(evaluation?.mixedPlan?.summary || evaluation?.container?.name || "");
  }
  return trPlanSummary(evaluation?.container?.name || "");
}

function evaluationCardMetric(evaluation) {
  const fill = evaluationAverageFill(evaluation);
  if (evaluation?.usageMode === "deck") {
    const lengthPercent = Number(evaluation?.firstBoxLengthPercent || 0);
    const lengthText = lengthPercent ? t("metrics.lengthSuffix", { value: fmt(lengthPercent, 1) }) : "";
    return t("metrics.deckUtilizationWithLength", { value: fmt(fill, 1), length: lengthText });
  }
  return `${tr(Number(evaluation?.boxes || 0) > 1 || evaluation?.isMixedPlan ? "平均利用率" : "空间利用率")} ${fmt(fill, 1)}%`;
}

function evaluationFreightText(evaluation) {
  return `${evaluationFreightLabel(evaluation)} ${evaluationFreightAmountText(evaluation)}`;
}

function evaluationFreightLabel(evaluation) {
  const reason = String(evaluation?.recommendation?.priceExclusionReason || "");
  if (!evaluationPriceConfigured(evaluation)) return ui("result.priceMissing");
  if (reason === "mixed-currency") return ui("result.mixedCurrencyPrice");
  if (reason === "currency-set-mismatch") return ui("result.currencySetMismatch");
  if (reason === "estimated-boxes") return ui("result.estimatedFreight");
  return ui("result.referenceFreight");
}

function evaluationFreightAmountText(evaluation) {
  if (!evaluationPriceConfigured(evaluation) || evaluation?.recommendation?.priceExclusionReason === "mixed-currency") return "-";
  return formatCurrency(evaluationFreightValue(evaluation), evaluationFreightCurrency(evaluation));
}

function evaluationFreightValue(evaluation) {
  const rawBoxes = Number(evaluation?.boxes || 0);
  if (!evaluation || evaluation?.fitStatus === "oversize" || rawBoxes <= 0) return Number.POSITIVE_INFINITY;
  const recommendation = evaluation?.recommendation || {};
  if (recommendation.priceAvailable === false) return Number.POSITIVE_INFINITY;
  if (recommendation.priceExclusionReason === "mixed-currency") return Number.POSITIVE_INFINITY;
  const estimatedFreight = Number(recommendation.estimatedFreight);
  if (Number.isFinite(estimatedFreight) && estimatedFreight > 0) return estimatedFreight;
  const packedBoxes = Array.isArray(evaluation?.packedBoxes) ? evaluation.packedBoxes : [];
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    const currencies = new Set(packedBoxes.map((box) => containerReferenceCurrency(box.container)));
    if (currencies.size !== 1) return Number.POSITIVE_INFINITY;
    const mixedFreight = packedBoxes.reduce((sum, box) => sum + containerReferencePrice(box.container), 0);
    if (Number.isFinite(mixedFreight) && mixedFreight > 0) return mixedFreight;
  }
  const boxes = normalizedEvaluationBoxes(evaluation);
  if (boxes >= 9999) return Number.POSITIVE_INFINITY;
  return boxes * containerReferencePrice(evaluation?.container);
}

function containerReferencePrice(container) {
  const explicit = Number(container?.referencePrice ?? container?.price ?? container?.freightPrice);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Number.POSITIVE_INFINITY;
}

function evaluationFreightCurrency(evaluation) {
  const packedBoxes = Array.isArray(evaluation?.packedBoxes) ? evaluation.packedBoxes : [];
  const boxCurrencies = [...new Set(packedBoxes.map((box) => containerReferenceCurrency(box.container)).filter(Boolean))];
  if (boxCurrencies.length > 1) return "";
  return boxCurrencies[0] || containerReferenceCurrency(evaluation?.container);
}

function evaluationPriceConfigured(evaluation) {
  const explicit = evaluation?.recommendation?.priceAvailable;
  if (typeof explicit === "boolean") return explicit;
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    const boxes = evaluation?.packedBoxes || [];
    return boxes.length > 0 && boxes.every((box) => Number.isFinite(containerReferencePrice(box.container)));
  }
  return Number.isFinite(containerReferencePrice(evaluation?.container));
}

function evaluationPriceComparisonEligible(evaluation) {
  const explicit = evaluation?.recommendation?.priceComparisonEligible;
  if (typeof explicit === "boolean") return explicit;
  if (!evaluationPriceConfigured(evaluation) || evaluation?.estimatedBoxes) return false;
  if (evaluation?.isMixedPlan || evaluation?.container?.mixedPlan) {
    const currencies = new Set((evaluation?.packedBoxes || []).map((box) => containerReferenceCurrency(box.container)));
    return currencies.size === 1;
  }
  return true;
}

function containerReferenceCurrency(container) {
  return String(container?.referenceCurrency || container?.currency || "USD").toUpperCase();
}

function formatCurrency(value, currency = "USD") {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  const formatted = new Intl.NumberFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    maximumFractionDigits: numeric >= 100 ? 0 : 2
  }).format(numeric);
  return `${String(currency || "USD").toUpperCase()} ${formatted}`;
}

function compareFiniteNumbers(left, right) {
  const a = Number(left);
  const b = Number(right);
  const aFinite = Number.isFinite(a);
  const bFinite = Number.isFinite(b);
  if (aFinite && bFinite && Math.abs(a - b) > 0.01) return a - b;
  if (aFinite !== bFinite) return aFinite ? -1 : 1;
  return 0;
}

function evaluationCardStatus(evaluation) {
  if (!evaluation || evaluation.fitStatus === "fit") return "";
  if (evaluation.fitStatus === "estimated") return ui("result.estimatedCandidate");
  if (evaluation.fitStatus === "oversize") return tr("不可装");
  if (evaluation.fitStatus === "balance-blocked") return tr("偏载拦截");
  return "";
}

function boxTabLabel(box) {
  const name = box?.container?.name;
  if (!name) return box?.index || "";
  return `${box.index} ${trContainerName(name).split(" ")[0] || trContainerName(name)}`;
}

function formatTons(value: unknown) {
  const kg = Number(value || 0);
  if (!Number.isFinite(kg) || kg <= 0) return "不豁免";
  return `${formatDimensionNumber(kg / 1000)} t`;
}

function formatDimensionNumber(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, "");
}

function dateLocale() {
  return currentLocale.value === "en-US" ? "en-US" : "zh-CN";
}

function tr(value) {
  return translateLegacyText(value, currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

function trContainerName(value) {
  return tr(value);
}

function trPlanSummary(value) {
  const text = String(value || "");
  if (!text) return text;
  return text.split(" + ").map((part) => {
    const match = part.match(/^(.*?)(×\d+)$/);
    if (!match) return trContainerName(part);
    return `${trContainerName(match[1])}${match[2]}`;
  }).join(" + ");
}

function evaluationFitText(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  if (boxes <= 0 || evaluation?.fitStatus === "oversize") return "不可装";
  const boxText = `${evaluation?.estimatedBoxes ? "约 " : ""}${boxes} 箱`;
  if (evaluation?.fitStatus === "estimated") return `${boxText} · ${ui("result.estimatedCandidate")}`;
  if (evaluation?.fitStatus === "balance-blocked") return `${boxText} · 偏载拦截`;
  return boxText;
}

function evaluationCostText(evaluation) {
  return evaluationFreightText(evaluation);
}

function evaluationRecommendationText(evaluation) {
  const recommendation = evaluation?.recommendation || {};
  const status = evaluation?.fitStatus === "estimated"
    ? ui("result.estimatedCandidate")
    : evaluation?.fitStatus === "balance-blocked"
    ? "几何可装，需调载"
    : evaluation?.fitStatus === "oversize"
      ? "尺寸/承载不可行"
      : "合规候选";
  return `${status} · ${equipmentClassText(recommendation.equipmentClass)} · ${utilizationBandText(recommendation.utilizationBand)}`;
}

function evaluationHint(evaluation) {
  return [
    evaluationCardTitle(evaluation) || ui("result.planFallback"),
    evaluationCardSubtitle(evaluation),
    evaluationFreightText(evaluation),
    evaluationCardMetric(evaluation),
    ui("result.priceFirstBasis")
  ].filter(Boolean).join("; ");
}

function evaluationAverageFill(evaluation) {
  const recommendationFill = Number(evaluation?.recommendation?.averageFillPercent);
  if (Number.isFinite(recommendationFill) && recommendationFill > 0) return recommendationFill;
  const average = Number(evaluation?.averageFillPercent);
  if (Number.isFinite(average) && average > 0) return average;
  const first = Number(evaluation?.firstBoxFillPercent);
  return Number.isFinite(first) ? first : 0;
}

function priceTierText(tier) {
  return {
    economy: "经济",
    standard: "标准",
    high: "较高",
    special: "特种高价",
    mixed: "组合"
  }[tier] || tier || "参考价";
}

function equipmentClassText(value) {
  return {
    GP: "普柜",
    HQ: "高柜",
    "45HQ": "45高柜",
    RF: "冷藏柜",
    FR: "平板柜",
    MIX: "组合方案"
  }[value] || "箱型";
}

function utilizationBandText(value) {
  return {
    none: "无装载",
    low: "低利用",
    moderate: "适中利用",
    balanced: "均衡利用",
    tight: "偏紧利用"
  }[value] || "利用率待评估";
}

function evaluationStatusRank(evaluation) {
  if (evaluation?.fitStatus === "fit") return 0;
  if (evaluation?.fitStatus === "estimated") return 1;
  if (evaluation?.fitStatus === "balance-blocked") return 2;
  return 3;
}

function evaluationBalanceLevel(evaluation) {
  if (!evaluation || evaluation.fitStatus === "oversize") return "oversize";
  if (evaluation.fitStatus === "balance-blocked") return "red";
  if (evaluation.fitStatus === "estimated") return "estimated";
  const severities = (evaluation.packedBoxes || []).map((box) => box.balanceValidation?.severity).filter(Boolean);
  if (severities.includes("red")) return "red";
  if (severities.includes("yellow")) return "yellow";
  return "green";
}

function normalizedEvaluationBoxes(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  return boxes > 0 ? boxes : 9999;
}

function isEvaluationExportable(evaluation) {
  return Boolean(evaluation && evaluation.fitStatus === "fit");
}

function normalizeImportedCargo(cargo, index = 0) {
  return normalizeCargoForRuntime({
    id: cargo.id || uid("cargo"),
    name: String(cargo.name || "").trim(),
    model: String(cargo.model || "").trim(),
    lengthCm: round2(cargo.lengthCm),
    widthCm: round2(cargo.widthCm),
    heightCm: round2(cargo.heightCm),
    quantity: Math.max(1, Math.round(Number(cargo.quantity || 1))),
    weightKg: round2(cargo.weightKg),
    type: cargo.type || "normal",
    color: cargo.color || systemColorFor(index),
    sku: cargo.sku || "",
    remark: String(cargo.remark || "").trim(),
    packageInfo: cargo.packageInfo || null,
    nonStack: cargo.nonStack,
    keepUpright: cargo.keepUpright
  });
}

function importExcelCargos({ cargos: importedCargos, mode, skippedRows = 0, importKind = "" }) {
  if (!importedCargos?.length) return;
  const nextMode = mode === "replace" ? "replace" : "append";
  const normalizedImported = importedCargos.map((cargo, index) => normalizeImportedCargo(cargo, cargos.value.length + index));
  cargos.value = normalizeCargoModels(nextMode === "append" ? [...cargos.value, ...normalizedImported] : normalizedImported);
  result.value = null;
  selectedBoxIndex.value = 1;
  router.push("/planner/cargos");
  cargoImportNotice.value = importKind === "quick"
    ? { key: "excel.quickImportPostCheck", params: { count: normalizedImported.length } }
    : null;
  showToast(ui("app.importCargoSuccess", {
    action: ui(nextMode === "append" ? "app.importActionAppend" : "app.importActionReplace"),
    count: normalizedImported.length,
    skipped: skippedRows ? ui("app.importSkippedRows", { count: skippedRows }) : ""
  }));
}

function systemColorFor(index) {
  return colors[index % colors.length];
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function cargoDisplayName(cargo) {
  return cargoLabel(cargo);
}

function cargoRuleTags(cargo) {
  const flags = cargoConstraintFlags(cargo);
  const tags = [{
    key: "handling-unit",
    label: ui(cargoHandlingUnitType(cargo) === "pallet" ? "cargo.pallet" : "cargo.normal"),
    type: "info"
  }];
  if (flags.nonStack) tags.push({ key: "non-stack", label: ui("cargo.nonstack"), type: "warning" });
  if (flags.keepUpright) tags.push({ key: "keep-upright", label: ui("cargo.upright"), type: "primary" });
  return tags;
}

function cargoOverviewRowStyle() {
  return { height: "56px" };
}

function normalizeCargoModels(items) {
  return assignCargoModels(items.map((cargo) => normalizeCargoForRuntime(cargo)));
}

function normalizeCargoForRuntime(cargo = {}) {
  const normalized = normalizeCargoConstraints(cargo);
  return {
    ...normalized,
    type: cargoHandlingUnitType(normalized)
  };
}

function showToast(message) {
  toast.value = tr(message);
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => (toast.value = ""), 2200);
}
</script>
