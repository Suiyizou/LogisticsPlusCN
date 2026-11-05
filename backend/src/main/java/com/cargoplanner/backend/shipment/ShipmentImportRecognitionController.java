package com.cargoplanner.backend.shipment;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShipmentImportRecognitionController {
  private final ShipmentImportRecognitionService recognition;

  public ShipmentImportRecognitionController(ShipmentImportRecognitionService recognition) {
    this.recognition = recognition;
  }

  @PostMapping("/api/business/shipment-import/recognize-schema")
  public ShipmentImportRecognitionService.Result recognizeSchema(
      @RequestBody JsonNode request,
      @RequestAttribute(name = UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, required = false) AuthenticatedUser user
  ) {
    PublishedShipmentTaskService.requireManager(user);
    return recognition.recognize(request);
  }
}
