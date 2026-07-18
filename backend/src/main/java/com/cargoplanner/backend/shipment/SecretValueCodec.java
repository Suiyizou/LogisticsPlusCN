package com.cargoplanner.backend.shipment;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Encrypts operational credentials with a backend-only key stored outside the database. */
@Component
public class SecretValueCodec {
  private static final int KEY_BYTES = 32;
  private static final int NONCE_BYTES = 12;
  private static final int GCM_TAG_BITS = 128;
  private static final String VERSION = "v1";

  private final Path keyFile;
  private final SecureRandom secureRandom = new SecureRandom();
  private volatile SecretKey cachedKey;

  @Autowired
  public SecretValueCodec(
      @Value("${app.tracking.secret-key-file:./data/secrets/tracking-settings.key}") String keyFile
  ) {
    this(Path.of(keyFile == null || keyFile.isBlank()
        ? "./data/secrets/tracking-settings.key"
        : keyFile.trim()));
  }

  SecretValueCodec(Path keyFile) {
    this.keyFile = keyFile.toAbsolutePath().normalize();
  }

  public String encrypt(String purpose, String plaintext) {
    if (plaintext == null) return null;
    byte[] nonce = new byte[NONCE_BYTES];
    secureRandom.nextBytes(nonce);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
      cipher.updateAAD(aad(purpose));
      byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
      Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
      return VERSION + ":" + encoder.encodeToString(nonce) + ":" + encoder.encodeToString(ciphertext);
    } catch (GeneralSecurityException error) {
      throw new IllegalStateException("Cannot encrypt tracking credential", error);
    }
  }

  public String decrypt(String purpose, String encrypted) {
    if (encrypted == null || encrypted.isBlank()) return "";
    String[] parts = encrypted.split(":", 3);
    if (parts.length != 3 || !VERSION.equals(parts[0])) {
      throw new IllegalStateException("Unsupported tracking credential format");
    }
    try {
      Base64.Decoder decoder = Base64.getUrlDecoder();
      byte[] nonce = decoder.decode(parts[1]);
      if (nonce.length != NONCE_BYTES) throw new IllegalArgumentException("Invalid nonce");
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(GCM_TAG_BITS, nonce));
      cipher.updateAAD(aad(purpose));
      return new String(cipher.doFinal(decoder.decode(parts[2])), StandardCharsets.UTF_8);
    } catch (GeneralSecurityException | IllegalArgumentException error) {
      throw new IllegalStateException("Cannot decrypt tracking credential", error);
    }
  }

  private byte[] aad(String purpose) {
    return String.valueOf(purpose).getBytes(StandardCharsets.UTF_8);
  }

  private SecretKey key() {
    SecretKey current = cachedKey;
    if (current != null) return current;
    synchronized (this) {
      if (cachedKey == null) cachedKey = loadOrCreateKey();
      return cachedKey;
    }
  }

  private SecretKey loadOrCreateKey() {
    try {
      Path parent = keyFile.getParent();
      if (parent != null) Files.createDirectories(parent);
      if (!Files.exists(keyFile)) {
        byte[] rawKey = new byte[KEY_BYTES];
        secureRandom.nextBytes(rawKey);
        try {
          Files.writeString(
              keyFile,
              Base64.getEncoder().encodeToString(rawKey),
              StandardCharsets.US_ASCII,
              StandardOpenOption.CREATE_NEW,
              StandardOpenOption.WRITE
          );
          restrictPermissions();
        } catch (FileAlreadyExistsException ignored) {
          // Another backend instance created the shared key first.
        }
      }
      byte[] rawKey = Base64.getDecoder().decode(Files.readString(keyFile).trim());
      if (rawKey.length != KEY_BYTES) {
        throw new IllegalStateException("Tracking credential key must contain 256 bits");
      }
      return new SecretKeySpec(rawKey, "AES");
    } catch (IOException | IllegalArgumentException error) {
      throw new IllegalStateException("Cannot load backend tracking credential key", error);
    }
  }

  private void restrictPermissions() {
    try {
      Files.setPosixFilePermissions(keyFile, Set.of(
          java.nio.file.attribute.PosixFilePermission.OWNER_READ,
          java.nio.file.attribute.PosixFilePermission.OWNER_WRITE
      ));
    } catch (UnsupportedOperationException | IOException ignored) {
      // Windows and some mounted volumes do not expose POSIX permissions.
    }
  }
}
