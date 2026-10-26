package com.cargoplanner.backend;

import static org.assertj.core.api.Assertions.assertThat;

import db.migration.V3__consolidate_legacy_schema;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Properties;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class DatabaseMigrationOwnershipTest {
  @Test
  void applicationCodeNeverCreatesOrAltersTables() throws Exception {
    Pattern ddl = Pattern.compile("(?i)\\b(?:CREATE|ALTER|DROP)\\s+TABLE\\b");
    try (var files = Files.walk(Path.of("src/main/java/com/cargoplanner/backend"))) {
      for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        if (file.toString().replace('\\', '/').contains("/database/")) continue;
        assertThat(ddl.matcher(Files.readString(file)).find()).as("No runtime DDL in %s", file).isFalse();
      }
    }
  }

  @Test
  void legacyJavaMigrationHasVersionedChecksumAndImmutableSourceManifest() throws Exception {
    Properties manifest = new Properties();
    try (Reader input = Files.newBufferedReader(Path.of("src/main/resources/db/migration/V3__legacy_schema_manifest.properties"))) {
      manifest.load(input);
    }
    String source = Files.readString(Path.of("src/main/java/db/migration/V3__consolidate_legacy_schema.java"))
        .replace("\r\n", "\n");
    String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8)));
    assertThat(digest).as("Never edit released V3; add the next migration").isEqualTo(manifest.getProperty("java.sha256"));
    assertThat(new V3__consolidate_legacy_schema().getChecksum()).isNotNull();
  }

  @Test
  void releasedSqlMigrationsRemainImmutable() throws Exception {
    Properties manifest = new Properties();
    try (Reader input = Files.newBufferedReader(Path.of("src/main/resources/db/migration/V3__legacy_schema_manifest.properties"))) {
      manifest.load(input);
    }
    for (var entry : java.util.Map.of(1, "baseline", 2, "llm_key_inheritance").entrySet()) {
      String source = Files.readString(Path.of("src/main/resources/db/migration/V" + entry.getKey() + "__" + entry.getValue() + ".sql"))
          .replace("\r\n", "\n");
      String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8)));
      assertThat(digest).isEqualTo(manifest.getProperty("sql.v" + entry.getKey() + ".sha256"));
    }
  }

  @Test
  void productionHasOneSchemaOwnerAndNoImplicitBaseline() throws Exception {
    assertThat(Files.readString(Path.of("src/main/resources/application.yml")))
        .contains("baseline-on-migrate: false").doesNotContain("baseline-on-migrate: true");
    assertThat(Files.readString(Path.of("../docker-compose.yml")))
        .doesNotContain("/docker-entrypoint-initdb.d/001-schema.sql");
  }
}
