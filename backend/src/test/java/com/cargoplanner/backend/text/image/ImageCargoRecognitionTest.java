package com.cargoplanner.backend.text.image;

import static org.junit.jupiter.api.Assertions.*;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ImageCargoRecognitionTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final ImageCargoRecognition contract = new ImageCargoRecognition(mapper);

  @Test
  void decodesRealPngAndBuildsImageMessagesWithoutWorkbookTools() throws Exception {
    Map<String, Object> image = contract.read(png("source.png", 400, 200));
    assertEquals(400, image.get("width"));
    Map<String, Object> request = contract.request(image, "zh");
    String json = mapper.writeValueAsString(request);
    assertTrue(json.contains("image_url"));
    assertTrue(json.contains("data:image/png;base64,"));
    assertFalse(request.containsKey("tools"));
    assertFalse(json.contains("read_sheet_range"));
  }

  @Test
  void rejectsSpoofedMimeSvgUnreadablePixelsAndOversizedDimensions() throws Exception {
    var actual = png("source.png", 2, 2);
    assertThrows(ApiException.class, () -> contract.read(new MockMultipartFile("file", "source.jpg", "image/jpeg", actual.getBytes())));
    assertThrows(ApiException.class, () -> contract.read(new MockMultipartFile("file", "source.svg", "image/svg+xml", "<svg/>".getBytes())));
    assertThrows(ApiException.class, () -> contract.read(new MockMultipartFile("file", "source.png", "image/png", "fake png".getBytes())));
    assertThrows(ApiException.class, () -> contract.read(png("huge.png", 8001, 1)));
    assertThrows(ApiException.class, () -> contract.read(new MockMultipartFile("file", "huge.png", "image/png", new byte[ImageCargoRecognition.MAX_BYTES + 1])));
  }

  @Test
  @SuppressWarnings("unchecked")
  void convertsSourceUnitsAndGroupGrossButAlwaysRequiresSourceConfirmation() throws Exception {
    Map<String, Object> result = contract.validate(output(row()), "screenshot.png");
    var cargo = ((List<Map<String, Object>>) result.get("rows")).get(0);
    assertEquals(120.0, cargo.get("lengthCm"));
    assertEquals(2, cargo.get("quantity"));
    assertEquals(250.0, cargo.get("weightKg"));
    assertEquals(true, result.get("requiresConfirmation"));
    assertEquals(List.of(), result.get("issues"));
    assertFalse(mapper.writeValueAsString(result).contains("base64"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void neverDefaultsMissingUnitDimensionsCountsOrWeightsAndKeepsRepairCandidate() throws Exception {
    Map<String, Object> source = row();
    source.put("dimensionUnit", null); source.put("quantity", null); source.put("weightBasis", null);
    Map<String, Object> result = contract.validate(output(source), "screenshot.png");
    var cargo = ((List<Map<String, Object>>) result.get("rows")).get(0);
    assertEquals(0.0, cargo.get("lengthCm"));
    assertEquals(0, cargo.get("quantity"));
    assertEquals(0.0, cargo.get("weightKg"));
    var issue = ((List<Map<String, Object>>) result.get("issues")).get(0);
    assertEquals("IMAGE_FIELD_MISSING", issue.get("code"));
    assertEquals(List.of("lengthCm", "widthCm", "heightCm", "weightKg", "quantity"), issue.get("fields"));
    assertEquals(cargo, issue.get("cargo"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void missingHandlingFieldsRemainUnknownAndExposeOnlyTheFieldsNeedingCorrection() throws Exception {
    Map<String, Object> source = row();
    source.put("type", "unsupported"); source.remove("nonStack"); source.remove("keepUpright");
    Map<String, Object> result = contract.validate(output(source), "source.png");
    var cargo = ((List<Map<String, Object>>) result.get("rows")).get(0);
    assertNull(cargo.get("type"));
    assertNull(cargo.get("nonStack"));
    assertNull(cargo.get("keepUpright"));
    var issue = ((List<Map<String, Object>>) result.get("issues")).get(0);
    assertEquals(List.of("type", "nonStack", "keepUpright"), issue.get("fields"));
    assertEquals(1, issue.get("sourceRowNumber"));
  }

  @Test
  void rejectsTruncatedMalformedDuplicateAndOversizedStructuredResponses() throws Exception {
    for (String invalid : List.of("{}", "{\"complete\":true}", output(row()) + "{}", "{\"rows\":[],\"rows\":[]}", "```json\n" + output(row()) + "\n```")) {
      assertThrows(IllegalArgumentException.class, () -> contract.validate(invalid, "source.png"));
    }
    assertThrows(IllegalArgumentException.class, () -> contract.validate("x".repeat(256001), "source.png"));
  }

  private String output(Map<String, Object> row) throws Exception {
    return mapper.writeValueAsString(Map.of("complete", true, "rows", List.of(row), "issues", List.of()));
  }

  @Test
  @SuppressWarnings("unchecked")
  void independentPrintedTotalsRequireEvidenceAndNeverComeFromCalculatedRows() throws Exception {
    String content = mapper.writeValueAsString(Map.of("complete", true, "rows", List.of(row()), "issues", List.of(),
        "sourceTotals", Map.of("packageCount", 2, "grossWeight", 500000, "weightUnit", "g", "declaredVolumeM3", 3.6, "sourceText", "TOTAL 2 packages, 500000 g, 3.6 m3")));
    Map<String, Object> result = contract.validate(content, "source.png");
    Map<String, Object> expected = (Map<String, Object>) result.get("expected");
    assertEquals(2.0, expected.get("packageCount"));
    assertEquals(500.0, expected.get("grossWeightKg"));
    assertEquals(Map.of(), contract.validate(output(row()), "source.png").get("expected"));
    String noEvidence = content.replace("TOTAL 2 packages, 500000 g, 3.6 m3", "");
    assertEquals(Map.of(), contract.validate(noEvidence, "source.png").get("expected"));
    assertTrue(((List<Map<String, Object>>) contract.validate(noEvidence, "source.png").get("issues")).stream()
        .anyMatch(issue -> "IMAGE_TOTAL_INVALID".equals(issue.get("code"))));
  }
  private Map<String, Object> row() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("name", "Pump"); row.put("length", 1200); row.put("width", 1000); row.put("height", 1500);
    row.put("dimensionUnit", "mm"); row.put("quantity", 2); row.put("weight", 500000);
    row.put("weightUnit", "g"); row.put("weightBasis", "group-total"); row.put("type", "pallet");
    row.put("nonStack", true); row.put("keepUpright", true); row.put("sourceText", "2 pallets 1200x1000x1500 mm, gross total 500000 g");
    return row;
  }
  private MockMultipartFile png(String name, int width, int height) throws Exception {
    var output = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output);
    return new MockMultipartFile("file", name, "image/png", output.toByteArray());
  }
}
