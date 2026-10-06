package com.cargoplanner.backend.customer;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.customer.dto.CustomerDirectoryResponse;
import com.cargoplanner.backend.customer.persistence.CustomerDirectoryMapper;
import org.springframework.stereotype.Service;

@Service
public class CustomerDirectoryService {
  private final CustomerDirectoryMapper mapper;

  public CustomerDirectoryService(CustomerDirectoryMapper mapper) {
    this.mapper = mapper;
  }

  public CustomerDirectoryResponse list(AuthenticatedUser actor) {
    var items = mapper.findVisibleCustomers(CustomerDirectoryScope.forActor(actor));
    return new CustomerDirectoryResponse(items, items.size());
  }
}
