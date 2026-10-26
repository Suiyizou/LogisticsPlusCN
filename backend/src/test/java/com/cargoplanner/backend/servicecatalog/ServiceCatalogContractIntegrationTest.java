package com.cargoplanner.backend.servicecatalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import com.cargoplanner.backend.common.ApiExceptionHandler;
import com.cargoplanner.backend.persistence.MyBatisTestSupport;
import com.cargoplanner.backend.platform.audit.AuditWriter;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogController;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogPatch;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogResponse;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogUpdate;
import com.cargoplanner.backend.servicecatalog.api.ServiceCatalogWrite;
import com.cargoplanner.backend.servicecatalog.application.ServiceCatalogApplicationService;
import com.cargoplanner.backend.servicecatalog.infrastructure.ServiceCatalogMapper;
import com.cargoplanner.backend.servicecatalog.infrastructure.ServiceCatalogRepository;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

class ServiceCatalogContractIntegrationTest {
  private static final String BASE = "/api/business/service-catalog";
  private static final AuthenticatedUser BUSINESS =
      new AuthenticatedUser(1, "business", "Business", "BUSINESS", "ACTIVE");
  private static final AuthenticatedUser AGENT =
      new AuthenticatedUser(2, "agent", "Agent", "OVERSEA_AGENT", "ACTIVE");
  private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  private JdbcTemplate jdbc;
  private MockMvc mvc;

  @BeforeEach
  void setup() throws Exception {
    var dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
    jdbc = new JdbcTemplate(dataSource);
    String ddl = new ClassPathResource("db/migration/V4__service_catalog.sql")
        .getContentAsString(StandardCharsets.UTF_8).replaceAll("ENGINE=InnoDB[^;]*", "");
    jdbc.execute(ddl);
    jdbc.execute("""
        CREATE TABLE module_test_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY,
          actor_id BIGINT NOT NULL, action VARCHAR(64), target_id BIGINT, detail VARCHAR(512))
        """);
    var mapper = MyBatisTestSupport.session(dataSource, ServiceCatalogMapper.class)
        .getMapper(ServiceCatalogMapper.class);
    AuditWriter audit = (actor, action, targetType, id, detail, ip) -> jdbc.update(
        "INSERT INTO module_test_audit(actor_id, action, target_id, detail) VALUES (?, ?, ?, ?)",
        actor.id(), action, id, detail);
    var target = new ServiceCatalogApplicationService(new ServiceCatalogRepository(mapper), audit);
    var proxy = new ProxyFactory(target);
    proxy.setProxyTargetClass(true);
    proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(dataSource),
        new AnnotationTransactionAttributeSource()));
    var validator = new LocalValidatorFactoryBean();
    validator.afterPropertiesSet();
    mvc = MockMvcBuilders.standaloneSetup(new ServiceCatalogController(
        (ServiceCatalogApplicationService) proxy.getProxy()))
        .setValidator(validator).setControllerAdvice(new ApiExceptionHandler())
        .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
  }

  @Test
  void generatedDtoAndHttpMethodsMatchCheckedInOpenApi() throws Exception {
    var contract = json.readTree(Files.readString(projectRoot().resolve("contracts/platform.openapi.json")));
    var schemas = contract.path("components").path("schemas");
    assertThat(names(ServiceCatalogWrite.class)).isEqualTo(keys(schemas.path("ServiceCatalogWrite").path("properties")));
    assertThat(names(ServiceCatalogResponse.class)).isEqualTo(keys(schemas.path("ServiceCatalogResponse").path("properties")));
    var required = Arrays.stream(ServiceCatalogWrite.class.getRecordComponents())
        .filter(field -> field.isAnnotationPresent(NotBlank.class) || field.isAnnotationPresent(NotNull.class)
            || Arrays.stream(ServiceCatalogWrite.class.getDeclaredFields()).anyMatch(member -> member.getName().equals(field.getName())
                && (member.isAnnotationPresent(NotBlank.class) || member.isAnnotationPresent(NotNull.class))))
        .map(field -> field.getName()).collect(Collectors.toSet());
    assertThat(required).isEqualTo(strings(schemas.path("ServiceCatalogWrite").path("required")));
    Set<String> patchNames = Arrays.stream(ServiceCatalogPatch.class.getDeclaredMethods())
        .filter(method -> method.isAnnotationPresent(JsonSetter.class))
        .map(method -> method.getAnnotation(JsonSetter.class).value()).collect(Collectors.toSet());
    assertThat(patchNames).isEqualTo(keys(schemas.path("ServiceCatalogPatch").path("properties")));
    assertThat(names(ServiceCatalogUpdate.class)).isEqualTo(keys(schemas.path("ServiceCatalogUpdate").path("properties")));
    String base = ServiceCatalogController.class.getAnnotation(RequestMapping.class).value()[0].substring(4);
    for (var method : ServiceCatalogController.class.getDeclaredMethods()) {
      String verb; String[] routes;
      if (method.isAnnotationPresent(GetMapping.class)) { verb="get"; routes=method.getAnnotation(GetMapping.class).value(); }
      else if (method.isAnnotationPresent(PostMapping.class)) { verb="post"; routes=method.getAnnotation(PostMapping.class).value(); }
      else if (method.isAnnotationPresent(PatchMapping.class)) { verb="patch"; routes=method.getAnnotation(PatchMapping.class).value(); }
      else continue;
      assertThat(contract.path("paths").path(base+(routes.length==0?"":routes[0])).has(verb)).isTrue();
    }
  }

  @Test
  void zeroBasedPagesExposeStableProjectionAndTotals() throws Exception {
    create("FIRST", "First", "Original");
    create("SECOND", "Second", null);
    var first = body(mvc.perform(actor(get(BASE).param("page", "0").param("pageSize", "1")))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    assertThat(first.path("page").asInt()).isZero();
    assertThat(first.path("total").asInt()).isEqualTo(2);
    assertThat(first.path("totalPages").asInt()).isEqualTo(2);
    assertThat(first.path("items").get(0).path("code").asText()).isEqualTo("SECOND");
    assertThat(first.path("items").get(0).has("createdBy")).isFalse();
    assertThat(first.path("items").get(0).has("publicId")).isFalse();
    mvc.perform(actor(get(BASE).param("page", "-1"))).andExpect(status().isBadRequest());
    mvc.perform(actor(get(BASE).param("pageSize", "101"))).andExpect(status().isBadRequest());
    var second = body(mvc.perform(actor(get(BASE).param("page", "1").param("pageSize", "1")))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    assertThat(second.path("items").get(0).path("code").asText()).isEqualTo("FIRST");
  }

  @Test
  void patchAbsentPreservesNullClearsAndStaleVersionCannotOverwrite() throws Exception {
    String id = create("PATCH", "Before", "Retain me");
    var changed = update(id, "{\"version\":0,\"values\":{\"name\":\"After\"}}");
    assertThat(changed.path("description").asText()).isEqualTo("Retain me");
    assertThat(changed.path("version").asLong()).isEqualTo(1);
    var cleared = update(id, "{\"version\":1,\"values\":{\"description\":null}}");
    assertThat(cleared.path("description").isNull()).isTrue();
    mvc.perform(actor(patch(BASE+"/"+id).contentType(MediaType.APPLICATION_JSON)
        .content("{\"version\":0,\"values\":{\"name\":\"Stale\"}}")))
        .andExpect(status().isConflict());
    assertThat(jdbc.queryForObject("SELECT name FROM cp_service_catalog WHERE public_id = ?", String.class, id)).isEqualTo("After");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM module_test_audit", Integer.class)).isEqualTo(3);
  }

  @Test
  void missingAndNullRequiredCreateValuesAreBadRequestsButOptionalDescriptionIsAllowed() throws Exception {
    for (String request : new String[]{"{}", "{\"code\":null,\"name\":\"X\",\"enabled\":true}",
        "{\"code\":\"X\",\"name\":\"X\"}", "{\"code\":\"X\",\"name\":\" \",\"enabled\":true}"}) {
      mvc.perform(actor(post(BASE).contentType(MediaType.APPLICATION_JSON).content(request)))
          .andExpect(status().isBadRequest());
    }
    mvc.perform(actor(post(BASE).contentType(MediaType.APPLICATION_JSON)
        .content("{\"code\":\"OPTIONAL\",\"name\":\"Name\",\"enabled\":true}")))
        .andExpect(status().isCreated());
  }

  @Test
  void patchRejectsNullRequiredUnknownFieldsAndNegativeVersion() throws Exception {
    String id = create("VALID", "Valid", "Original");
    for (String request : new String[]{"{\"version\":0,\"values\":{\"code\":null}}",
        "{\"version\":0,\"values\":{\"enabled\":null}}",
        "{\"version\":-1,\"values\":{}}",
        "{\"version\":0,\"values\":{\"createdBy\":99}}",
        "{\"version\":0,\"values\":{},\"arbitrary\":true}"}) {
      mvc.perform(actor(patch(BASE+"/"+id).contentType(MediaType.APPLICATION_JSON).content(request)))
          .andExpect(status().isBadRequest());
    }
    assertThat(jdbc.queryForObject("SELECT version FROM cp_service_catalog WHERE public_id = ?", Long.class, id)).isZero();
  }

  @Test
  void customersAndOverseasAgentsCannotAccessInternalReferenceModule() throws Exception {
    mvc.perform(get(BASE).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, AGENT))
        .andExpect(status().isForbidden());
    mvc.perform(post(BASE).requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE, AGENT)
        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"BLOCK\",\"name\":\"Blocked\",\"enabled\":true}"))
        .andExpect(status().isForbidden());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cp_service_catalog", Integer.class)).isZero();
  }

  @Test
  void uniqueConflictsAndAuditFailuresDoNotLeavePartiallyWrittenRecords() throws Exception {
    create("UNIQUE", "Existing", null);
    mvc.perform(actor(post(BASE).contentType(MediaType.APPLICATION_JSON)
        .content("{\"code\":\"UNIQUE\",\"name\":\"Duplicate\",\"enabled\":true}")))
        .andExpect(status().isConflict());
    long existingId = jdbc.queryForObject("SELECT MAX(target_id) FROM module_test_audit", Long.class);
    jdbc.execute("ALTER TABLE module_test_audit ADD CONSTRAINT reject_new CHECK (target_id <= " + existingId + ")");
    mvc.perform(actor(post(BASE).contentType(MediaType.APPLICATION_JSON)
        .content("{\"code\":\"FAIL\",\"name\":\"Rollback\",\"enabled\":true}")))
        .andExpect(status().isInternalServerError());
    assertThat(jdbc.queryForList("SELECT code FROM cp_service_catalog", String.class)).containsExactly("UNIQUE");
  }

  private String create(String code, String name, String description) throws Exception {
    var node = json.createObjectNode().put("code",code).put("name",name).put("enabled",true);
    if(description!=null)node.put("description",description);
    return body(mvc.perform(actor(post(BASE).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(node))))
        .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asText();
  }
  private JsonNode update(String id,String request) throws Exception {
    return body(mvc.perform(actor(patch(BASE+"/"+id).contentType(MediaType.APPLICATION_JSON).content(request)))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
  }
  private MockHttpServletRequestBuilder actor(MockHttpServletRequestBuilder request) {
    return request.requestAttr(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE,BUSINESS);
  }
  private JsonNode body(String value) throws Exception { return json.readTree(value); }
  private Set<String> names(Class<?> type) { return Arrays.stream(type.getRecordComponents()).map(field->field.getName()).collect(Collectors.toSet()); }
  private Set<String> keys(JsonNode node) { Set<String> result=new HashSet<>();node.fieldNames().forEachRemaining(result::add);return result; }
  private Set<String> strings(JsonNode node) { Set<String> result=new HashSet<>();node.forEach(value->result.add(value.asText()));return result; }
  private Path projectRoot() {
    Path root=Path.of("").toAbsolutePath();while(root!=null&&!Files.exists(root.resolve("contracts/platform.openapi.json")))root=root.getParent();
    if(root==null)throw new AssertionError("OpenAPI contract was not generated");return root;
  }
}
