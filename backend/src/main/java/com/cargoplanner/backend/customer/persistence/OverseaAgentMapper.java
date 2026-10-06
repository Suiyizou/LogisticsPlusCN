package com.cargoplanner.backend.customer.persistence;

import com.cargoplanner.backend.customer.dto.BusinessAgentListRow;
import com.cargoplanner.backend.customer.dto.OverseaAgentListRow;
import com.cargoplanner.backend.customer.dto.OverseaAgentRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 海外代理域的 SQL 归属。
 *
 * <p>把原 {@code OverseaAgentService} 中的 JdbcTemplate 语句统一迁移到 Mapper，参数全部
 * 使用 {@code #{}} 绑定；SQL 文本见 {@code resources/mappers/customer/OverseaAgentMapper.xml}。
 */
@Mapper
public interface OverseaAgentMapper {

  List<OverseaAgentListRow> findTransferAgents();

  List<BusinessAgentListRow> findBusinessHandoverAgents();

  OverseaAgentRow findAgentById(@Param("userId") long userId);

  int insertAgent(
      @Param("username") String username,
      @Param("displayName") String displayName,
      @Param("salt") String salt,
      @Param("hash") String hash,
      @Param("iterations") int iterations,
      @Param("createdBy") long createdBy
  );

  Long findIdByUsername(@Param("username") String username);

  int updateAgentWithPassword(
      @Param("userId") long userId,
      @Param("displayName") String displayName,
      @Param("status") String status,
      @Param("salt") String salt,
      @Param("hash") String hash,
      @Param("iterations") int iterations
  );

  int updateAgentProfile(
      @Param("userId") long userId,
      @Param("displayName") String displayName,
      @Param("status") String status
  );

  int deleteLoginDevices(@Param("userId") long userId);

  int updateAgentPassword(
      @Param("userId") long userId,
      @Param("salt") String salt,
      @Param("hash") String hash,
      @Param("iterations") int iterations
  );

  int softDeleteAgent(
      @Param("userId") long userId,
      @Param("username") String username,
      @Param("salt") String salt,
      @Param("hash") String hash,
      @Param("iterations") int iterations
  );

  int deleteEmployeeAssignments(@Param("userId") long userId);

  int deleteShipmentParticipants(@Param("userId") long userId);

  int deleteScopesForCustomer(@Param("customerId") long customerId);

  int insertScopesForCustomer(@Param("customerId") long customerId);

  int deleteScopeForShipment(
      @Param("customerId") long customerId,
      @Param("shipmentId") long shipmentId
  );

  int insertScopeForShipment(
      @Param("customerId") long customerId,
      @Param("shipmentId") long shipmentId
  );

  List<Long> findEmployeeIds(@Param("customerId") long customerId);

  long countCustomerShipmentBinding(
      @Param("customerId") long customerId,
      @Param("shipmentId") long shipmentId
  );

  int upsertParticipant(
      @Param("shipmentId") long shipmentId,
      @Param("employeeId") long employeeId,
      @Param("actorId") long actorId
  );

  long countAssignmentsForShipmentEmployee(
      @Param("shipmentId") long shipmentId,
      @Param("employeeId") long employeeId
  );

  int deleteParticipant(
      @Param("shipmentId") long shipmentId,
      @Param("employeeId") long employeeId
  );
}
