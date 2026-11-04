ALTER TABLE cp_shipment_batch_tasks ADD COLUMN source_file_name VARCHAR(255) NOT NULL DEFAULT 'Imported spreadsheet';
ALTER TABLE cp_shipment_batch_tasks ADD COLUMN tracking_channel VARCHAR(24) NOT NULL DEFAULT 'AUTO';
ALTER TABLE cp_shipment_batch_tasks ADD COLUMN task_mode VARCHAR(20) NOT NULL DEFAULT 'IMPORT';
ALTER TABLE cp_shipment_batch_tasks ADD COLUMN customer_public_id VARCHAR(64) NULL;
ALTER TABLE cp_shipment_batch_tasks ADD COLUMN publish_to_customer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cp_shipment_batch_tasks ADD COLUMN draft_item_count INT NOT NULL DEFAULT 0;

UPDATE cp_shipment_batch_tasks
SET source_file_name = COALESCE(JSON_VALUE(draft_json, '$.sourceFileName'), source_file_name),
    tracking_channel = COALESCE(JSON_VALUE(draft_json, '$.channel'), tracking_channel),
    task_mode = COALESCE(JSON_VALUE(draft_json, '$.mode'), task_mode),
    customer_public_id = JSON_VALUE(draft_json, '$.customerId'),
    publish_to_customer = CASE WHEN JSON_VALUE(draft_json, '$.publishToCustomer') = 'true' THEN TRUE ELSE FALSE END,
    draft_item_count = COALESCE(JSON_LENGTH(draft_json, '$.items'), 0);
