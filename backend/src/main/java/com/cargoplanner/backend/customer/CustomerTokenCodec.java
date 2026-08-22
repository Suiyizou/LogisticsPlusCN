package com.cargoplanner.backend.customer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class CustomerTokenCodec {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final String CUSTOMER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  public GeneratedCustomerCode newCustomerCode() {
    StringBuilder code = new StringBuilder("DL-");
    while (code.length() < 10) {
      code.append(CUSTOMER_CODE_ALPHABET.charAt(RANDOM.nextInt(CUSTOMER_CODE_ALPHABET.length())));
    }
    String plainText = code.toString();
    return new GeneratedCustomerCode(plainText, plainText.substring(0, 4), sha256(plainText));
  }

  public String newSessionToken() {
    return randomToken();
  }

  public String hash(String value) {
    return sha256(value == null ? "" : value.trim());
  }

  private String randomToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is unavailable", impossible);
    }
  }

  public record GeneratedCustomerCode(String plainText, String prefix, String hash) {}
}
