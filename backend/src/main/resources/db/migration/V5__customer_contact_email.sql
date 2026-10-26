-- Compatible customer profile extension. Old rows remain NULL; no inferred backfill.
ALTER TABLE cp_customers ADD COLUMN contact_email VARCHAR(254) NULL;
