package com.cargoplanner.backend.customer;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Map;

/** 票单行映射的通用片段（时间格式化、刷新结果字段），查询与绑定共用一个归属。 */
public final class ShipmentRowMappers {
  private ShipmentRowMappers() {}

  /** 与原实现一致：Timestamp -> Instant -> ISO 字符串。 */
  public static String instantString(ResultSet rs, String column) throws SQLException {
    Timestamp value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant().toString();
  }

  public static void putRefreshOutcome(Map<String, Object> value, ResultSet rs)
      throws SQLException {
    value.put("lastRefreshResult", rs.getString("last_refresh_result"));
    value.put("lastRefreshErrorCode", rs.getString("last_refresh_error_code"));
    value.put("lastRefreshError", rs.getString("last_refresh_error"));
    value.put("lastRefreshAttempts", rs.getInt("last_refresh_attempts"));
    value.put("lastRefreshProxyAttempts", rs.getInt("last_refresh_proxy_attempts"));
    value.put("lastRefreshAt", instantString(rs, "last_refresh_at"));
  }
}
