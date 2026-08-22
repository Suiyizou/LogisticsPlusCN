package com.cargoplanner.backend.announcement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;

class AnnouncementImageServiceTest {
  @TempDir
  Path storageRoot;

  private JdbcTemplate jdbcTemplate;
  private AnnouncementImageService service;
  private AuthenticatedUser administrator;

  @BeforeEach
  void setUp() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1",
        "sa",
        ""
    );
    jdbcTemplate = new JdbcTemplate(dataSource);
    jdbcTemplate.execute(
        """
        CREATE TABLE cp_admin_audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_user_id BIGINT,
          action VARCHAR(80),
          target_type VARCHAR(40),
          detail VARCHAR(512),
          ip_address VARCHAR(64)
        )
        """
    );
    AnnouncementImageProperties properties = new AnnouncementImageProperties();
    properties.setRoot(storageRoot.toString());
    service = new AnnouncementImageService(jdbcTemplate, properties);
    administrator = new AuthenticatedUser(
        1L,
        "admin",
        "Administrator",
        "ADMIN",
        "ACTIVE"
    );
  }

  @Test
  void storesValidatedImageOnDiskAndReturnsPublicUrl() throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(4, 3, BufferedImage.TYPE_INT_RGB), "png", bytes);
    MockMultipartFile file = new MockMultipartFile(
        "file",
        "cover.png",
        "image/png",
        bytes.toByteArray()
    );

    Map<String, Object> uploaded = service.store(file, administrator, "127.0.0.1");
    String url = String.valueOf(uploaded.get("url"));
    String fileName = url.substring(url.lastIndexOf('/') + 1);

    assertThat(url).startsWith("/api/public/announcement-images/");
    assertThat(uploaded.get("storagePath")).isEqualTo("announcement-images/" + fileName);
    assertThat(Files.isRegularFile(storageRoot.resolve(fileName))).isTrue();
    assertThat(service.load(fileName).contentType()).isEqualTo("image/png");
    assertThat(jdbcTemplate.queryForObject(
        "SELECT action FROM cp_admin_audit_log",
        String.class
    )).isEqualTo("UPLOAD_ANNOUNCEMENT_IMAGE");
  }

  @Test
  void rejectsFileThatOnlyPretendsToBeAnImage() throws Exception {
    MockMultipartFile file = new MockMultipartFile(
        "file",
        "cover.png",
        "image/png",
        "not-an-image".getBytes()
    );

    assertThatThrownBy(() -> service.store(file, administrator, "127.0.0.1"))
        .isInstanceOf(ApiException.class);
    try (var files = Files.list(storageRoot)) {
      assertThat(files).isEmpty();
    }
  }
}
