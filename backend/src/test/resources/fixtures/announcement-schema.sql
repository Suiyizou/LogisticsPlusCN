-- H2 unit-test fixture; production DDL is exclusively versioned in Flyway.
CREATE TABLE IF NOT EXISTS cp_announcements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL,
  content_markdown TEXT NOT NULL,
  image_url VARCHAR(1000) NULL,
  illustration_ref VARCHAR(255) NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'ALL',
  display_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by BIGINT NOT NULL,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_cp_announcements_delivery (status, display_date, audience, id),
  INDEX idx_cp_announcements_admin (display_date, updated_at, id),
  CONSTRAINT fk_cp_announcements_creator FOREIGN KEY (created_by) REFERENCES cp_users(id)
);

CREATE TABLE IF NOT EXISTS cp_announcement_reads (
  announcement_id BIGINT NOT NULL,
  reader_type VARCHAR(20) NOT NULL,
  reader_id BIGINT NOT NULL,
  read_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (announcement_id, reader_type, reader_id),
  INDEX idx_cp_announcement_reads_reader (reader_type, reader_id, read_at),
  CONSTRAINT fk_cp_announcement_reads_announcement
    FOREIGN KEY (announcement_id) REFERENCES cp_announcements(id) ON DELETE CASCADE
);
