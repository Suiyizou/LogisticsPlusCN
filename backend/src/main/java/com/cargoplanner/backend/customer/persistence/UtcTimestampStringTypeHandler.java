package com.cargoplanner.backend.customer.persistence;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/** Preserves the directory's existing Timestamp.toInstant().toString() wire format. */
public class UtcTimestampStringTypeHandler extends BaseTypeHandler<String> {
  @Override
  public void setNonNullParameter(PreparedStatement statement, int index, String value, JdbcType type)
      throws SQLException {
    statement.setTimestamp(index, Timestamp.from(Instant.parse(value)));
  }

  @Override
  public String getNullableResult(ResultSet result, String column) throws SQLException {
    return format(result.getTimestamp(column));
  }

  @Override
  public String getNullableResult(ResultSet result, int index) throws SQLException {
    return format(result.getTimestamp(index));
  }

  @Override
  public String getNullableResult(CallableStatement statement, int index) throws SQLException {
    return format(statement.getTimestamp(index));
  }

  private String format(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant().toString();
  }
}
