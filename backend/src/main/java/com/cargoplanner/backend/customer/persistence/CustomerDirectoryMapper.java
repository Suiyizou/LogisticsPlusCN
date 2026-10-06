package com.cargoplanner.backend.customer.persistence;

import com.cargoplanner.backend.customer.CustomerDirectoryScope;
import com.cargoplanner.backend.customer.dto.CustomerDirectoryItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CustomerDirectoryMapper {
  List<CustomerDirectoryItem> findVisibleCustomers(@Param("scope") CustomerDirectoryScope scope);
}
