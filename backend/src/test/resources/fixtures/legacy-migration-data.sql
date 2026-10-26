-- Synthetic migration regression records only. Execute after the frozen V1 SQL, without Flyway history.
ALTER TABLE cp_users MODIFY role ENUM('ADMIN','EMPLOYEE','BUSINESS','OVERSEA_AGENT') NOT NULL DEFAULT 'OVERSEA_AGENT';
ALTER TABLE cp_tracking_snapshots MODIFY queried_by BIGINT NULL;
ALTER TABLE cp_tracking_snapshots DROP INDEX idx_cp_tracking_snapshots_user_query;
ALTER TABLE cp_tracking_snapshots ADD UNIQUE INDEX uk_cp_tracking_snapshots_user_query (queried_by,query_reference_type,query_reference_no,invalidated_at);
ALTER TABLE cp_tracking_refresh_jobs DROP COLUMN supplemental_sources;
ALTER TABLE cp_tracking_refresh_jobs DROP COLUMN refresh_scope;
ALTER TABLE cp_customer_handover_requests DROP COLUMN review_comment;
ALTER TABLE cp_admin_audit_log DROP COLUMN request_path;
INSERT INTO cp_users(id,username,display_name,role,party_role,status,password_salt,password_hash,password_iterations)
VALUES (1,'migration-business','Synthetic Business','BUSINESS','SHIPPER','ACTIVE','synthetic','synthetic',120000),
       (2,'migration-legacy','Synthetic Legacy','EMPLOYEE','AGENT','ACTIVE','synthetic','synthetic',120000);
INSERT INTO cp_customers(id,public_id,username,display_name,party_role,password_salt,password_hash,password_iterations,customer_code_hash,customer_code_prefix,created_by,responsible_agent_id)
VALUES (10,'00000000-0000-0000-0000-000000000010','migration-shipper','Synthetic Shipper','SHIPPER','synthetic','synthetic',120000,REPEAT('a',64),'SYNTH',1,1),
       (20,'00000000-0000-0000-0000-000000000020','migration-agent','Synthetic Agent','AGENT','synthetic','synthetic',120000,REPEAT('b',64),'AGENT',1,1);
INSERT INTO cp_shipments(id,public_id,carrier_code,created_by,responsible_agent_id)
VALUES(100,'00000000-0000-0000-0000-000000000100','COSCO',1,1);
INSERT INTO cp_tracking_snapshots(id,shipment_id,query_reference_type,query_reference_no,queried_by,snapshot_json,payload_sha256,fetched_at,fresh_until)
VALUES(1000,100,'BILLOFLADING','SYNTHETICBL',NULL,'{"references":{"business":{"forwarderJobNumber":"SYNTH-JOB","clientPoNumber":"SYNTH-PO","clientNameCode":"SYNTH-CUSTOMER","originalBillOfLading":"SYNTH-OBL"}}}',REPEAT('c',64),CURRENT_TIMESTAMP(6),DATE_ADD(CURRENT_TIMESTAMP(6),INTERVAL 1 DAY));
UPDATE cp_shipments SET current_snapshot_id=1000 WHERE id=100;
INSERT INTO cp_customer_shipment_access(customer_id,shipment_id,relationship_role,assigned_by)
VALUES(10,100,'SHIPPER',1),(20,100,'AGENT',1);
INSERT INTO cp_oversea_agent_customers(customer_id,oversea_agent_customer_id,assigned_by) VALUES(10,20,1);
INSERT INTO cp_customer_sessions(customer_id,scope_customer_id,session_token_hash,expires_at,last_seen_at)
VALUES(10,NULL,REPEAT('d',64),DATE_ADD(CURRENT_TIMESTAMP(6),INTERVAL 1 DAY),CURRENT_TIMESTAMP(6)),
      (20,10,REPEAT('e',64),DATE_ADD(CURRENT_TIMESTAMP(6),INTERVAL 1 DAY),CURRENT_TIMESTAMP(6));
INSERT INTO cp_shipment_files(id,public_id,shipment_id,uploader_user_id,target_customer_id,uploader_role_snapshot,original_file_name,stored_relative_path,size_bytes,sha256,visibility)
VALUES(10000,'00000000-0000-0000-0000-000000010000',100,1,10,'BUSINESS','synthetic.pdf','synthetic/migration.pdf',1,REPEAT('f',64),'PARTIES');
INSERT INTO cp_shipment_references(shipment_id,carrier_code,reference_type,reference_no_raw,reference_no_normalized,primary_reference)
VALUES(100,'COSCO','BILLOFLADING','UNKNOWN','UNKNOWN',0),(100,'COSCO','BILLOFLADING','SYNTHETICBL','SYNTHETICBL',1);
