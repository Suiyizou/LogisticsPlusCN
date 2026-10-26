package com.cargoplanner.backend.database;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** Explicit operator CLI. Never registered as an HTTP endpoint or startup bean. */
public final class DatabaseMigrationCli {
  private static final ObjectMapper JSON = new ObjectMapper();
  private DatabaseMigrationCli() {}

  public static void main(String[] arguments) throws Exception {
    if (arguments.length == 0 || arguments[0].equals("--help")) {
      System.out.println("Usage: --inspect | --validate | --migrate | --adopt-legacy --expected-fingerprint SHA256 --backup-manifest /verified/backup/checksums.sha256");
      System.out.println("Connection comes only from SPRING_DATASOURCE_URL/USERNAME/PASSWORD. Legacy adoption records baseline 0; run --migrate separately.");
      return;
    }
    Map<String, String> options = options(arguments);
    String action = arguments[0];
    if (!Set.of("--inspect", "--validate", "--migrate", "--adopt-legacy").contains(action)) {
      throw new IllegalArgumentException("Unknown database command");
    }
    String url = requiredEnvironment("SPRING_DATASOURCE_URL");
    String username = requiredEnvironment("SPRING_DATASOURCE_USERNAME");
    String password = requiredEnvironment("SPRING_DATASOURCE_PASSWORD");
    try (Connection connection = DriverManager.getConnection(url, username, password)) {
      if (!connection.getMetaData().getDatabaseProductName().equalsIgnoreCase("MySQL")) {
        throw new IllegalArgumentException("Migration commands require MySQL");
      }
      JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
      Map<String, Object> snapshot = snapshot(jdbc);
      String fingerprint = digest(JSON.writeValueAsBytes(snapshot));
      if (action.equals("--inspect")) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("database", connection.getCatalog());
        report.put("fingerprint", fingerprint);
        report.put("schema", snapshot);
        System.out.println(JSON.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        return;
      }
      if (action.equals("--adopt-legacy")) {
        String expected = options.get("--expected-fingerprint");
        if (expected == null || !expected.matches("[0-9a-fA-F]{64}") || !expected.equalsIgnoreCase(fingerprint)) {
          throw new IllegalArgumentException("Schema fingerprint missing or changed; inspect and review the exact target again");
        }
        validateLegacyShape(jdbc);
        Path manifest = Path.of(requiredOption(options, "--backup-manifest"));
        verifyBackup(manifest);
        Flyway flyway = flyway(url, username, password,
            "reviewed legacy " + fingerprint.substring(0, 12) + " backup " + digest(Files.readAllBytes(manifest)).substring(0, 12));
        flyway.baseline();
        System.out.println("Explicit legacy baseline 0 recorded. No schema upgrade performed; next run --migrate.");
        return;
      }
      Flyway flyway = flyway(url, username, password, "reviewed legacy before versioned migrations");
      if (action.equals("--validate")) {
        flyway.validate();
        System.out.println("Migration checksums validated.");
      } else {
        var result = flyway.migrate();
        System.out.println("Applied migrations: " + result.migrationsExecuted);
      }
    }
  }

  private static Flyway flyway(String url, String username, String password, String description) {
    return Flyway.configure().dataSource(url, username, password)
        .locations("classpath:db/migration").baselineOnMigrate(false).baselineVersion("0")
        .baselineDescription(description).validateOnMigrate(true).cleanDisabled(true).load();
  }

  private static Map<String, String> options(String[] arguments) {
    Map<String, String> parsed = new LinkedHashMap<>();
    for (int index = 1; index < arguments.length; index += 2) {
      String name = arguments[index];
      if (!arguments[0].equals("--adopt-legacy")
          || !Set.of("--expected-fingerprint", "--backup-manifest").contains(name)
          || index + 1 >= arguments.length || parsed.putIfAbsent(name, arguments[index + 1]) != null) {
        throw new IllegalArgumentException("Invalid or duplicate database command option");
      }
    }
    return parsed;
  }

  private static String requiredEnvironment(String name) {
    String value = System.getenv(name);
    if (value == null || value.isBlank()) throw new IllegalArgumentException("Required environment variable: " + name);
    return value;
  }

  private static String requiredOption(Map<String, String> options, String name) {
    String value = options.get(name);
    if (value == null || value.isBlank()) throw new IllegalArgumentException("Required command option: " + name);
    return value;
  }

  private static Map<String, Object> snapshot(JdbcTemplate jdbc) {
    Map<String, Object> schema = new LinkedHashMap<>();
    schema.put("tables", jdbc.queryForList("""
        SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME<>'flyway_schema_history'
        ORDER BY TABLE_NAME
        """));
    schema.put("columns", jdbc.queryForList("""
        SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,
               CHARACTER_SET_NAME,COLLATION_NAME,GENERATION_EXPRESSION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'flyway_schema_history'
        ORDER BY TABLE_NAME,COLUMN_NAME
        """));
    schema.put("indexes", jdbc.queryForList("""
        SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IS_VISIBLE,EXPRESSION
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'flyway_schema_history'
        ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX
        """));
    schema.put("foreignKeys", jdbc.queryForList("""
        SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,
               k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
          ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
        WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION
        """));
    schema.put("checks", jdbc.queryForList("""
        SELECT t.TABLE_NAME,c.CONSTRAINT_NAME,c.CHECK_CLAUSE,t.ENFORCED
        FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS c
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS t
          ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME
        WHERE c.CONSTRAINT_SCHEMA=DATABASE()
        ORDER BY t.TABLE_NAME,c.CONSTRAINT_NAME
        """));
    return schema;
  }

  private static void validateLegacyShape(JdbcTemplate jdbc) throws Exception {
    Set<String> expected = new TreeSet<>();
    try (InputStream input = DatabaseMigrationCli.class.getResourceAsStream("/db/migration/V1__baseline.sql")) {
      if (input == null) throw new IllegalStateException("Missing frozen V1 legacy profile");
      Matcher tables = Pattern.compile("(?m)^CREATE TABLE IF NOT EXISTS (cp_[a-z0-9_]+)\\s*\\(")
          .matcher(new String(input.readAllBytes(), StandardCharsets.UTF_8));
      while (tables.find()) expected.add(tables.group(1));
    }
    Set<String> actual = new TreeSet<>(jdbc.queryForList(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'",
        String.class));
    if (!actual.equals(expected)) {
      throw new IllegalArgumentException("Unrecognized legacy table set or already-versioned database; explicit profile review required");
    }
    Map<String, List<String>> required = Map.of(
        "cp_users", List.of("id", "username", "role", "status", "password_salt", "password_hash", "password_iterations"),
        "cp_customers", List.of("id", "public_id", "username", "party_role", "created_by", "customer_code_hash", "customer_code_prefix"),
        "cp_shipments", List.of("id", "public_id", "created_by", "carrier_code", "current_snapshot_id"),
        "cp_tracking_snapshots", List.of("id", "shipment_id", "snapshot_json", "query_reference_no"),
        "cp_system_settings", List.of("setting_key", "setting_value", "updated_by"));
    for (var table : required.entrySet()) {
      List<String> columns = jdbc.queryForList(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
          String.class, table.getKey());
      if (!columns.containsAll(table.getValue())) throw new IllegalArgumentException("Unsupported legacy columns: " + table.getKey());
    }
    // Fingerprint approval is still required: table names alone cannot prove data/default/constraint compatibility.
  }

  private static void verifyBackup(Path manifest) throws Exception {
    Path resolved = manifest.toAbsolutePath().normalize();
    if (!Files.isRegularFile(resolved)) throw new IllegalArgumentException("Verified backup manifest is required");
    Path directory = resolved.getParent();
    Set<String> required = new TreeSet<>(Set.of("db.sql", "secrets.tgz", "workspace-files.tgz"));
    List<String> entries = Files.readAllLines(resolved, StandardCharsets.UTF_8);
    if (entries.isEmpty()) throw new IllegalArgumentException("Empty backup manifest");
    for (String entry : entries) {
      Matcher line = Pattern.compile("^([0-9a-fA-F]{64})\\s+[* ]?(.+)$").matcher(entry);
      if (!line.matches()) throw new IllegalArgumentException("Invalid backup checksum entry");
      Path file = directory.resolve(line.group(2)).normalize();
      if (!file.startsWith(directory) || !Files.isRegularFile(file) || Files.size(file) == 0) {
        throw new IllegalArgumentException("Missing backup artifact or path outside backup directory");
      }
      if (!digest(file).equalsIgnoreCase(line.group(1))) {
        throw new IllegalArgumentException("Backup artifact checksum does not match");
      }
      required.remove(directory.relativize(file).toString().replace('\\', '/'));
    }
    if (!required.isEmpty()) throw new IllegalArgumentException("Incomplete backup: " + required);
  }

  private static String digest(Path path) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = Files.newInputStream(path)) {
      byte[] buffer = new byte[8192];
      for (int count; (count = input.read(buffer)) != -1;) digest.update(buffer, 0, count);
    }
    return HexFormat.of().formatHex(digest.digest());
  }

  private static String digest(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
}
