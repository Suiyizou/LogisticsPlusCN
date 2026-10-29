package com.cargoplanner.backend.shipment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.customer.CustomerAuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class WorkbookUploadAuthFilterTest {
  @Test
  void screenshotUploadsAuthenticateBeforeParsingAndRejectOversizedAuthenticatedBodies() throws Exception {
    AuthService staff = mock(AuthService.class);
    var filter = new ShipmentUploadAuthFilter(staff, mock(CustomerAuthService.class), new ObjectMapper());
    var request = new MockHttpServletRequest("POST", "/api/text-recognition/tasks/image");
    request.setContentType("multipart/form-data; boundary=unparsed");
    request.setContent(new byte[7 * 1024 * 1024]);
    var response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);
    filter.doFilter(request, response, chain);
    verify(staff).authenticate(isNull(), any());
    assertEquals(413, response.getStatus());
    verifyNoInteractions(chain);
  }
  @Test
  void rejectsUnauthorizedWorkbookUploadBeforeMultipartParsing() throws Exception {
    AuthService staff = mock(AuthService.class);
    when(staff.authenticate(isNull(), any())).thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "Login required"));
    var filter = new ShipmentUploadAuthFilter(staff, mock(CustomerAuthService.class), new ObjectMapper());
    var request = new MockHttpServletRequest("POST", "/api/text-recognition/tasks/workbook");
    request.setContentType("multipart/form-data; boundary=unparsed");
    request.setContent("This is deliberately not a valid multipart body".getBytes());
    var response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);
    filter.doFilter(request, response, chain);
    assertEquals(401, response.getStatus());
    verifyNoInteractions(chain);
  }
}
