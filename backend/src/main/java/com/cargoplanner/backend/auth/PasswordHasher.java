package com.cargoplanner.backend.auth;

import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.KeySpec;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

@Component
public class PasswordHasher {
  public static final int DEFAULT_ITERATIONS = 120000;
  private static final int KEY_LENGTH_BITS = 256;
  private static final SecureRandom RANDOM = new SecureRandom();

  public PasswordHash hash(String password) {
    byte[] salt = new byte[16];
    RANDOM.nextBytes(salt);
    return new PasswordHash(
        Base64.getEncoder().encodeToString(salt),
        hash(password, salt, DEFAULT_ITERATIONS),
        DEFAULT_ITERATIONS
    );
  }

  public boolean verify(String password, String saltBase64, String expectedHashBase64, int iterations) {
    byte[] salt = Base64.getDecoder().decode(saltBase64);
    String actual = hash(password, salt, iterations);
    return constantTimeEquals(actual, expectedHashBase64);
  }

  private String hash(String password, byte[] salt, int iterations) {
    try {
      KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_LENGTH_BITS);
      SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
      byte[] hash = factory.generateSecret(spec).getEncoded();
      return Base64.getEncoder().encodeToString(hash);
    } catch (NoSuchAlgorithmException | InvalidKeySpecException error) {
      throw new IllegalStateException("Unable to hash password", error);
    }
  }

  private boolean constantTimeEquals(String left, String right) {
    if (left == null || right == null) {
      return false;
    }
    byte[] leftBytes = left.getBytes();
    byte[] rightBytes = right.getBytes();
    if (leftBytes.length != rightBytes.length) {
      return false;
    }
    int result = 0;
    for (int index = 0; index < leftBytes.length; index += 1) {
      result |= leftBytes[index] ^ rightBytes[index];
    }
    return result == 0;
  }

  public record PasswordHash(String salt, String hash, int iterations) {}
}
