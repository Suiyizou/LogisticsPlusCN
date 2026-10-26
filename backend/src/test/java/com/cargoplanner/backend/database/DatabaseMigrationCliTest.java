package com.cargoplanner.backend.database;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DatabaseMigrationCliTest {
  @TempDir Path temporary;

  @Test
  void acceptsOnlyCompleteChecksumVerifiedBackup() throws Exception {
    Path manifest = backup(temporary.resolve("verified"));
    verify(manifest);
  }

  @Test
  void rejectsTamperedBackupBeforeAnyDatabaseAdoption() throws Exception {
    Path manifest = backup(temporary.resolve("tampered"));
    Files.writeString(manifest.getParent().resolve("secrets.tgz"), "modified secret backup");
    assertThatThrownBy(() -> verify(manifest)).hasMessageContaining("checksum");
  }

  @Test
  void rejectsMissingBackupArtifacts() throws Exception {
    Path manifest = backup(temporary.resolve("missing"));
    Files.delete(manifest.getParent().resolve("workspace-files.tgz"));
    assertThatThrownBy(() -> verify(manifest)).hasMessageContaining("Missing backup artifact");
  }

  @Test
  void rejectsManifestReferencesOutsideBackupDirectory() throws Exception {
    Path manifest = backup(temporary.resolve("boundary"));
    Path outside = temporary.resolve("outside.sql");
    Files.writeString(outside, "synthetic unrelated artifact");
    Files.writeString(manifest, digest(outside) + "  ../outside.sql\n");
    assertThatThrownBy(() -> verify(manifest)).hasMessageContaining("outside backup directory");
  }

  @Test
  void rejectsIncompleteButIndividuallyValidManifest() throws Exception {
    Path manifest = backup(temporary.resolve("incomplete"));
    Path database = manifest.getParent().resolve("db.sql");
    Files.writeString(manifest, digest(database) + "  db.sql\n");
    assertThatThrownBy(() -> verify(manifest)).hasMessageContaining("Incomplete backup");
  }

  private Path backup(Path directory) throws Exception {
    Files.createDirectories(directory);
    StringBuilder entries = new StringBuilder();
    for (var entry : Map.of("db.sql", "synthetic database", "secrets.tgz", "synthetic keys", "workspace-files.tgz", "synthetic files").entrySet()) {
      Path file = directory.resolve(entry.getKey());
      Files.writeString(file, entry.getValue());
      entries.append(digest(file)).append("  ").append(entry.getKey()).append('\n');
    }
    Path manifest = directory.resolve("checksums.sha256");
    Files.writeString(manifest, entries);
    return manifest;
  }

  private String digest(Path file) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
  }

  private void verify(Path manifest) throws Exception {
    Method method = DatabaseMigrationCli.class.getDeclaredMethod("verifyBackup", Path.class);
    method.setAccessible(true);
    try {
      method.invoke(null, manifest);
    } catch (InvocationTargetException error) {
      if (error.getCause() instanceof Exception cause) throw cause;
      throw error;
    }
  }
}
