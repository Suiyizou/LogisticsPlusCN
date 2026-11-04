CREATE TABLE cp_shipment_batch_tasks (
  task_id VARCHAR(48) PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  revision INT NOT NULL,
  draft_json LONGTEXT NOT NULL,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  published_at DATETIME(6) NULL,
  started_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  INDEX idx_cp_shipment_batch_tasks_owner (owner_id, created_at),
  CONSTRAINT fk_cp_shipment_batch_owner FOREIGN KEY (owner_id) REFERENCES cp_users(id)
);

CREATE TABLE cp_shipment_batch_items (
  task_id VARCHAR(48) NOT NULL,
  row_no INT NOT NULL,
  item_json LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  run_no INT NOT NULL DEFAULT 1,
  dispatch_started_at DATETIME(6) NULL,
  local_job_id VARCHAR(100) NULL,
  result_json LONGTEXT NULL,
  payload_json LONGTEXT NULL,
  shipment_public_id VARCHAR(64) NULL,
  error_code VARCHAR(120) NULL,
  error_message VARCHAR(1000) NULL,
  failure_count INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NULL,
  lease_token VARCHAR(36) NULL,
  lease_until DATETIME(6) NULL,
  started_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL,
  finished_at DATETIME(6) NULL,
  PRIMARY KEY (task_id, row_no),
  INDEX idx_cp_shipment_batch_items_due (next_attempt_at, lease_until),
  CONSTRAINT fk_cp_shipment_batch_task FOREIGN KEY (task_id)
    REFERENCES cp_shipment_batch_tasks(task_id) ON DELETE CASCADE
);

CREATE TABLE cp_shipment_batch_item_attempts (
  task_id VARCHAR(48) NOT NULL,
  row_no INT NOT NULL,
  run_no INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  local_job_id VARCHAR(100) NULL,
  result_json LONGTEXT NULL,
  error_code VARCHAR(120) NULL,
  error_message VARCHAR(1000) NULL,
  started_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  PRIMARY KEY (task_id, row_no, run_no),
  CONSTRAINT fk_cp_shipment_batch_attempt_item FOREIGN KEY (task_id, row_no)
    REFERENCES cp_shipment_batch_items(task_id, row_no) ON DELETE CASCADE
);
