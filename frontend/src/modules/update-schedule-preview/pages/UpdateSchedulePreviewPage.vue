<script setup lang="ts">
import { useI18n } from "vue-i18n";
import WorkspacePageHeader from "../../../components/workspace/WorkspacePageHeader.vue";
import DetailSection from "../../../components/workspace/DetailSection.vue";
import WorkspaceEmptyState from "../../../components/workspace/WorkspaceEmptyState.vue";
const { t } = useI18n();
const metricKeys = ["scheduled", "queued", "retrying", "completed"];
</script>
<template>
  <section class="update-schedule-preview" data-module="update-schedule-preview">
    <WorkspacePageHeader
      :title="t('updateSchedulePreview.title')"
      :eyebrow="t('updateSchedulePreview.eyebrow')"
      :description="t('updateSchedulePreview.description')"
    />
    <el-alert
      :title="t('updateSchedulePreview.notice')"
      :description="t('updateSchedulePreview.noticeBody')"
      type="warning"
      :closable="false"
      show-icon
    />
    <div class="schedule-metrics">
      <article v-for="key in metricKeys" :key="key">
        <span>{{ t("updateSchedulePreview." + key) }}</span
        ><strong>—</strong><small>{{ t("updateSchedulePreview.pending") }}</small>
      </article>
    </div>
    <div class="schedule-preview-grid">
      <DetailSection
        :title="t('updateSchedulePreview.plan')"
        :description="t('updateSchedulePreview.planHint')"
        ><dl>
          <div v-for="key in ['scope', 'frequency', 'nextRun']" :key="key">
            <dt>{{ t("updateSchedulePreview." + key) }}</dt>
            <dd>—</dd>
          </div>
        </dl></DetailSection
      >
      <DetailSection
        :title="t('updateSchedulePreview.retry')"
        :description="t('updateSchedulePreview.retryHint')"
        ><dl>
          <div v-for="key in ['lastFailure', 'nextRetry', 'retryPolicy']" :key="key">
            <dt>{{ t("updateSchedulePreview." + key) }}</dt>
            <dd>—</dd>
          </div>
        </dl></DetailSection
      >
    </div>
    <DetailSection
      :title="t('updateSchedulePreview.queue')"
      :description="t('updateSchedulePreview.queueHint')"
      ><WorkspaceEmptyState :title="t('updateSchedulePreview.pending')"
        ><template #actions
          ><el-button disabled>{{ t("updateSchedulePreview.unavailable") }}</el-button></template
        ></WorkspaceEmptyState
      ></DetailSection
    >
    <DetailSection
      :title="t('updateSchedulePreview.recent')"
      :description="t('updateSchedulePreview.recentHint')"
      ><WorkspaceEmptyState :title="t('updateSchedulePreview.pending')"
    /></DetailSection>
  </section>
</template>
<style scoped>
.update-schedule-preview {
  min-width: 0;
}
.schedule-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 24px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  overflow: hidden;
}
.schedule-metrics article {
  display: grid;
  gap: 12px;
  padding: 24px;
  border-right: 1px solid var(--color-border);
}
.schedule-metrics article:last-child {
  border: 0;
}
.schedule-metrics span {
  color: var(--color-muted);
  font-size: 13px;
}
.schedule-metrics strong {
  color: var(--color-primary);
  font-size: 30px;
  font-weight: 500;
}
.schedule-metrics small {
  color: var(--color-muted);
  font-size: 12px;
}
.schedule-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}
dl {
  margin: 0;
}
dl > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
}
dl > div:last-child {
  border: 0;
}
dt {
  color: var(--color-muted);
  font-size: 14px;
}
dd {
  margin: 0;
  color: var(--color-primary);
}
@media (max-width: 760px) {
  .schedule-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .schedule-metrics article {
    padding: 18px;
    border-bottom: 1px solid var(--color-border);
  }
  .schedule-preview-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
