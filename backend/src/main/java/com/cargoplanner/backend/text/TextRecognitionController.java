package com.cargoplanner.backend.text;

import com.cargoplanner.backend.text.workbook.WorkbookEvidenceService;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/text-recognition")
public class TextRecognitionController {
  private final TextRecognitionService textRecognitionService;
  private final WorkbookEvidenceService workbookEvidenceService;

  public TextRecognitionController(TextRecognitionService textRecognitionService, WorkbookEvidenceService workbookEvidenceService) {
    this.textRecognitionService = textRecognitionService;
    this.workbookEvidenceService = workbookEvidenceService;
  }

  @GetMapping("/capabilities")
  public Map<String, Object> capabilities() {
    return textRecognitionService.capabilities();
  }

  @PostMapping("/tasks")
  public Map<String, Object> createTask(@RequestBody TextRecognitionRequest request) {
    return textRecognitionService.createTask(request);
  }

  @PostMapping(value = "/tasks/workbook", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> createWorkbookTask(
      @RequestParam("file") MultipartFile file,
      @RequestParam(defaultValue = "auto") String languageHint
  ) {
    Map<String, Object> document = workbookEvidenceService.parse(file);
    return textRecognitionService.createWorkbookTask(document, String.valueOf(document.get("fileName")), languageHint);
  }

  @GetMapping("/tasks")
  public List<Map<String, Object>> tasks() {
    return textRecognitionService.listTasks();
  }

  @GetMapping("/tasks/{id}")
  public Map<String, Object> task(@PathVariable long id) {
    return textRecognitionService.getTask(id);
  }

  @GetMapping(value = "/tasks/{id}/cleaned-json", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> cleanedJson(@PathVariable long id) {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_JSON)
        .body(textRecognitionService.cleanedJson(id));
  }

  @GetMapping("/tasks/{id}/cleaned-excel")
  public ResponseEntity<byte[]> cleanedExcel(@PathVariable long id) {
    byte[] bytes = textRecognitionService.cleanedWorkbook(id);
    String fileName = "text-recognition-task-" + id + ".xlsx";
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(fileName).build().toString())
        .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(bytes);
  }
}
