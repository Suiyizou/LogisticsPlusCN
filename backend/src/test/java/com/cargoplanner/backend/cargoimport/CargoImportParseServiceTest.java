package com.cargoplanner.backend.cargoimport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CargoImportParseServiceTest {
  @TempDir
  Path temporaryDirectory;

  @Test
  @SuppressWarnings("unchecked")
  void preservesNonStackAndKeepUprightAsIndependentConstraints() throws Exception {
    Path csv = temporaryDirectory.resolve("combined-constraints.csv");
    String content = String.join("\n",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,remark",
        "precision-device,100,80,60,1,120,normal,\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a"
    );
    Files.writeString(csv, content, StandardCharsets.UTF_8);

    Map<String, Object> response = new CargoImportParseService().parse(csv, csv.getFileName().toString());
    Map<String, Object> preview = (Map<String, Object>) response.get("preview");
    List<Map<String, Object>> cargos = (List<Map<String, Object>>) preview.get("aggregated");
    Map<String, Object> cargo = cargos.get(0);

    assertEquals(1, cargos.size());
    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
    assertEquals("normal", cargo.get("type"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void keepsPalletAsPhysicalTypeWhenBothConstraintsApply() throws Exception {
    Path csv = temporaryDirectory.resolve("constrained-pallet.csv");
    String content = String.join("\n",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,remark",
        "precision-pallet,120,100,138,1,300,pallet,\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a"
    );
    Files.writeString(csv, content, StandardCharsets.UTF_8);

    Map<String, Object> response = new CargoImportParseService().parse(csv, csv.getFileName().toString());
    Map<String, Object> preview = (Map<String, Object>) response.get("preview");
    List<Map<String, Object>> cargos = (List<Map<String, Object>>) preview.get("aggregated");
    Map<String, Object> cargo = cargos.get(0);

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
    assertEquals("pallet", cargo.get("type"));
  }

  @Test
  void explicitFalseOverridesPositiveConstraintText() throws Exception {
    List<Map<String, Object>> cargos = parseCargos(
        "explicit-false.csv",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,nonStack,keepUpright,remark",
        "ordinary-device,100,80,60,1,120,normal,false,false,\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a"
    );

    assertEquals(1, cargos.size());
    assertFalse(Boolean.TRUE.equals(cargos.get(0).get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargos.get(0).get("keepUpright")));
    assertEquals("normal", cargos.get(0).get("type"));
  }

  @Test
  void negativePhrasesDoNotCreateConstraints() throws Exception {
    List<Map<String, Object>> cargos = parseCargos(
        "negative-phrases.csv",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,remark",
        "ordinary-device,100,80,60,1,120,normal,\u975e\u6613\u788e\u54c1 \u53ef\u4ee5\u91cd\u538b \u53ef\u5806\u53e0 \u65e0\u9700\u4fdd\u6301\u671d\u4e0a"
    );

    assertFalse(Boolean.TRUE.equals(cargos.get(0).get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargos.get(0).get("keepUpright")));
  }

  @Test
  void recognizesNonstackableWithoutTreatingStackableSubstringAsNegative() throws Exception {
    List<Map<String, Object>> cargos = parseCargos(
        "nonstackable.csv",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,remark",
        "precision-device,100,80,60,1,120,nonstackable,"
    );

    assertTrue(Boolean.TRUE.equals(cargos.get(0).get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargos.get(0).get("keepUpright")));
    assertEquals("normal", cargos.get(0).get("type"));
  }

  @Test
  void aggregatesLegacyAndStandardConstraintRepresentations() throws Exception {
    List<Map<String, Object>> cargos = parseCargos(
        "semantic-aggregation.csv",
        "name,lengthCm,widthCm,heightCm,quantity,weightKg,type,nonStack,remark",
        "precision-device,100,80,60,1,120,nonstack,,",
        "precision-device,100,80,60,1,120,normal,true,"
    );

    assertEquals(1, cargos.size());
    assertEquals(2, cargos.get(0).get("quantity"));
    assertEquals("normal", cargos.get(0).get("type"));
    assertTrue(Boolean.TRUE.equals(cargos.get(0).get("nonStack")));
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> parseCargos(String fileName, String... lines) throws Exception {
    Path csv = temporaryDirectory.resolve(fileName);
    Files.writeString(csv, String.join("\n", lines), StandardCharsets.UTF_8);
    Map<String, Object> response = new CargoImportParseService().parse(csv, fileName);
    Map<String, Object> preview = (Map<String, Object>) response.get("preview");
    return (List<Map<String, Object>>) preview.get("aggregated");
  }
}
