package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.common.ApiException;
import java.security.SecureRandom;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * 客户建档与内部账号的输入规范化/校验规则。
 *
 * <p>这些规则被客户建档与海外代理账号管理共同使用，抽成无状态组件以避免复制粘贴。
 * 消息文案与 {@code BusinessCustomerService} 原实现保持一致。
 */
@Component
public class CustomerInputRules {

  private static final SecureRandom TEMP_PASSWORD_RANDOM = new SecureRandom();
  private static final String TEMP_PASSWORD_ALPHABET =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

  public String normalizeUsername(String value) {
    String normalized = value == null ? "" : value.trim();
    if (!normalized.matches("[\\p{L}\\p{N}._-]{2,64}")) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer name must contain 2-64 letters, numbers, dots, underscores, or hyphens"
      );
    }
    return normalized;
  }

  public String normalizeDisplayName(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.length() < 2 || normalized.length() > 80) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Customer display name must contain 2-80 characters"
      );
    }
    return normalized;
  }

  public void validateInternalPassword(String password) {
    String value = password == null ? "" : password;
    boolean valid =
        value.length() >= 8
            && value.length() <= 128
            && value.chars().anyMatch(Character::isLetter)
            && value.chars().anyMatch(Character::isDigit);
    if (!valid) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Password must be 8-128 characters and include at least one letter and one number"
      );
    }
  }

  /** 大写代码类字段的通用规范化（承运人、参考类型、状态、身份等）。 */
  public String normalizeCode(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(java.util.Locale.ROOT);
  }

  /** 删除账号时为登录名生成不可复用后缀，调用方已保证幂等由 SQL 条件负责。 */
  public String deletedUsername(String accountType, long id) {
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    return "deleted_" + accountType + "_" + id + "_" + suffix;
  }

  /**
   * 生成不可预测的一次性内部账号口令（重置代理密码用）。
   *
   * <p>旧实现使用固定的 {@code username + "!@#2026"}，知晓用户名即可推导口令。
   * 生成结果只返回给发起重置的管理员，不写入日志或审计描述。
   */
  public String generateTemporaryPassword() {
    StringBuilder value = new StringBuilder("#Aa1");
    while (value.length() < 16) {
      value.append(TEMP_PASSWORD_ALPHABET.charAt(TEMP_PASSWORD_RANDOM.nextInt(TEMP_PASSWORD_ALPHABET.length())));
    }
    for (int index = value.length() - 1; index > 0; index--) {
      int other = TEMP_PASSWORD_RANDOM.nextInt(index + 1);
      char swap = value.charAt(index);
      value.setCharAt(index, value.charAt(other));
      value.setCharAt(other, swap);
    }
    return value.toString();
  }
}
