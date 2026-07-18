package com.cargoplanner.backend.workspacefile;

import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/workspace-files")
public class AdminWorkspaceFileController {
  private final WorkspaceFileService workspaceFileService;

  public AdminWorkspaceFileController(WorkspaceFileService workspaceFileService) {
    this.workspaceFileService = workspaceFileService;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(value = "userId", required = false) Long userId,
      @RequestParam(value = "date", required = false) String date,
      @RequestParam(value = "page", defaultValue = "0") int page,
      @RequestParam(value = "size", defaultValue = "100") int size,
      @RequestParam(value = "includeExpired", defaultValue = "false") boolean includeExpired
  ) {
    return workspaceFileService.listAll(
        userId,
        WorkspaceFileController.parseDate(date),
        page,
        size,
        includeExpired
    );
  }

  @GetMapping("/{id}")
  public Map<String, Object> metadata(@PathVariable long id) {
    return workspaceFileService.adminMetadata(id);
  }

  @GetMapping("/{id}/preview")
  public ResponseEntity<Resource> preview(@PathVariable long id) {
    return WorkspaceFileController.fileResponse(workspaceFileService.adminContent(id), false);
  }

  @GetMapping("/{id}/download")
  public ResponseEntity<Resource> download(@PathVariable long id) {
    return WorkspaceFileController.fileResponse(workspaceFileService.adminContent(id), true);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable long id) {
    workspaceFileService.deleteAsAdmin(id);
    return Map.of("deleted", true, "id", id);
  }
}
