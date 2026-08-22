package com.cargoplanner.backend.excel;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.workspacefile.WorkspaceFileService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/excel-cleaning")
public class ExcelCleaningController {
  private final ExcelCleaningService excelCleaningService;
  private final WorkspaceFileService workspaceFileService;

  public ExcelCleaningController(
      ExcelCleaningService excelCleaningService,
      WorkspaceFileService workspaceFileService
  ) {
    this.excelCleaningService = excelCleaningService;
    this.workspaceFileService = workspaceFileService;
  }

  @PostMapping(value = "/tasks", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> createTask(
      @RequestParam("file") MultipartFile file,
      @RequestParam(value = "mode", defaultValue = "agent") String mode,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    WorkspaceFileService.SavedWorkspaceFile saved = workspaceFileService.store(file, user, "AGENT_IMPORT");
    Map<String, Object> task = new LinkedHashMap<>(excelCleaningService.createTask(file, mode));
    task.put("workspaceFile", workspaceFileService.metadata(saved));
    return task;
  }

  @GetMapping("/tasks")
  public List<Map<String, Object>> tasks() {
    return excelCleaningService.listTasks();
  }

  @GetMapping("/tasks/{id}")
  public Map<String, Object> task(@PathVariable long id) {
    return excelCleaningService.getTask(id);
  }

  @GetMapping(value = "/tasks/{id}/cleaned-json", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> cleanedJson(@PathVariable long id) {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_JSON)
        .body(excelCleaningService.cleanedJson(id));
  }

  @GetMapping("/tasks/{id}/cleaned-excel")
  public ResponseEntity<byte[]> cleanedExcel(@PathVariable long id) {
    byte[] bytes = excelCleaningService.cleanedWorkbook(id);
    String fileName = "excel-cleaning-task-" + id + ".xlsx";
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(fileName).build().toString())
        .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(bytes);
  }
}
