package com.cargoplanner.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.RequestStats;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

class AdminServiceTest {
  @Test
  void rejectsResettingTheCurrentAdministratorsOwnPasswordBeforeAnyMutation() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    AdminService service = new AdminService(
        jdbcTemplate,
        mock(PasswordHasher.class),
        mock(RequestStats.class),
        mock(AuthService.class)
    );
    AuthenticatedUser administrator = new AuthenticatedUser(
        42L,
        "administrator",
        "Administrator",
        "ADMIN",
        "ACTIVE"
    );

    assertThatThrownBy(() -> service.resetEmployeePassword(
        42L,
        administrator,
        "127.0.0.1"
    )).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).status())
            .isEqualTo(HttpStatus.BAD_REQUEST));

    verifyNoInteractions(jdbcTemplate);
  }
}
