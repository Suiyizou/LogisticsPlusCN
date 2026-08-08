package com.cargoplanner.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class DatabaseSchemaBaselineContractTest {

  @Test
  void baselineContainsAllApplicationManagedTablesAndColumns() throws IOException {
    String schema = Files.readString(Path.of("sql", "schema.sql"));

    assertThat(tableDefinition(schema, "cp_shipment_file_comments"))
        .contains("author_user_id BIGINT NULL")
        .contains("author_customer_id BIGINT NULL")
        .contains("body VARCHAR(2000) NOT NULL")
        .contains("fk_cp_shipment_file_comments_shipment");
    assertThat(tableDefinition(schema, "cp_tracking_refresh_jobs"))
        .contains("auto_refresh_enabled BOOLEAN NOT NULL DEFAULT TRUE")
        .contains("failure_count INT NOT NULL DEFAULT 0")
        .contains("fk_cp_tracking_refresh_shipment");
    assertThat(tableDefinition(schema, "cp_customers"))
        .contains("remark VARCHAR(500) NULL");
    assertThat(tableDefinition(schema, "cp_tracking_snapshots"))
        .contains("queried_by BIGINT NOT NULL");
  }

  private String tableDefinition(String schema, String tableName) {
    Pattern pattern = Pattern.compile(
        "(?s)CREATE TABLE IF NOT EXISTS\\s+" + Pattern.quote(tableName)
            + "\\s*\\((.*?)\\) ENGINE="
    );
    Matcher matcher = pattern.matcher(schema);
    assertThat(matcher.find()).as("schema table %s", tableName).isTrue();
    return matcher.group(1);
  }
}
