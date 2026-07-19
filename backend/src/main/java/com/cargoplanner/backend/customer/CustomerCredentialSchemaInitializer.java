package com.cargoplanner.backend.customer;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Adds password credentials to customer tables created by earlier releases. */
@Component
@Order(1)
public class CustomerCredentialSchemaInitializer implements ApplicationRunner {
  private final JdbcTemplate jdbcTemplate;

  public CustomerCredentialSchemaInitializer(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public void run(ApplicationArguments args) {
    if (!isMySql()) return;
    addColumnIfMissing(
        "password_salt",
        "ALTER TABLE cp_customers ADD COLUMN password_salt VARCHAR(64) NULL AFTER party_role"
    );
    addColumnIfMissing(
        "password_hash",
        "ALTER TABLE cp_customers ADD COLUMN password_hash VARCHAR(128) NULL AFTER password_salt"
    );
    addColumnIfMissing(
        "password_iterations",
        "ALTER TABLE cp_customers ADD COLUMN password_iterations INT NULL AFTER password_hash"
    );
  }

  private boolean isMySql() {
    DataSource dataSource = jdbcTemplate.getDataSource();
    if (dataSource == null) return false;
    try (Connection connection = dataSource.getConnection()) {
      String product = connection.getMetaData().getDatabaseProductName();
      return product != null && product.toLowerCase().contains("mysql");
    } catch (SQLException error) {
      throw new IllegalStateException("Cannot inspect customer credential schema", error);
    }
  }

  private void addColumnIfMissing(String column, String ddl) {
    Integer count = jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cp_customers' AND COLUMN_NAME = ?
        """,
        Integer.class,
        column
    );
    if (count == null || count == 0) jdbcTemplate.execute(ddl);
  }
}
