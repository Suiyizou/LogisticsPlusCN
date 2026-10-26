package com.cargoplanner.backend.text;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cargoplanner.backend.text.workbook.WorkbookEvidenceService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class WorkbookUploadControllerTest {
  @Test
  void uploadsTheNativeFileAndStartsTheToolWorkflowRatherThanFlatteningClientText() throws Exception {
    TextRecognitionService tasks = mock(TextRecognitionService.class);
    when(tasks.createWorkbookTask(anyMap(), eq("source.csv"), eq("zh"))).thenReturn(Map.of("id", 71, "status", "RUNNING"));
    var mvc = MockMvcBuilders.standaloneSetup(new TextRecognitionController(tasks, new WorkbookEvidenceService())).build();
    var file = new MockMultipartFile("file", "source.csv", "text/csv", "Item,QTY\n1,20\n".getBytes(StandardCharsets.UTF_8));
    mvc.perform(multipart("/api/text-recognition/tasks/workbook").file(file).param("languageHint", "zh"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(71));
    verify(tasks).createWorkbookTask(argThat(doc -> doc.get("formatVersion").equals("workbook-evidence-v1")
        && WorkbookEvidenceService.list(doc.get("sheets")).size() == 1), eq("source.csv"), eq("zh"));
    verify(tasks, never()).createTask(any());
  }
}
