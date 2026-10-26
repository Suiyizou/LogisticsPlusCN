-- V1 seeded an empty API-key row even when the deployment supplied its key via environment.
-- Remove only untouched seed rows. An administrator's clear (updated_by is set) must persist.
DELETE FROM cp_system_settings
WHERE setting_key = 'llm.api_key'
  AND TRIM(COALESCE(setting_value, '')) = ''
  AND updated_by IS NULL;
