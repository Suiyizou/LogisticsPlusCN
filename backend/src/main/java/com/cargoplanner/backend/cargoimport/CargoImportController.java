package com.cargoplanner.backend.cargoimport;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.workspacefile.WorkspaceFileService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/cargo-imports")
public class CargoImportController {
  private final CargoImportParseService parseService;
  private final WorkspaceFileService workspaceFileService;

  public CargoImportController(
      CargoImportParseService parseService,
      WorkspaceFileService workspaceFileService
  ) {
    this.parseService = parseService;
    this.workspaceFileService = workspaceFileService;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> preview(
      @RequestParam("file") MultipartFile file,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Upload file is required");
    }
    WorkspaceFileService.SavedWorkspaceFile saved = workspaceFileService.store(file, user, "QUICK_IMPORT");
    return previewSaved(saved);
  }

  @PostMapping("/preview/workspace-files/{fileId}")
  public Map<String, Object> previewWorkspaceFile(
      @PathVariable long fileId,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    WorkspaceFileService.WorkspaceFileContent content = workspaceFileService.ownedContent(fileId, user);
    Map<String, Object> preview = new LinkedHashMap<>(
        parseService.parse(content.path(), content.originalFileName())
    );
    preview.put("workspaceFile", workspaceFileService.ownedMetadata(fileId, user));
    return preview;
  }

  private Map<String, Object> previewSaved(WorkspaceFileService.SavedWorkspaceFile saved) {
    Map<String, Object> preview = new LinkedHashMap<>(
        parseService.parse(saved.path(), saved.record().originalFileName())
    );
    preview.put("workspaceFile", workspaceFileService.metadata(saved));
    return preview;
  }
}
