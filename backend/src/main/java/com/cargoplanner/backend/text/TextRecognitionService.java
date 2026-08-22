package com.cargoplanner.backend.text;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.cargoplanner.backend.admin.LlmSettingsService.LlmRuntimeSettings;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class TextRecognitionService {
  private static final String TEXT_RECOGNITION_ENGINE_VERSION = "excel-agent-batch-v6";
  private static final List<String> OUTPUT_HEADERS = List.of(
      "name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "nonStack", "keepUpright", "color", "sku", "remark"
  );
  private static final Pattern SKID_LINE_PATTERN = Pattern.compile(
      "(?i)^\\s*(?:(?<name>[\\p{IsHan}A-Za-z][^\\d/]{1,80}?)\\s+)?(?<quantity>\\d+)\\s*"
          + "(?<pack>skids?|pallets?|pieces?|pcs|cartons?|cases?|boxes?|crates?|件|箱|个|托|托盘)"
          + "\\s*[-–—]?\\s*(?:each\\s*)?(?<weight>[0-9][0-9.,]*)\\s*(?:kgs?|kg|公斤|千克)"
          + "\\s*/\\s*(?<length>[0-9][0-9.,]*)\\s*[x×*]\\s*(?<width>[0-9][0-9.,]*)"
          + "\\s*[x×*]\\s*(?<height>[0-9][0-9.,]*)\\s*(?<dimensionUnit>cm|mm|m|厘米|毫米|米)?\\s*$"
  );
  private static final Pattern DIMENSION_LINE_PATTERN = Pattern.compile(
      "(?i)^\\s*(?<name>.*?)\\s*(?<length>[0-9][0-9.,]*)\\s*[x×*]\\s*(?<width>[0-9][0-9.,]*)"
          + "\\s*[x×*]\\s*(?<height>[0-9][0-9.,]*)\\s*(?<dimensionUnit>cm|mm|m|厘米|毫米|米)?\\s*(?<tail>.*)$"
  );
  private static final Pattern QUANTITY_PATTERN = Pattern.compile("(?i)(?:数量|qty|quantity)?\\s*(\\d+)\\s*(?:件|个|箱|pcs?|pieces?|cartons?|boxes?)");
  private static final Pattern WEIGHT_PATTERN = Pattern.compile("(?i)(?:单重|每件|unit\\s*weight|each|weight|wt)?\\s*([0-9][0-9.,]*)\\s*(kg|kgs|公斤|千克|g|克|t|吨)");
  private static final Pattern THOUSAND_KG_PATTERN = Pattern.compile("(?i)(?<!\\d)([0-9]{1,3}\\.[0-9]{3}(?:\\.[0-9]{3})*)\\s*(?:kgs?|kg|公斤|千克)");
  private static final Pattern KG_WEIGHT_TOKEN_PATTERN = Pattern.compile("(?i)(?<!\\d)([0-9][0-9.,]*)\\s*(?:kgs?|kg|公斤|千克)");
  private static final Pattern MODEL_PATTERN = Pattern.compile("(?i)(?:型号|model|spec)\\s*[:：]?\\s*([A-Za-z0-9._\\-\\/]+)");
  private static final Pattern HAS_DATA_PATTERN = Pattern.compile("(?i)(\\d+\\s*[x×*]\\s*\\d+)|(kg|kgs|cm|mm|skid|pallet|pcs|件|箱|尺寸|长|宽|高)");
  private static final Pattern HAS_LETTER_OR_HAN = Pattern.compile(".*[\\p{IsHan}A-Za-z].*");
  private static final Pattern FLEX_DIMENSION_PATTERN = Pattern.compile(
      "(?i)(?:长|length|l)?\\s*(?<length>[0-9][0-9.,]*)\\s*(?<unit1>cm|mm|m|厘米|毫米|米)?\\s*[xX×*]\\s*"
          + "(?:宽|width|w)?\\s*(?<width>[0-9][0-9.,]*)\\s*(?<unit2>cm|mm|m|厘米|毫米|米)?\\s*[xX×*]\\s*"
          + "(?:高|height|h)?\\s*(?<height>[0-9][0-9.,]*)\\s*(?<unit3>cm|mm|m|厘米|毫米|米)?"
  );
  private static final Pattern CSV_SPLIT_PATTERN = Pattern.compile("\\s*[,，\\t]\\s*");
  private static final Pattern FLEX_QUANTITY_PATTERN = Pattern.compile(
      "(?i)(?:数量|qty|quantity)?\\s*(\\d+)\\s*(?:件|个|箱|盒|pcs?|pieces?|cartons?|boxes?|双|套|只|台|包|袋|页|片|张)"
  );
  private static final Pattern FLEX_WEIGHT_PATTERN = Pattern.compile(
      "(?i)(?:单重|每件|单箱毛重|毛重|净重|unit\\s*weight|each|weight|wt)?\\s*([0-9][0-9.,]*)\\s*(kg|kgs|公斤|千克|g|克|t|吨)"
  );
  private static final Pattern EXCEL_ROW_PATTERN = Pattern.compile("^R(\\d+):\\s.*$");
  private static final Pattern EXCEL_SOURCE_ROW_PATTERN = Pattern.compile("(?:^|\\s)R(\\d+):");
  private static final Pattern EXCEL_HEADER_ROW_PATTERN = Pattern.compile("^DETECTED_HEADER_ROW:\\s*(\\d+).*$");
  private static final Pattern FINAL_PACKAGE_CANDIDATE_PATTERN = Pattern.compile(
      "^FINAL_PACKAGE_CANDIDATE(?:\\s+\\d+)?\\s*:\\s*(\\{.*})\\s*$"
  );
  private static final Pattern EXCEL_SOURCE_RANGE_PATTERN = Pattern.compile("(?i)^R(\\d+)\\s*:\\s*R(\\d+)$");
  private static final Pattern EXCEL_CELL_PATTERN = Pattern.compile(
      "(?i)(?:^|:\\s*|\\|\\s*)([A-Z]+)=(\"(?:\\\\.|[^\"\\\\])*\")"
  );
  private static final Pattern INLINE_DIMENSION_UNIT_PATTERN = Pattern.compile(
      "(?i)-?\\d+(?:[.,]\\d+)?\\s*(mm|cm|m|毫米|厘米|米)"
  );
  private static final Pattern DIMENSION_NUMBER_TOKEN_PATTERN = Pattern.compile("-?\\d+(?:[.,]\\d+)?");
  private static final Pattern PALLET_HANDLING_UNIT_PATTERN = Pattern.compile(
      "(?i)(?<![\\p{L}\\p{N}])(?:pallets?|skids?|crates?|(?:wooden|wood)[\\s-]+(?:cases?|crates?|boxes?|packaging))(?![\\p{L}\\p{N}])"
  );
  private static final int EXCEL_AGENT_BATCH_MAX_ROWS = 10;
  private static final int EXCEL_AGENT_BATCH_MAX_TARGET_CHARS = 6_000;
  private static final int EXCEL_AGENT_MAX_PARALLEL_BATCHES = 4;
  private static final int EXCEL_AGENT_PREVIOUS_CONTEXT_ROWS = 2;
  private static final int EXCEL_AGENT_NEXT_CONTEXT_ROWS = 1;
  private static final int EXCEL_AGENT_MAX_REQUESTS_PER_TASK = 96;
  private static final int EXCEL_AGENT_MAX_PREAMBLE_CHARS = 2_000;
  private static final int EXCEL_AGENT_MAX_METADATA_CHARS = 3_000;
  private static final int EXCEL_AGENT_MAX_CONTEXT_ROW_CHARS = 1_600;
  private static final int EXCEL_AGENT_MAX_TARGET_ROW_CHARS = 4_000;
  private static final Duration EXCEL_AGENT_TASK_DEADLINE = Duration.ofMinutes(8);
  private static final Duration LLM_CONNECT_TIMEOUT = Duration.ofSeconds(15);
  private static final Duration LLM_READ_TIMEOUT = Duration.ofSeconds(90);
  private static final int LLM_MAX_TRANSIENT_ATTEMPTS = 3;
  private static final long LLM_MAX_RETRY_DELAY_MS = 10_000;

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final LlmSettingsService llmSettingsService;
  private final RestTemplate restTemplate = createLlmRestTemplate();
  private final int excelAgentBatchConcurrency;
  private final ExecutorService excelAgentBatchExecutor;
  private final ExecutorService recognitionExecutor = Executors.newFixedThreadPool(2, runnable -> {
    Thread thread = new Thread(runnable, "text-recognition-agent");
    thread.setDaemon(true);
    return thread;
  });
  private volatile boolean tableReady = false;

  public TextRecognitionService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      LlmSettingsService llmSettingsService,
      @Value("${app.text-recognition.excel-agent-concurrency:3}") int excelAgentBatchConcurrency
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.llmSettingsService = llmSettingsService;
    this.excelAgentBatchConcurrency = Math.max(1, Math.min(EXCEL_AGENT_MAX_PARALLEL_BATCHES, excelAgentBatchConcurrency));
    this.excelAgentBatchExecutor = Executors.newFixedThreadPool(this.excelAgentBatchConcurrency, runnable -> {
      Thread thread = new Thread(runnable, "excel-agent-batch");
      thread.setDaemon(true);
      return thread;
    });
  }

  private static RestTemplate createLlmRestTemplate() {
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(LLM_CONNECT_TIMEOUT);
    requestFactory.setReadTimeout(LLM_READ_TIMEOUT);
    return new RestTemplate(requestFactory);
  }

  public Map<String, Object> createTask(TextRecognitionRequest request) {
    ensureTable();
    String text = cleanCell(request == null ? "" : request.text());
    if (text.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Text is required");
    }

    long taskId = insertTask(request);
    String languageHint = request == null ? "" : request.languageHint();
    jdbcTemplate.update(
        "UPDATE cp_text_recognition_tasks SET status = 'RUNNING', agent_notes = ? WHERE id = ?",
        isFormattedExcelAgentInput(text) ? "正在自动拆分 Excel 并分批调用 Agent。" : "正在调用 Agent 识别。",
        taskId
    );
    try {
      recognitionExecutor.submit(() -> processTask(taskId, text, languageHint));
    } catch (RejectedExecutionException error) {
      jdbcTemplate.update(
          "UPDATE cp_text_recognition_tasks SET status = 'FAILED', error_message = ?, finished_at = ? WHERE id = ?",
          "识别任务队列当前不可用，请稍后重试。",
          Timestamp.from(Instant.now()),
          taskId
      );
    }
    return getTask(taskId);
  }

  public Map<String, Object> capabilities() {
    return Map.of(
        "engineVersion", TEXT_RECOGNITION_ENGINE_VERSION,
        "adaptiveBatching", true,
        "parallelBatching", true,
        "maxConcurrentBatchRequests", excelAgentBatchConcurrency,
        "maxTargetRowsPerBatch", EXCEL_AGENT_BATCH_MAX_ROWS,
        "maxTargetCharsPerBatch", EXCEL_AGENT_BATCH_MAX_TARGET_CHARS,
        "maxRequestsPerTask", EXCEL_AGENT_MAX_REQUESTS_PER_TASK,
        "taskDeadlineSeconds", EXCEL_AGENT_TASK_DEADLINE.toSeconds(),
        "requestReadTimeoutSeconds", LLM_READ_TIMEOUT.toSeconds(),
        "singleRowFailureMode", "issue"
    );
  }

  private void processTask(long taskId, String text, String languageHint) {
    try {
      RecognitionResult result = recognize(text, languageHint);
      String cleanedJson = objectMapper.writeValueAsString(result.cleanedRows());
      String issuesJson = objectMapper.writeValueAsString(result.issues());
      jdbcTemplate.update(
          """
          UPDATE cp_text_recognition_tasks
          SET status = 'SUCCEEDED',
              row_count = ?,
              valid_count = ?,
              issue_count = ?,
              cleaned_count = ?,
              cleaned_json = ?,
              issues_json = ?,
              agent_notes = ?,
              error_message = NULL,
              finished_at = ?
          WHERE id = ?
          """,
          result.rowCount(),
          result.validCount(),
          result.issueCount(),
          result.cleanedRows().size(),
          cleanedJson,
          issuesJson,
          result.agentNotes(),
          Timestamp.from(Instant.now()),
          taskId
      );
    } catch (Exception error) {
      jdbcTemplate.update(
          """
          UPDATE cp_text_recognition_tasks
          SET status = 'FAILED', error_message = ?, finished_at = ?
          WHERE id = ?
          """,
          trim(error.getMessage(), 1000),
          Timestamp.from(Instant.now()),
          taskId
      );
    }
  }

  @PreDestroy
  public void shutdownRecognitionExecutor() {
    recognitionExecutor.shutdownNow();
    excelAgentBatchExecutor.shutdownNow();
  }

  public List<Map<String, Object>> listTasks() {
    ensureTable();
    return jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, source_name, status, row_count, valid_count,
               issue_count, cleaned_count, agent_notes, error_message, created_at, updated_at, finished_at
        FROM cp_text_recognition_tasks
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """,
        (rs, rowNum) -> mapTaskRow(rs, false)
    );
  }

  public Map<String, Object> getTask(long id) {
    ensureTable();
    List<Map<String, Object>> rows = jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, source_name, status, row_count, valid_count,
               issue_count, cleaned_count, cleaned_json, issues_json, agent_notes, error_message,
               created_at, updated_at, finished_at
        FROM cp_text_recognition_tasks
        WHERE id = ?
        """,
        (rs, rowNum) -> mapTaskRow(rs, true),
        id
    );
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Text recognition task not found");
    }
    return rows.get(0);
  }

  public String cleanedJson(long id) {
    ensureTable();
    String json = jdbcTemplate.query(
        "SELECT cleaned_json FROM cp_text_recognition_tasks WHERE id = ?",
        (rs) -> rs.next() ? rs.getString("cleaned_json") : null,
        id
    );
    if (json == null) {
      getTask(id);
      return "[]";
    }
    return json;
  }

  public byte[] cleanedWorkbook(long id) {
    ensureTable();
    List<Map<String, Object>> rows = parseJsonList(cleanedJson(id));
    try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet("text-recognition");
      Row headerRow = sheet.createRow(0);
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        headerRow.createCell(i).setCellValue(OUTPUT_HEADERS.get(i));
      }
      for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
        Row sheetRow = sheet.createRow(rowIndex + 1);
        Map<String, Object> cargo = rows.get(rowIndex);
        for (int col = 0; col < OUTPUT_HEADERS.size(); col++) {
          Object value = cargo.get(OUTPUT_HEADERS.get(col));
          if (value instanceof Number number) {
            sheetRow.createCell(col).setCellValue(number.doubleValue());
          } else {
            sheetRow.createCell(col).setCellValue(value == null ? "" : String.valueOf(value));
          }
        }
      }
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        sheet.autoSizeColumn(i);
      }
      workbook.write(output);
      return output.toByteArray();
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to export text recognition workbook");
    }
  }

  private void ensureTable() {
    if (tableReady) return;
    synchronized (this) {
      if (tableReady) return;
      jdbcTemplate.execute(
          """
          CREATE TABLE IF NOT EXISTS cp_text_recognition_tasks (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            task_no VARCHAR(40) NOT NULL UNIQUE,
            source_channel ENUM('LOCAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
            source_name VARCHAR(255) NOT NULL DEFAULT 'pasted-text',
            status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
            raw_text LONGTEXT NOT NULL,
            row_count INT NOT NULL DEFAULT 0,
            valid_count INT NOT NULL DEFAULT 0,
            issue_count INT NOT NULL DEFAULT 0,
            cleaned_count INT NOT NULL DEFAULT 0,
            cleaned_json LONGTEXT NULL,
            issues_json LONGTEXT NULL,
            agent_notes TEXT NULL,
            error_message TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            finished_at DATETIME NULL,
            INDEX idx_cp_text_recognition_tasks_status_time (status, created_at),
            INDEX idx_cp_text_recognition_tasks_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
          """
      );
      tableReady = true;
    }
  }

  private long insertTask(TextRecognitionRequest request) {
    String taskNo = "TEXT-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT);
    String sourceName = cleanCell(request == null ? "" : request.sourceName());
    String source = normalizeSource(request == null ? "" : request.mode());
    String text = cleanCell(request == null ? "" : request.text());
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement ps = connection.prepareStatement(
          """
          INSERT INTO cp_text_recognition_tasks (task_no, source_channel, source_name, raw_text, status)
          VALUES (?, ?, ?, ?, 'PENDING')
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      ps.setString(1, taskNo);
      ps.setString(2, source);
      ps.setString(3, trim(sourceName.isBlank() ? "pasted-text" : sourceName, 255));
      ps.setString(4, text);
      return ps;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create text recognition task");
    }
    return key.longValue();
  }

  private RecognitionResult recognize(String text, String languageHint) {
    boolean formattedExcelAgentInput = isFormattedExcelAgentInput(text);
    boolean requiresPackagingSemantics = hasPalletSemanticSignals(text);

    LlmRuntimeSettings settings = llmSettingsService.runtimeSettings();
    if (settings.enabled()) {
      if (settings.hasApiKey()) {
        try {
          return formattedExcelAgentInput
              ? recognizeFormattedExcelInBatches(settings, text, languageHint)
              : recognizeWithOpenAiCompatible(settings, text, languageHint);
        } catch (Exception error) {
          if (formattedExcelAgentInput) {
            throw new IllegalStateException("Excel 格式化识别必须走 Agent，当前调用失败：" + trim(error.getMessage(), 180), error);
          }
          if (requiresPackagingSemantics) {
            throw new IllegalStateException("输入包含托盘/层级包装语义，禁止降级为固定规则解析；当前 Agent 调用失败：" + trim(error.getMessage(), 180), error);
          }
          RecognitionResult fallback = recognizeLocally(text);
          return fallback.withNotes("LLM 识别失败，已自动切换到规则兜底：" + trim(error.getMessage(), 160));
        }
      }
      if (formattedExcelAgentInput) {
        throw new IllegalStateException("Excel 格式化识别必须走 Agent，请先在后台配置 LLM API Key。");
      }
      if (requiresPackagingSemantics) {
        throw new IllegalStateException("输入包含托盘/层级包装语义，必须使用 Agent 识别，请先在后台配置 LLM API Key。");
      }
      RecognitionResult fallback = recognizeLocally(text);
      return fallback.withNotes("LLM 默认启用，但管理员尚未配置 API Key，已使用规则兜底。");
    }
    if (formattedExcelAgentInput) {
      throw new IllegalStateException("Excel 格式化识别必须走 Agent，请先在后台启用 LLM 识别。");
    }
    if (requiresPackagingSemantics) {
      throw new IllegalStateException("输入包含托盘/层级包装语义，必须使用 Agent 识别，请先在后台启用 LLM 识别。");
    }
    RecognitionResult fallback = recognizeLocally(text);
    return fallback.withNotes("管理员已关闭 LLM 识别，当前使用规则兜底。");
  }

  private RecognitionResult recognizeLocally(String text) {
    RecognitionResult packingListResult = recognizePackingListTable(text);
    return packingListResult == null ? recognizeWithRules(text) : packingListResult;
  }

  private boolean hasPalletSemanticSignals(String text) {
    String lower = cleanCell(text).toLowerCase(Locale.ROOT);
    return containsAny(
        lower,
        "托盘", "栈板", "木托", "每托", "每个托", "托盘尺寸", "托盘总重", "每层", "层码放",
        "pallet", "skid", "per pallet", "cartons/pallet", "ctns/pallet", "packages/pallet", "layers"
    );
  }

  private boolean isFormattedExcelAgentInput(String text) {
    return String.valueOf(text == null ? "" : text).contains("EXCEL_FORMATTED_TABLE_FOR_AGENT");
  }

  private RecognitionResult recognizeFormattedExcelInBatches(
      LlmRuntimeSettings settings,
      String text,
      String languageHint
  ) {
    List<ExcelAgentBatch> batches = buildExcelAgentBatches(text);
    if (batches.isEmpty()) {
      return withInputTruncationIssue(recognizeWithOpenAiCompatible(settings, text, languageHint), text);
    }

    AgentRequestBudget requestBudget = new AgentRequestBudget(EXCEL_AGENT_MAX_REQUESTS_PER_TASK, EXCEL_AGENT_TASK_DEADLINE);
    List<BatchRecognitionResult> batchResults = recognizeExcelBatchesConcurrently(
        settings,
        batches,
        languageHint,
        requestBudget
    );
    List<RecognitionResult> results = new ArrayList<>();
    int requestCount = 0;
    for (BatchRecognitionResult batchResult : batchResults) {
      results.addAll(batchResult.results());
      requestCount += batchResult.requestCount();
    }
    RecognitionResult merged = mergeExcelBatchResults(
        results,
        batches.stream().mapToInt(batch -> batch.targetRows().size()).sum(),
        requestCount,
        settings.model(),
        Math.min(excelAgentBatchConcurrency, batches.size())
    );
    return withInputTruncationIssue(merged, text);
  }

  private List<BatchRecognitionResult> recognizeExcelBatchesConcurrently(
      LlmRuntimeSettings settings,
      List<ExcelAgentBatch> batches,
      String languageHint,
      AgentRequestBudget requestBudget
  ) {
    if (batches.size() <= 1 || excelAgentBatchConcurrency <= 1) {
      List<BatchRecognitionResult> results = new ArrayList<>();
      for (ExcelAgentBatch batch : batches) {
        results.add(recognizeExcelBatchWithAdaptiveSplit(settings, batch, languageHint, requestBudget));
      }
      return results;
    }

    ExecutorCompletionService<IndexedBatchRecognitionResult> completionService =
        new ExecutorCompletionService<>(excelAgentBatchExecutor);
    List<Future<IndexedBatchRecognitionResult>> futures = new ArrayList<>();
    for (int index = 0; index < batches.size(); index++) {
      final int batchIndex = index;
      ExcelAgentBatch batch = batches.get(index);
      futures.add(completionService.submit(() -> new IndexedBatchRecognitionResult(
          batchIndex,
          recognizeExcelBatchWithAdaptiveSplit(settings, batch, languageHint, requestBudget)
      )));
    }

    List<BatchRecognitionResult> orderedResults = new ArrayList<>(java.util.Collections.nCopies(batches.size(), null));
    try {
      for (int completed = 0; completed < batches.size(); completed++) {
        IndexedBatchRecognitionResult indexedResult = completionService.take().get();
        orderedResults.set(indexedResult.index(), indexedResult.result());
      }
      return orderedResults;
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      cancelBatchFutures(futures);
      throw new IllegalStateException("Excel Agent 分批识别被中断，请重试。", error);
    } catch (ExecutionException error) {
      cancelBatchFutures(futures);
      Throwable cause = error.getCause();
      if (cause instanceof RuntimeException runtimeException) throw runtimeException;
      throw new IllegalStateException("Excel Agent 分批识别失败：" + trim(cause == null ? "unknown error" : cause.getMessage(), 180), cause);
    }
  }

  private void cancelBatchFutures(List<Future<IndexedBatchRecognitionResult>> futures) {
    futures.forEach(future -> future.cancel(true));
  }

  private RecognitionResult withInputTruncationIssue(RecognitionResult result, String text) {
    List<String> sourceLines = String.valueOf(text == null ? "" : text).lines().toList();
    List<String> markers = new ArrayList<>(sourceLines.stream()
        .map(this::cleanCell)
        .filter(line -> line.startsWith("TRUNCATED:")
            || line.startsWith("MERGED_RANGES_TRUNCATED:")
            || line.startsWith("COLUMNS_TRUNCATED:")
            || line.startsWith("CELL_VALUES_TRUNCATED:"))
        .limit(20)
        .toList());
    long oversizedTargetRows = sourceLines.stream()
        .map(this::cleanCell)
        .filter(line -> EXCEL_ROW_PATTERN.matcher(line).matches())
        .filter(line -> line.length() > EXCEL_AGENT_MAX_TARGET_ROW_CHARS)
        .count();
    if (oversizedTargetRows > 0) {
      markers.add("BACKEND_ROW_TRUNCATED: " + oversizedTargetRows + " source row(s) exceeded " + EXCEL_AGENT_MAX_TARGET_ROW_CHARS + " characters.");
    }
    if (markers.isEmpty()) return result;

    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("code", "INPUT_TRUNCATED");
    issue.put("rowNumber", 0);
    issue.put("text", trim(String.join("；", markers), 800));
    issue.put("errors", List.of("原始工作簿超出智能识别的行、列、合并区域或单元格长度上限；为避免漏货，当前结果不可直接视为完整导入清单。"));
    List<Map<String, Object>> issues = new ArrayList<>(result.issues());
    issues.add(issue);
    return new RecognitionResult(
        result.rowCount(),
        result.validCount(),
        issues.size(),
        result.cleanedRows(),
        issues,
        result.agentNotes() + "；输入内容存在截断，结果仅供复核，不应直接作为完整清单导入。"
    );
  }

  private BatchRecognitionResult recognizeExcelBatchWithAdaptiveSplit(
      LlmRuntimeSettings settings,
      ExcelAgentBatch batch,
      String languageHint,
      AgentRequestBudget requestBudget
  ) {
    if (!requestBudget.tryAcquire()) {
      return unresolvedExcelBatch(
          batch,
          "AGENT_REQUEST_BUDGET",
          "本次 Excel 识别已达到 Agent 请求或处理时间上限，未继续请求；相关行已保留供人工复核。",
          0
      );
    }
    try {
      return new BatchRecognitionResult(
          List.of(recognizeWithOpenAiCompatible(settings, renderExcelAgentBatch(batch, false), languageHint)),
          1
      );
    } catch (RuntimeException error) {
      if (!isRetryableAgentOutputFailure(error)) throw error;
      PartialBatchCoverageException coverageError = findCoverageError(error);
      if (coverageError != null) {
        List<ExcelAgentRow> missingRows = batch.targetRows().stream()
            .filter(row -> coverageError.missingRowNumbers().contains(row.rowNumber()))
            .toList();
        if (!missingRows.isEmpty() && missingRows.size() < batch.targetRows().size()) {
          BatchRecognitionResult retryResult = recognizeExcelBatchWithAdaptiveSplit(
              settings,
              batch.withTargetRows(new ArrayList<>(missingRows)),
              languageHint,
              requestBudget
          );
          List<RecognitionResult> merged = new ArrayList<>();
          merged.add(coverageError.partialResult());
          merged.addAll(retryResult.results());
          return new BatchRecognitionResult(merged, 1 + retryResult.requestCount());
        }
      }
      if (batch.targetRows().size() <= 1) {
        return recognizeSingleExcelRowWithCompactRetry(settings, batch, languageHint, error, requestBudget);
      }
      int midpoint = Math.max(1, batch.targetRows().size() / 2);
      ExcelAgentBatch left = batch.withTargetRows(new ArrayList<>(batch.targetRows().subList(0, midpoint)));
      ExcelAgentBatch right = batch.withTargetRows(new ArrayList<>(batch.targetRows().subList(midpoint, batch.targetRows().size())));
      BatchRecognitionResult leftResult = recognizeExcelBatchWithAdaptiveSplit(settings, left, languageHint, requestBudget);
      BatchRecognitionResult rightResult = recognizeExcelBatchWithAdaptiveSplit(settings, right, languageHint, requestBudget);
      List<RecognitionResult> merged = new ArrayList<>(leftResult.results());
      merged.addAll(rightResult.results());
      return new BatchRecognitionResult(merged, 1 + leftResult.requestCount() + rightResult.requestCount());
    }
  }

  private BatchRecognitionResult recognizeSingleExcelRowWithCompactRetry(
      LlmRuntimeSettings settings,
      ExcelAgentBatch batch,
      String languageHint,
      RuntimeException initialError,
      AgentRequestBudget requestBudget
  ) {
    if (!requestBudget.tryAcquire()) {
      return unresolvedExcelBatch(
          batch,
          "AGENT_REQUEST_BUDGET",
          "本次 Excel 识别已达到 Agent 请求或处理时间上限，单行紧凑重试未执行；相关行已保留供人工复核。",
          1
      );
    }
    try {
      RecognitionResult result = recognizeWithOpenAiCompatible(
          settings,
          renderExcelAgentBatch(batch, true),
          languageHint
      );
      return new BatchRecognitionResult(List.of(result), 2);
    } catch (RuntimeException retryError) {
      if (!isRetryableAgentOutputFailure(retryError)) throw retryError;
      ExcelAgentRow row = batch.targetRows().get(0);
      String detail = trim(firstNonBlank(retryError.getMessage(), initialError.getMessage()), 180);
      boolean coverageFailure = findCoverageError(retryError) != null;
      String issueCode = coverageFailure ? "AGENT_ROW_COVERAGE" : "AGENT_OUTPUT_LIMIT";
      String issueMessage = coverageFailure
          ? "Agent 单行紧凑重试后仍未明确返回该源行的处理状态，已保留原始行供人工复核。"
          : "Agent 单行紧凑重试后仍返回截断或无效 JSON，已保留原始行供人工复核。";
      Map<String, Object> issue = new LinkedHashMap<>(buildIssue(
          row.rowNumber(),
          trim(row.line(), 500),
          List.of(issueMessage + (detail.isBlank() ? "" : "详情：" + detail)),
          Map.of()
      ));
      issue.put("code", issueCode);
      RecognitionResult partial = new RecognitionResult(
          1,
          0,
          1,
          List.of(),
          List.of(issue),
          coverageFailure
              ? "该行经 Agent 单行紧凑重试后仍未被完整覆盖，已转入人工复核。"
              : "该行经 Agent 单行紧凑重试后仍超限，已转入人工复核。"
      );
      return new BatchRecognitionResult(List.of(partial), 2);
    }
  }

  private BatchRecognitionResult unresolvedExcelBatch(
      ExcelAgentBatch batch,
      String code,
      String message,
      int requestCount
  ) {
    List<Map<String, Object>> issues = new ArrayList<>();
    for (ExcelAgentRow row : batch.targetRows()) {
      Map<String, Object> issue = new LinkedHashMap<>(buildIssue(
          row.rowNumber(),
          trim(row.line(), 500),
          List.of(message),
          Map.of()
      ));
      issue.put("code", code);
      issues.add(issue);
    }
    RecognitionResult partial = new RecognitionResult(
        batch.targetRows().size(),
        0,
        issues.size(),
        List.of(),
        issues,
        message
    );
    return new BatchRecognitionResult(List.of(partial), requestCount);
  }

  private boolean isRetryableAgentOutputFailure(Throwable error) {
    Throwable current = error;
    while (current != null) {
      if (current instanceof RetryableAgentOutputException) return true;
      String message = cleanCell(current.getMessage()).toLowerCase(Locale.ROOT);
      if ((message.contains("finish_reason") && message.contains("length"))
          || message.contains("max_tokens")
          || message.contains("maximum output")
          || message.contains("max output")
          || message.contains("output length")
          || message.contains("context length")
          || message.contains("output limit")
          || message.contains("unexpected end-of-input")
          || message.contains("unexpected end of input")
          || message.contains("expected close marker")
          || message.contains("unterminated json")
          || message.contains("长度上限")
          || message.contains("输出超限")
          || message.contains("返回结果被截断")) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }

  private PartialBatchCoverageException findCoverageError(Throwable error) {
    Throwable current = error;
    while (current != null) {
      if (current instanceof PartialBatchCoverageException coverageError) return coverageError;
      current = current.getCause();
    }
    return null;
  }

  private RecognitionResult mergeExcelBatchResults(
      List<RecognitionResult> results,
      int sourceRowCount,
      int requestCount,
      String model,
      int parallelism
  ) {
    List<Map<String, Object>> cleanedRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    int validCount = 0;
    for (RecognitionResult result : results) {
      cleanedRows.addAll(result.cleanedRows());
      issues.addAll(result.issues());
      validCount += result.validCount();
    }
    List<Map<String, Object>> aggregatedRows = aggregateCargos(cleanedRows);
    String parallelNote = parallelism > 1 ? "，最多 " + parallelism + " 路并发" : "";
    String notes = requestCount > 1
        ? "Excel 已拆分为 " + requestCount + " 个 Agent 请求" + parallelNote + "并合并校验，避免单次输出超限（模型：" + model + "）。"
        : "Excel 已完成 Agent 识别与合并校验（模型：" + model + "）。";
    long outputLimitIssueCount = issues.stream()
        .filter(issue -> "AGENT_OUTPUT_LIMIT".equals(cleanCell(issue.get("code"))))
        .count();
    if (outputLimitIssueCount > 0) {
      notes += "；其中 " + outputLimitIssueCount + " 行经单行紧凑重试后仍超限，已保留原文并转入人工复核，其余行正常合并。";
    }
    long coverageIssueCount = issues.stream()
        .filter(issue -> "AGENT_ROW_COVERAGE".equals(cleanCell(issue.get("code"))))
        .count();
    if (coverageIssueCount > 0) {
      notes += "；其中 " + coverageIssueCount + " 行未被 Agent 明确覆盖，已保留原文并转入人工复核。";
    }
    long requestBudgetIssueCount = issues.stream()
        .filter(issue -> "AGENT_REQUEST_BUDGET".equals(cleanCell(issue.get("code"))))
        .count();
    if (requestBudgetIssueCount > 0) {
      notes += "；为避免异常响应造成无限重试，达到任务请求或处理时间上限后停止追加请求，剩余 " + requestBudgetIssueCount + " 行已转入人工复核。";
    }
    return new RecognitionResult(sourceRowCount, validCount, issues.size(), aggregatedRows, issues, notes);
  }

  private List<ExcelAgentBatch> buildExcelAgentBatches(String text) {
    List<String> preamble = new ArrayList<>();
    List<ExcelSheetSection> sections = new ArrayList<>();
    ExcelSheetSectionBuilder current = null;
    for (String rawLine : String.valueOf(text == null ? "" : text).lines().toList()) {
      String line = cleanCell(rawLine);
      if (line.startsWith("SHEET ")) {
        if (current != null) sections.add(current.build());
        current = new ExcelSheetSectionBuilder(line);
        continue;
      }
      if (current == null) {
        if (!line.isBlank()) preamble.add(line);
        continue;
      }
      Matcher rowMatcher = EXCEL_ROW_PATTERN.matcher(line);
      if (rowMatcher.matches()) {
        current.rows.add(new ExcelAgentRow(intValue(rowMatcher.group(1), 0), line));
      } else if (!line.isBlank() && !line.startsWith("TRUNCATED:")) {
        current.metadata.add(line);
        Matcher headerMatcher = EXCEL_HEADER_ROW_PATTERN.matcher(line);
        if (headerMatcher.matches()) current.headerRowNumber = intValue(headerMatcher.group(1), 1);
      }
    }
    if (current != null) sections.add(current.build());

    List<StructuredSheetSelection> structuredSelections = sections.stream()
        .map(this::structuredSheetSelection)
        .toList();
    boolean hasCompleteCargoTable = structuredSelections.stream()
        .anyMatch(selection -> selection.completeCargoTable() && !selection.cargoRows().isEmpty());
    Map<ExcelSheetSection, List<ExcelAgentRow>> selectedRows = new LinkedHashMap<>();
    for (StructuredSheetSelection selection : structuredSelections) {
      List<ExcelAgentRow> candidateAnchorRows = finalPackageCandidateAnchorRows(selection.section());
      if (!candidateAnchorRows.isEmpty()) {
        selectedRows.put(selection.section(), candidateAnchorRows);
      } else if (selection.completeCargoTable() && !selection.cargoRows().isEmpty()) {
        selectedRows.put(selection.section(), selection.cargoRows());
      } else if (!hasCompleteCargoTable || !selection.summaryTable()) {
        selectedRows.put(selection.section(), selection.section().rows());
      }
    }

    List<ExcelSheetSection> selectedSections = new ArrayList<>(selectedRows.keySet());
    List<ExcelAgentBatch> batches = new ArrayList<>();
    for (ExcelSheetSection section : selectedSections) {
      List<ExcelAgentRow> targetRows = selectedRows.getOrDefault(section, section.rows());
      int start = 0;
      while (start < targetRows.size()) {
        int end = start;
        int targetChars = 0;
        while (end < targetRows.size() && end - start < EXCEL_AGENT_BATCH_MAX_ROWS) {
          int nextChars = targetChars + targetRows.get(end).line().length();
          if (end > start && nextChars > EXCEL_AGENT_BATCH_MAX_TARGET_CHARS) break;
          targetChars = nextChars;
          end += 1;
        }
        if (end <= start) end = start + 1;
        batches.add(new ExcelAgentBatch(
            List.copyOf(preamble),
            section,
            new ArrayList<>(targetRows.subList(start, end))
        ));
        start = end;
      }
    }
    return batches;
  }

  private List<ExcelAgentRow> finalPackageCandidateAnchorRows(ExcelSheetSection section) {
    Set<Integer> anchorRows = finalPackageCandidates(section.metadata()).stream()
        .map(FinalPackageCandidate::sourceRowNumber)
        .filter(rowNumber -> rowNumber > 0)
        .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    if (anchorRows.isEmpty()) return List.of();
    return section.rows().stream()
        .filter(row -> anchorRows.contains(row.rowNumber()))
        .toList();
  }

  private List<FinalPackageCandidate> finalPackageCandidates(List<String> lines) {
    List<FinalPackageCandidate> candidates = new ArrayList<>();
    for (String line : lines) {
      FinalPackageCandidate candidate = parseFinalPackageCandidate(line);
      if (candidate != null) candidates.add(candidate);
    }
    return candidates;
  }

  private List<FinalPackageCandidate> finalPackageCandidates(String rawText) {
    return finalPackageCandidates(String.valueOf(rawText == null ? "" : rawText).lines().toList());
  }

  private FinalPackageCandidate parseFinalPackageCandidate(String line) {
    String metadataLine = cleanCell(line);
    Matcher matcher = FINAL_PACKAGE_CANDIDATE_PATTERN.matcher(metadataLine);
    if (!matcher.matches()) return null;
    try {
      Map<String, Object> values = objectMapper.readValue(
          matcher.group(1),
          new TypeReference<Map<String, Object>>() {}
      );
      int anchorRowNumber = intValue(values.get("sourceRowNumber"), 0);
      Object sourceRowsValue = values.containsKey("sourceRowNumbers")
          ? values.get("sourceRowNumbers")
          : values.get("sourceRows");
      List<Integer> sourceRowNumbers = new ArrayList<>(intSet(sourceRowsValue));
      if (sourceRowNumbers.isEmpty()) {
        Matcher rangeMatcher = EXCEL_SOURCE_RANGE_PATTERN.matcher(cleanCell(values.get("sourceRange")));
        if (rangeMatcher.matches()) {
          int start = intValue(rangeMatcher.group(1), 0);
          int end = intValue(rangeMatcher.group(2), 0);
          if (start > 0 && end >= start) {
            for (int rowNumber = start; rowNumber <= end; rowNumber++) sourceRowNumbers.add(rowNumber);
          }
        }
      }
      if (anchorRowNumber <= 0 && !sourceRowNumbers.isEmpty()) anchorRowNumber = sourceRowNumbers.get(0);
      if (anchorRowNumber <= 0) return null;
      if (!sourceRowNumbers.contains(anchorRowNumber)) sourceRowNumbers.add(0, anchorRowNumber);
      return new FinalPackageCandidate(
          anchorRowNumber,
          List.copyOf(sourceRowNumbers),
          new LinkedHashMap<>(values),
          metadataLine
      );
    } catch (JsonProcessingException error) {
      return null;
    }
  }

  private StructuredSheetSelection structuredSheetSelection(ExcelSheetSection section) {
    ExcelAgentRow headerRow = section.rows().stream()
        .filter(row -> row.rowNumber() == section.headerRowNumber())
        .findFirst()
        .orElse(null);
    if (headerRow == null) return new StructuredSheetSelection(section, false, false, List.of());
    Map<String, String> headers = excelRowCells(headerRow.line());
    if (headers.isEmpty()) return new StructuredSheetSelection(section, false, false, List.of());

    Set<String> identityColumns = headerColumns(headers, "identity");
    boolean hasDimensions = hasStructuredDimensionHeaders(headers);
    boolean hasWeight = !headerColumns(headers, "weight").isEmpty();
    boolean completeCargoTable = !identityColumns.isEmpty()
        && hasDimensions
        && !headerColumns(headers, "quantity").isEmpty()
        && hasWeight;
    boolean summaryTable = !hasDimensions && !hasWeight
        && headers.values().stream().filter(this::isSummaryRelationshipHeader).count() >= 2;
    if (!completeCargoTable) {
      return new StructuredSheetSelection(section, false, summaryTable, List.of());
    }

    List<ExcelAgentRow> cargoRows = section.rows().stream()
        .filter(row -> row.rowNumber() > section.headerRowNumber())
        .filter(row -> isStructuredCargoDataRow(row, identityColumns))
        .toList();
    return new StructuredSheetSelection(section, true, false, cargoRows);
  }

  private boolean isSummaryRelationshipHeader(String value) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT).replaceAll("[\\s_()（）\\-:/\\\\]+", "");
    return containsAny(header,
        "包装组", "原始散件", "每托内装", "每箱内装", "最终托盘", "压缩倍数", "包装关系", "约束",
        "packinggroup", "loosepieces", "piecesperpallet", "piecesperpackage", "finalpallet", "compressionratio");
  }

  private boolean hasStructuredDimensionHeaders(Map<String, String> headers) {
    if (!headerColumns(headers, "combinedDimension").isEmpty()) return true;
    return !headerColumns(headers, "length").isEmpty()
        && !headerColumns(headers, "width").isEmpty()
        && !headerColumns(headers, "height").isEmpty();
  }

  private boolean isStructuredCargoDataRow(ExcelAgentRow row, Set<String> identityColumns) {
    Map<String, String> cells = excelRowCells(row.line());
    for (String column : identityColumns) {
      String value = cleanCell(cells.get(column));
      if (value.isBlank()) continue;
      String normalized = value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
      if (!Set.of("合计", "总计", "小计", "汇总", "total", "subtotal", "summary").contains(normalized)) {
        return true;
      }
    }
    return false;
  }

  private Set<String> headerColumns(Map<String, String> headers, String role) {
    Set<String> columns = new LinkedHashSet<>();
    for (Map.Entry<String, String> entry : headers.entrySet()) {
      if (matchesHeaderRole(entry.getValue(), role)) columns.add(entry.getKey());
    }
    return columns;
  }

  private boolean matchesHeaderRole(String value, String role) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT).replaceAll("[\\s_()（）\\-:/\\\\]+", "");
    if (header.isBlank()) return false;
    return switch (role) {
      case "identity" -> containsAny(header,
          "货物名称", "货物品名", "品名", "产品名称", "物料名称", "cargo", "cargoname", "goodsname", "productname",
          "托盘编号", "栈板编号", "货物编号", "物料编号", "sku", "cargoid", "palletid");
      case "name" -> containsAny(header,
          "货物名称", "货物品名", "品名", "产品名称", "物料名称", "cargoname", "goodsname", "productname");
      case "sku" -> containsAny(header,
          "托盘编号", "栈板编号", "货物编号", "物料编号", "sku", "cargoid", "palletid");
      case "model" -> containsAny(header, "型号规格", "规格型号", "产品型号", "货物型号", "model", "spec")
          || header.equals("型号") || header.equals("规格");
      case "combinedDimension" -> !containsAny(header, "体积", "volume")
          && (containsAny(header, "尺寸", "长宽高", "size", "dimension", "l×w×h", "l*w*h")
              || header.equals("外廓") || header.equals("装货后外廓"));
      case "length" -> containsAny(header, "外廓长", "托盘长", "栈板长", "木托长", "单箱长", "纸箱长", "包装箱长", "长度", "length")
          || header.equals("长") || header.equals("l");
      case "width" -> containsAny(header, "外廓宽", "托盘宽", "栈板宽", "木托宽", "单箱宽", "纸箱宽", "包装箱宽", "宽度", "width")
          || header.equals("宽") || header.equals("w");
      case "height" -> containsAny(header, "外廓高", "托盘高", "栈板高", "木托高", "单箱高", "纸箱高", "包装箱高", "高度", "height")
          || header.equals("高") || header.equals("h");
      case "quantity" -> !containsAny(header, "原始", "散件", "内装", "每托", "每箱", "order")
          && (containsAny(header, "最终搬运单元数量", "最终托盘", "托盘数量", "栈板数量", "托数", "箱数", "packagequantity", "palletquantity")
              || header.equals("数量") || header.equals("qty") || header.equals("quantity"));
      case "weight" -> !containsAny(header, "总重量", "总重", "合计", "自重", "皮重", "净重", "tare", "netweight")
          && (containsAny(header, "单托总毛重", "单箱毛重", "单件重量", "单位重量", "单重", "unitweight", "grossweightper", "weightkg")
              || header.equals("毛重") || header.equals("重量"));
      case "type" -> containsAny(header, "货物类型", "包装类型", "搬运单元类型", "cargotype", "packagetype") || header.equals("类型");
      case "nonStack" -> containsAny(header, "不可重压", "禁止重压", "不可堆叠", "nonstack");
      case "keepUpright" -> containsAny(header, "保持朝上", "不可倒置", "keepupright", "upright");
      case "remark" -> containsAny(header, "包装关系", "装箱备注", "备注", "说明", "remark", "note");
      case "originalQuantity" -> containsAny(header, "原始散件数量", "原始件数", "散件总数", "loosequantity", "piecequantity");
      case "piecesPerPackage" -> containsAny(header, "每托内装件数", "每箱内装件数", "每托装", "每箱装", "piecesperpallet", "piecesperpackage");
      case "tareWeight" -> containsAny(header, "托盘木箱自重", "托盘自重", "木箱自重", "包装自重", "皮重", "tareweight");
      case "innerUnitWeight" -> containsAny(header, "内装单件净重", "散件单重", "内件单重", "innerunitweight", "piecenetweight");
      default -> false;
    };
  }

  private String renderExcelAgentBatch(ExcelAgentBatch batch, boolean compactSingleRowRetry) {
    List<ExcelAgentRow> allRows = batch.section().rows();
    List<ExcelAgentRow> targetRows = batch.targetRows();
    Set<Integer> targetRowNumbers = targetRows.stream()
        .map(ExcelAgentRow::rowNumber)
        .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    List<FinalPackageCandidate> batchCandidates = finalPackageCandidates(batch.section().metadata()).stream()
        .filter(candidate -> targetRowNumbers.contains(candidate.sourceRowNumber()))
        .toList();
    Set<Integer> candidateContextRowNumbers = batchCandidates.stream()
        .flatMap(candidate -> candidate.sourceRowNumbers().stream())
        .filter(rowNumber -> !targetRowNumbers.contains(rowNumber))
        .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    int firstTargetIndex = allRows.indexOf(targetRows.get(0));
    int lastTargetIndex = allRows.indexOf(targetRows.get(targetRows.size() - 1));
    List<ExcelAgentRow> contextRows = new ArrayList<>();
    int headerContextEnd = Math.max(1, batch.section().headerRowNumber() + 2);
    for (ExcelAgentRow row : allRows) {
      if (row.rowNumber() <= headerContextEnd && !targetRows.contains(row)) contextRows.add(row);
    }
    for (int index = Math.max(0, firstTargetIndex - EXCEL_AGENT_PREVIOUS_CONTEXT_ROWS); index < firstTargetIndex; index++) {
      ExcelAgentRow row = allRows.get(index);
      if (!targetRows.contains(row) && !contextRows.contains(row)) contextRows.add(row);
    }
    for (int index = lastTargetIndex + 1; index <= Math.min(allRows.size() - 1, lastTargetIndex + EXCEL_AGENT_NEXT_CONTEXT_ROWS); index++) {
      ExcelAgentRow row = allRows.get(index);
      if (!targetRows.contains(row) && !contextRows.contains(row)) contextRows.add(row);
    }
    for (ExcelAgentRow row : allRows) {
      if (candidateContextRowNumbers.contains(row.rowNumber())
          && !targetRows.contains(row)
          && !contextRows.contains(row)) {
        contextRows.add(row);
      }
    }

    if (compactSingleRowRetry) {
      contextRows.removeIf(row -> row.rowNumber() > headerContextEnd
          && !candidateContextRowNumbers.contains(row.rowNumber()));
    }

    List<String> lines = new ArrayList<>();
    if (!compactSingleRowRetry) {
      appendLimitedAgentLines(lines, batch.preamble(), EXCEL_AGENT_MAX_PREAMBLE_CHARS, 1_000, "PREAMBLE_TRUNCATED");
    }
    lines.add("EXCEL_AGENT_BATCH");
    if (compactSingleRowRetry) {
      lines.add("EXCEL_AGENT_SINGLE_ROW_COMPACT_RETRY");
    }
    lines.add("BATCH_RULE: Extract and emit cargo only for BATCH_TARGET_ROWS. BATCH_CONTEXT_ONLY rows are layout/header context; never emit cargo or issues for context-only rows.");
    lines.add("BATCH_RULE: Every source row number listed in BATCH_TARGET_SOURCE_ROWS must appear at least once as rows[].sourceRowNumber, issues[].sourceRowNumber, or skippedSourceRowNumbers. A cargo row may also have a review issue. skippedSourceRowNumbers is mutually exclusive with rows/issues and is only for headers, totals, and non-cargo rows.");
    lines.add("BATCH_RULE: Keep JSON compact. Do not repeat full source rows in remarks or notes. Omit optional packageInfo when it is not needed.");
    lines.add("BATCH_RULE: Emit at most one rows item and at most one issues item per target row. Keep sourceText and remark under 120 characters and notes under 160 characters.");
    lines.add(batch.section().sheetLine());
    List<String> metadata = (compactSingleRowRetry
        ? batch.section().metadata().stream()
            .filter(line -> line.startsWith("DETECTED_HEADER_ROW:") || line.startsWith("MERGED_RANGES:"))
            .toList()
        : batch.section().metadata()).stream()
            .filter(line -> !FINAL_PACKAGE_CANDIDATE_PATTERN.matcher(line).matches())
            .toList();
    appendLimitedAgentLines(lines, metadata, EXCEL_AGENT_MAX_METADATA_CHARS, 1_600, "METADATA_TRUNCATED");
    batchCandidates.forEach(candidate -> lines.add(candidate.metadataLine()));
    if (!contextRows.isEmpty()) {
      lines.add("BATCH_CONTEXT_ONLY:");
      contextRows.forEach(row -> lines.add(trimAgentLine(row.line(), EXCEL_AGENT_MAX_CONTEXT_ROW_CHARS)));
    }
    lines.add("BATCH_TARGET_ROWS:");
    lines.add("BATCH_TARGET_SOURCE_ROWS: " + targetRows.stream().map(row -> String.valueOf(row.rowNumber())).reduce((left, right) -> left + "," + right).orElse(""));
    targetRows.forEach(row -> lines.add(trimAgentLine(row.line(), EXCEL_AGENT_MAX_TARGET_ROW_CHARS)));
    return String.join("\n", lines);
  }

  private void appendLimitedAgentLines(
      List<String> destination,
      List<String> source,
      int totalCharLimit,
      int lineCharLimit,
      String truncationMarker
  ) {
    int emittedChars = 0;
    int emittedLines = 0;
    for (String rawLine : source) {
      if (emittedChars >= totalCharLimit) break;
      String line = trimAgentLine(rawLine, Math.min(lineCharLimit, totalCharLimit - emittedChars));
      if (line.isBlank()) continue;
      destination.add(line);
      emittedChars += line.length();
      emittedLines += 1;
    }
    if (emittedLines < source.size()) destination.add(truncationMarker + ": omitted " + (source.size() - emittedLines) + " line(s).");
  }

  private String trimAgentLine(String value, int limit) {
    String text = cleanCell(value);
    if (limit <= 0 || text.length() <= limit) return text;
    int headLength = Math.max(1, (limit * 3) / 4);
    int tailLength = Math.max(0, limit - headLength - 20);
    return text.substring(0, headLength) + " …[truncated]… " + text.substring(text.length() - tailLength);
  }

  private int countFormattedExcelRows(String text) {
    return (int) String.valueOf(text == null ? "" : text).lines()
        .map(this::cleanCell)
        .filter(line -> EXCEL_ROW_PATTERN.matcher(line).matches())
        .count();
  }

  private RecognitionResult recognizeWithOpenAiCompatible(LlmRuntimeSettings settings, String text, String languageHint) {
    String content = callOpenAiCompatibleChat(settings, text, languageHint);
    Map<String, Object> payload;
    try {
      payload = objectMapper.readValue(extractJsonObject(content), new TypeReference<Map<String, Object>>() {});
    } catch (JsonProcessingException error) {
      throw new RetryableAgentOutputException(
          "Agent 返回的 JSON 不完整或格式错误，请重试；如果是大表，请减少无关工作表或空白行。详情：" + trim(error.getOriginalMessage(), 160),
          error
      );
    }
    List<Map<String, Object>> rawRows = mapList(payload.get("rows"));
    List<Map<String, Object>> modelIssues = mapList(payload.get("issues"));
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    Set<Integer> targetSourceRows = batchTargetSourceRows(text);
    Set<Integer> coveredSourceRows = new LinkedHashSet<>();
    Set<Integer> cargoSourceRows = new LinkedHashSet<>();
    Set<Integer> issueSourceRows = new LinkedHashSet<>();
    Set<Integer> palletMissingReliableSourceRows = new LinkedHashSet<>();
    Set<String> palletMissingSourceTexts = new LinkedHashSet<>();
    Set<String> palletMissingUnreliableSourceTexts = new LinkedHashSet<>();
    int correctedWeightCount = 0;

    int rowNumber = 0;
    for (Map<String, Object> rawRow : rawRows) {
      int modelRowNumber = modelSourceRowNumber(rawRow);
      int sourceRowNumber;
      if (targetSourceRows.isEmpty()) {
        sourceRowNumber = modelRowNumber > 0 ? modelRowNumber : ++rowNumber;
        rowNumber = Math.max(rowNumber, sourceRowNumber);
      } else {
        sourceRowNumber = modelRowNumber;
      }
      if (!targetSourceRows.isEmpty() && !targetSourceRows.contains(sourceRowNumber)) continue;
      if (!targetSourceRows.isEmpty() && !cargoSourceRows.add(sourceRowNumber)) continue;
      if (targetSourceRows.isEmpty()) cargoSourceRows.add(sourceRowNumber);
      if (!targetSourceRows.isEmpty()) coveredSourceRows.add(sourceRowNumber);
      String normalizedSourceText = weightCorrectionSourceText(rawRow, sourceRowNumber, text);
      applyExplicitSourceFields(rawRow, text, sourceRowNumber);
      Map<Long, Double> rowWeightCorrections = thousandSeparatedWeightCorrections(normalizedSourceText);
      if (applyThousandSeparatedWeightCorrection(rawRow, rowWeightCorrections)) correctedWeightCount++;
      ParsedCargo parsed = normalizeCargo(rawRow, sourceRowNumber, normalizedSourceText);
      DimensionParts explicitPalletDimensions = explicitPalletDimensionsFromSource(text, sourceRowNumber);
      if (explicitPalletDimensions != null && isPalletHandlingUnit(parsed.cargo())) {
        applyExplicitPalletDimensions(rawRow, explicitPalletDimensions);
        parsed = normalizeCargo(rawRow, sourceRowNumber, normalizedSourceText);
      } else if (palletDimensionsAreOnlyInnerPackageSource(text, sourceRowNumber, parsed.cargo())) {
        markPalletDimensionsMissing(
            rawRow,
            innerPackageDimensionsFromSource(text, sourceRowNumber)
        );
        parsed = normalizeCargo(rawRow, sourceRowNumber, normalizedSourceText);
      }
      if (palletDimensionsMissing(rawRow, parsed.cargo())) {
        List<String> palletErrors = new ArrayList<>();
        palletErrors.add("最终搬运单元被识别为托盘，但原始资料未提供明确的托盘装货后外廓长、宽、高。请由用户补录最终托盘尺寸后再导入。");
        parsed.errors().stream()
            .filter(error -> !palletErrors.contains(error))
            .forEach(palletErrors::add);
        Map<String, Object> issue = new LinkedHashMap<>(buildIssue(
            sourceRowNumber,
            parsed.text(),
            palletErrors,
            parsed.cargo()
        ));
        issue.put("code", "PALLET_DIMENSIONS_MISSING");
        issues.add(issue);
        String sourceSignature = normalizedSourceSignature(parsed.text());
        if (modelRowNumber > 0) {
          palletMissingReliableSourceRows.add(sourceRowNumber);
        } else if (!sourceSignature.isBlank()) {
          palletMissingUnreliableSourceTexts.add(sourceSignature);
        }
        if (!sourceSignature.isBlank()) palletMissingSourceTexts.add(sourceSignature);
      } else if (parsed.errors().isEmpty()) {
        validRows.add(parsed.cargo());
        List<String> reviewWarnings = reviewWarnings(parsed.cargo(), parsed.text());
        if (!reviewWarnings.isEmpty()) {
          issues.add(buildIssue(sourceRowNumber, parsed.text(), reviewWarnings, parsed.cargo()));
        }
      } else {
        issues.add(buildIssue(sourceRowNumber, parsed.text(), parsed.errors(), parsed.cargo()));
      }
    }

    for (Map<String, Object> modelIssue : modelIssues) {
      int modelIssueRowNumber = modelSourceRowNumber(modelIssue);
      int issueRowNumber;
      if (targetSourceRows.isEmpty()) {
        issueRowNumber = modelIssueRowNumber > 0 ? modelIssueRowNumber : ++rowNumber;
        rowNumber = Math.max(rowNumber, issueRowNumber);
      } else {
        issueRowNumber = modelIssueRowNumber;
      }
      if (!targetSourceRows.isEmpty() && !targetSourceRows.contains(issueRowNumber)) continue;
      String issueCode = cleanCell(modelIssue.get("code"));
      String issueText = weightCorrectionSourceText(modelIssue, issueRowNumber, text);
      List<String> errors = stringList(modelIssue.get("errors"));
      String modelIssueMessage = cleanCell(modelIssue.get("message"));
      if (errors.isEmpty()) {
        errors = List.of(modelIssueMessage.isBlank() ? "模型未能确认该行货物规格" : modelIssueMessage);
      }
      if (describesPalletDimensionsMissing(issueCode, errors, modelIssueMessage)) {
        issueCode = "PALLET_DIMENSIONS_MISSING";
      }
      if ("PALLET_DIMENSIONS_MISSING".equals(issueCode)
          && explicitPalletDimensionsFromSource(text, issueRowNumber) != null) {
        if (cargoSourceRows.contains(issueRowNumber)) continue;
        Map<String, Object> recoveredInput = modelIssueCargo(modelIssue);
        applyExplicitSourceFields(recoveredInput, text, issueRowNumber);
        Map<Long, Double> recoveredWeightCorrections = thousandSeparatedWeightCorrections(issueText);
        if (applyThousandSeparatedWeightCorrection(recoveredInput, recoveredWeightCorrections)) {
          correctedWeightCount++;
        }
        ParsedCargo recovered = normalizeCargo(recoveredInput, issueRowNumber, issueText);
        if (recovered.errors().isEmpty() && !palletDimensionsMissing(recoveredInput, recovered.cargo())) {
          cargoSourceRows.add(issueRowNumber);
          if (!targetSourceRows.isEmpty()) coveredSourceRows.add(issueRowNumber);
          validRows.add(recovered.cargo());
          List<String> reviewWarnings = reviewWarnings(recovered.cargo(), recovered.text());
          if (!reviewWarnings.isEmpty()) {
            issues.add(buildIssue(issueRowNumber, recovered.text(), reviewWarnings, recovered.cargo()));
          }
          continue;
        }
      }
      String issueSourceSignature = normalizedSourceSignature(issueText);
      boolean issueHasReliableSourceRow = modelIssueRowNumber > 0;
      boolean sameReliableSourceRow = issueHasReliableSourceRow
          && palletMissingReliableSourceRows.contains(issueRowNumber);
      boolean signatureFallbackMatch = !issueSourceSignature.isBlank()
          && palletMissingSourceTexts.contains(issueSourceSignature)
          && (!issueHasReliableSourceRow || palletMissingUnreliableSourceTexts.contains(issueSourceSignature));
      if ("PALLET_DIMENSIONS_MISSING".equals(issueCode)
          && (sameReliableSourceRow || signatureFallbackMatch)) {
        continue;
      }
      if (!targetSourceRows.isEmpty() && !issueSourceRows.add(issueRowNumber)) continue;
      if (targetSourceRows.isEmpty()) issueSourceRows.add(issueRowNumber);
      if (!targetSourceRows.isEmpty()) coveredSourceRows.add(issueRowNumber);
      Map<String, Object> issueCargoInput = modelIssueCargo(modelIssue);
      if ("PALLET_DIMENSIONS_MISSING".equals(issueCode)) {
        if (issueCargoInput.isEmpty()) {
          throw new RetryableAgentOutputException("Agent 仅返回托盘尺寸缺失问题，但没有返回可补录的托盘数量、重量和包装层级。正在重试该批次。");
        }
        issueCargoInput.put("palletDimensionsMissing", true);
        if (cleanCell(issueCargoInput.get("type")).isBlank()) issueCargoInput.put("type", "pallet");
      }
      applyExplicitSourceFields(issueCargoInput, text, issueRowNumber);
      Map<Long, Double> issueWeightCorrections = thousandSeparatedWeightCorrections(issueText);
      if (applyThousandSeparatedWeightCorrection(issueCargoInput, issueWeightCorrections)) correctedWeightCount++;
      Map<String, Object> issueCargo = issueCargoInput.isEmpty()
          ? Map.of()
          : normalizeCargo(issueCargoInput, issueRowNumber, issueText).cargo();
      if ("PALLET_DIMENSIONS_MISSING".equals(issueCode)
          && (cleanCell(issueCargo.get("name")).isBlank() || intValue(issueCargo.get("quantity"), 0) <= 0)) {
        throw new RetryableAgentOutputException("Agent 返回的缺尺寸托盘候选缺少货物名称或托盘数量。正在重试该批次。");
      }
      Map<String, Object> issue = new LinkedHashMap<>(buildIssue(issueRowNumber, issueText, errors, issueCargo));
      if (!issueCode.isBlank()) issue.put("code", issueCode);
      issues.add(issue);
      if ("PALLET_DIMENSIONS_MISSING".equals(issueCode)) {
        if (issueHasReliableSourceRow) {
          palletMissingReliableSourceRows.add(issueRowNumber);
        } else if (!issueSourceSignature.isBlank()) {
          palletMissingUnreliableSourceTexts.add(issueSourceSignature);
        }
        if (!issueSourceSignature.isBlank()) palletMissingSourceTexts.add(issueSourceSignature);
      }
    }

    if (!targetSourceRows.isEmpty()) {
      for (Integer skippedRowNumber : intSet(payload.get("skippedSourceRowNumbers"))) {
        if (targetSourceRows.contains(skippedRowNumber)
            && !cargoSourceRows.contains(skippedRowNumber)
            && !issueSourceRows.contains(skippedRowNumber)) {
          coveredSourceRows.add(skippedRowNumber);
        }
      }
    } else if (validRows.isEmpty() && issues.isEmpty()) {
      throw new AgentProtocolException("Agent returned no recognizable rows or issues");
    }

    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = cleanCell(payload.get("notes"));
    if (notes.isBlank()) {
      notes = "LLM 已完成文本结构化抽取，并按系统字段校验、聚合同名同规格货物。";
    }
    if (correctedWeightCount > 0) {
      notes += "；已按原文千分位重量修正 " + correctedWeightCount + " 条（如 29.200 kgs = 29200 kg）。";
    }
    notes = notes + "（模型：" + settings.model() + "）";
    RecognitionResult result = new RecognitionResult(
        targetSourceRows.isEmpty()
            ? Math.max(rawRows.size() + modelIssues.size(), textRows(text).size())
            : coveredSourceRows.size(),
        validRows.size(),
        issues.size(),
        cleanedRows,
        issues,
        notes
    );
    if (!targetSourceRows.isEmpty()) {
      Set<Integer> missingSourceRows = new LinkedHashSet<>(targetSourceRows);
      missingSourceRows.removeAll(coveredSourceRows);
      if (!missingSourceRows.isEmpty()) {
        throw new PartialBatchCoverageException(result, missingSourceRows);
      }
    }
    return result;
  }

  private Set<Integer> batchTargetSourceRows(String text) {
    Set<Integer> result = new LinkedHashSet<>();
    boolean inTargetRows = false;
    for (String rawLine : String.valueOf(text == null ? "" : text).lines().toList()) {
      String line = cleanCell(rawLine);
      if (line.equals("BATCH_TARGET_ROWS:")) {
        inTargetRows = true;
        continue;
      }
      if (!inTargetRows) continue;
      Matcher matcher = EXCEL_ROW_PATTERN.matcher(line);
      if (matcher.matches()) result.add(intValue(matcher.group(1), 0));
    }
    return result;
  }

  private int modelSourceRowNumber(Map<String, Object> row) {
    int explicit = intValue(row.get("sourceRowNumber"), 0);
    if (explicit > 0) return explicit;
    String sourceText = cleanCell(firstNonBlank(row.get("sourceText"), row.get("text")));
    Matcher matcher = EXCEL_SOURCE_ROW_PATTERN.matcher(sourceText);
    if (matcher.find()) return intValue(matcher.group(1), 0);
    return intValue(row.get("rowNumber"), 0);
  }

  private Set<Integer> intSet(Object value) {
    Set<Integer> result = new LinkedHashSet<>();
    if (value instanceof List<?> list) {
      for (Object item : list) {
        int number = intValue(item, 0);
        if (number > 0) result.add(number);
      }
    } else {
      Matcher matcher = Pattern.compile("\\d+").matcher(cleanCell(value));
      while (matcher.find()) result.add(intValue(matcher.group(), 0));
    }
    return result;
  }

  private String callOpenAiCompatibleChat(LlmRuntimeSettings settings, String text, String languageHint) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(settings.apiKey());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("model", settings.model());
    body.put("temperature", 0.1);
    body.put("stream", false);
    body.put("max_tokens", 8192);
    body.put("response_format", Map.of("type", "json_object"));
    body.put("messages", List.of(
        Map.of("role", "system", "content", systemPrompt()),
        Map.of("role", "user", "content", userPrompt(text, languageHint))
    ));
    if (settings.baseUrl().toLowerCase(Locale.ROOT).contains("deepseek.com")) {
      body.put("thinking", Map.of("type", "disabled"));
    }

    for (int attempt = 1; attempt <= LLM_MAX_TRANSIENT_ATTEMPTS; attempt++) {
      try {
        ResponseEntity<Map> response = restTemplate.postForEntity(
            URI.create(chatCompletionsUrl(settings.baseUrl())),
            new HttpEntity<>(body, headers),
            Map.class
        );
        Object responseBody = response.getBody();
        if (!(responseBody instanceof Map<?, ?> payload)) {
          throw new IllegalStateException("LLM returned empty response body");
        }
        return extractAssistantContent(payload);
      } catch (HttpStatusCodeException error) {
        if (isTransientProviderStatus(error.getStatusCode().value()) && attempt < LLM_MAX_TRANSIENT_ATTEMPTS) {
          sleepBeforeProviderRetry(retryDelayMillis(error, attempt));
          continue;
        }
        String message = providerErrorMessage(error.getResponseBodyAsString());
        throw new IllegalStateException("LLM HTTP " + error.getStatusCode().value() + ": " + message, error);
      } catch (RestClientException error) {
        if (attempt < LLM_MAX_TRANSIENT_ATTEMPTS) {
          sleepBeforeProviderRetry(defaultRetryDelayMillis(attempt));
          continue;
        }
        throw new IllegalStateException("LLM request failed after " + attempt + " attempts: " + error.getMessage(), error);
      }
    }
    throw new IllegalStateException("LLM request failed after transient retries");
  }

  private boolean isTransientProviderStatus(int status) {
    return status == 408 || status == 429 || status == 502 || status == 503 || status == 504;
  }

  private long retryDelayMillis(HttpStatusCodeException error, int attempt) {
    String retryAfter = error.getResponseHeaders() == null
        ? ""
        : cleanCell(error.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER));
    if (!retryAfter.isBlank()) {
      try {
        double seconds = Double.parseDouble(retryAfter);
        if (seconds >= 0) return Math.min(LLM_MAX_RETRY_DELAY_MS, Math.max(250, Math.round(seconds * 1_000)));
      } catch (NumberFormatException ignored) {
        try {
          long millis = Duration.between(Instant.now(), ZonedDateTime.parse(retryAfter, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis();
          if (millis > 0) return Math.min(LLM_MAX_RETRY_DELAY_MS, Math.max(250, millis));
        } catch (RuntimeException ignoredDate) {
          // Fall through to bounded exponential delay.
        }
      }
    }
    return defaultRetryDelayMillis(attempt);
  }

  private long defaultRetryDelayMillis(int attempt) {
    long exponentialDelay = 1_000L << Math.max(0, Math.min(3, attempt - 1));
    long jitter = ThreadLocalRandom.current().nextLong(100, 401);
    return Math.min(LLM_MAX_RETRY_DELAY_MS, exponentialDelay + jitter);
  }

  private void sleepBeforeProviderRetry(long delayMillis) {
    try {
      Thread.sleep(Math.max(1, Math.min(LLM_MAX_RETRY_DELAY_MS, delayMillis)));
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("LLM retry interrupted", error);
    }
  }

  private String chatCompletionsUrl(String baseUrl) {
    String url = cleanCell(baseUrl).replaceAll("/+$", "");
    if (url.isBlank()) {
      url = "https://api.deepseek.com";
    }
    if (url.endsWith("/chat/completions")) {
      return url;
    }
    if (url.toLowerCase(Locale.ROOT).contains("deepseek.com")) {
      return url.endsWith("/v1") ? url + "/chat/completions" : url + "/chat/completions";
    }
    if (url.endsWith("/v1")) {
      return url + "/chat/completions";
    }
    return url + "/v1/chat/completions";
  }

  private String extractAssistantContent(Map<?, ?> payload) {
    Object error = payload.get("error");
    if (error != null) {
      throw new IllegalStateException(providerErrorMessage(error));
    }
    Object choicesValue = payload.get("choices");
    if (choicesValue instanceof List<?> choices && !choices.isEmpty()) {
      Object first = choices.get(0);
      if (first instanceof Map<?, ?> choice) {
        String finishReason = cleanCell(choice.get("finish_reason"));
        String content = contentText(choice.get("message"));
        if (content.isBlank()) content = contentText(choice.get("delta"));
        if (content.isBlank()) content = contentText(choice.get("text"));
        if (isOutputLimitFinishReason(finishReason)) {
          if (!content.isBlank() && containsCompleteJsonObject(content)) return content;
          throw new RetryableAgentOutputException("Agent 输出达到长度上限，返回结果被截断。正在缩小批次重试。");
        }
        if (!content.isBlank()) return content;
      }
    }
    String content = contentText(payload.get("output_text"));
    if (content.isBlank()) content = contentText(payload.get("text"));
    if (!content.isBlank()) return content;
    throw new AgentProtocolException("LLM response did not contain assistant content");
  }

  private boolean isOutputLimitFinishReason(String finishReason) {
    String value = cleanCell(finishReason).toLowerCase(Locale.ROOT);
    return value.equals("length")
        || value.contains("max_token")
        || value.contains("token_limit")
        || value.contains("output_limit");
  }

  private boolean containsCompleteJsonObject(String content) {
    try {
      objectMapper.readTree(extractJsonObject(content));
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private String contentText(Object value) {
    if (value == null) return "";
    if (value instanceof String text) return cleanCell(text);
    if (value instanceof Map<?, ?> map) {
      String content = contentText(map.get("content"));
      if (content.isBlank()) content = contentText(map.get("text"));
      return content;
    }
    if (value instanceof List<?> list) {
      StringBuilder builder = new StringBuilder();
      for (Object item : list) {
        String part = contentText(item);
        if (!part.isBlank()) builder.append(part);
      }
      return cleanCell(builder.toString());
    }
    return cleanCell(value);
  }

  private String providerErrorMessage(Object value) {
    if (value == null) return "unknown provider error";
    if (value instanceof Map<?, ?> map) {
      String message = firstNonBlank(map.get("message"), map.get("msg"), map.get("type"), map.get("code"));
      if (!message.isBlank()) return message;
      Object nested = map.get("error");
      if (nested != null && nested != value) return providerErrorMessage(nested);
    }
    String text = cleanCell(value);
    if (text.startsWith("{")) {
      try {
        return providerErrorMessage(objectMapper.readValue(text, new TypeReference<Map<String, Object>>() {}));
      } catch (Exception ignored) {
        return trim(text, 300);
      }
    }
    return trim(text, 300);
  }

  private RecognitionResult recognizePackingListTable(String text) {
    if (!looksLikePackingListTable(text)) return null;

    List<String> lines = textRows(text);
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    for (int index = 0; index < lines.size(); index++) {
      ParsedCargo parsed = parsePackingListTableLine(lines.get(index), index + 1);
      if (!parsed.matched()) continue;
      if (parsed.errors().isEmpty()) {
        validRows.add(parsed.cargo());
      } else {
        issues.add(buildIssue(index + 1, parsed.text(), parsed.errors(), parsed.cargo()));
      }
    }

    if (validRows.isEmpty()) return null;
    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = "识别为 PL 纸箱清单：按 T.CTNS/总箱数和 CARTON SIZE 导入；Order Qty/散件数量、PCS/CTN、PALLET SIZE、T.CBM 和托盘总重量仅作为备注，不参与装箱计算。";
    return new RecognitionResult(lines.size(), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private boolean looksLikePackingListTable(String text) {
    String lower = cleanCell(text).toLowerCase(Locale.ROOT);
    if (lower.isBlank()) return false;
    boolean hasCartonCount = lower.contains("t.ctns") || lower.contains("t. ctns")
        || lower.contains("total ctn") || lower.contains("总箱数");
    boolean hasPiecesPerCarton = lower.contains("pcs/ctn") || lower.contains("pcs / ctn")
        || lower.contains("个/箱") || lower.contains("每箱");
    boolean hasOrderQuantity = lower.contains("order qty") || lower.contains("订单数量")
        || lower.contains("总数量");
    boolean hasCartonSize = lower.contains("carton size") || lower.contains("纸箱尺寸")
        || lower.contains("单纸箱尺寸");
    return hasCartonCount && hasPiecesPerCarton && hasOrderQuantity && hasCartonSize;
  }

  private ParsedCargo parsePackingListTableLine(String line, int rowNumber) {
    String text = cleanCell(line);
    if (text.isBlank()) return new ParsedCargo(false, line, Map.of(), List.of());

    String[] tokens = text.split("[\\s,，\\t]+");
    if (tokens.length < 11) return new ParsedCargo(false, line, Map.of(), List.of());

    String name = cleanCell(tokens[0]);
    if (name.isBlank() || name.matches("(?i)size|尺寸|total|合计")) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    List<Double> numbers = new ArrayList<>();
    for (int i = 1; i < tokens.length; i++) {
      Double number = firstNumberInToken(tokens[i]);
      if (number != null) numbers.add(number);
    }
    if (numbers.size() < 10) return new ParsedCargo(false, line, Map.of(), List.of());

    int totalCartons = Math.max(0, (int) Math.round(numbers.get(0)));
    double piecesPerCarton = numbers.get(1);
    double orderQuantity = numbers.get(2);
    double unitNetWeight = numbers.get(3);
    double unitGrossWeight = numbers.get(4);
    double totalNetWeight = numbers.size() > 5 ? numbers.get(5) : 0;
    double totalGrossWeight = numbers.size() > 6 ? numbers.get(6) : 0;
    double cartonLengthCm = numbers.get(7);
    double cartonWidthCm = numbers.get(8);
    double cartonHeightCm = numbers.get(9);
    if (unitGrossWeight <= 0 && totalGrossWeight > 0 && totalCartons > 0) {
      unitGrossWeight = totalGrossWeight / totalCartons;
    }

    if (totalCartons <= 0 || cartonLengthCm <= 0 || cartonWidthCm <= 0 || cartonHeightCm <= 0) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    String remark = "PL纸箱清单；Order Qty " + formatNumber(orderQuantity)
        + " 为散件数量不参与装箱；PCS/CTN " + formatNumber(piecesPerCarton)
        + " 仅备注；单箱净重 " + formatNumber(unitNetWeight)
        + "kg，总净重 " + formatNumber(totalNetWeight)
        + "kg，总毛重 " + formatNumber(totalGrossWeight) + "kg";
    if (numbers.size() >= 13) {
      remark += "；托盘尺寸 " + formatNumber(numbers.get(10)) + "x"
          + formatNumber(numbers.get(11)) + "x" + formatNumber(numbers.get(12))
          + "m 不是逐托导入尺寸";
    }
    if (numbers.size() >= 15) {
      remark += "；T.CBM " + formatNumber(numbers.get(13))
          + "、托盘总重 " + formatNumber(numbers.get(14)) + "kg 仅备注";
    }

    Map<String, Object> cargo = cargoMap(
        name,
        "",
        cartonLengthCm,
        cartonWidthCm,
        cartonHeightCm,
        totalCartons,
        unitGrossWeight,
        "normal",
        "",
        "",
        remark
    );
    applyIndependentConstraints(cargo, line);
    cargo.put("packageInfo", packingListPackageInfo(
        "carton",
        totalCartons,
        cartonLengthCm,
        cartonWidthCm,
        cartonHeightCm,
        unitGrossWeight,
        totalGrossWeight,
        orderQuantity,
        piecesPerCarton
    ));
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, line, cargo, errors);
  }

  private Double firstNumberInToken(String token) {
    Matcher matcher = Pattern.compile("-?\\d+(?:[.,]\\d+)?").matcher(cleanCell(token));
    if (!matcher.find()) return null;
    try {
      return parseFlexibleNumber(matcher.group());
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private Map<String, Object> packingListPackageInfo(
      String packageUnit,
      int packageQuantity,
      double lengthCm,
      double widthCm,
      double heightCm,
      double packageGrossWeightKg,
      double totalGrossWeightKg,
      double innerTotalQuantity,
      double innerPiecesPerPackage
  ) {
    Map<String, Object> dimensions = new LinkedHashMap<>();
    dimensions.put("lengthCm", round2(lengthCm));
    dimensions.put("widthCm", round2(widthCm));
    dimensions.put("heightCm", round2(heightCm));

    Map<String, Object> innerCargo = new LinkedHashMap<>();
    if (innerTotalQuantity > 0) innerCargo.put("totalQuantity", Math.round(innerTotalQuantity));
    if (innerPiecesPerPackage > 0) innerCargo.put("piecesPerPackage", round2(innerPiecesPerPackage));
    if (!innerCargo.isEmpty()) innerCargo.put("quantityUnit", "pcs");

    Map<String, Object> info = new LinkedHashMap<>();
    info.put("algorithmBasis", "package-unit");
    info.put("packageUnit", firstNonBlank(packageUnit, "carton"));
    info.put("packageQuantity", packageQuantity);
    info.put("packageDimensionsCm", compactObject(dimensions));
    info.put("packageGrossWeightKg", round2(packageGrossWeightKg));
    info.put("packageTotalGrossWeightKg", totalGrossWeightKg > 0 ? round2(totalGrossWeightKg) : round2(packageGrossWeightKg * packageQuantity));
    if (!innerCargo.isEmpty()) info.put("innerCargo", innerCargo);
    return compactObject(info);
  }

  private Map<String, Object> compactObject(Map<String, Object> object) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : object.entrySet()) {
      Object value = entry.getValue();
      if (value == null) continue;
      if (value instanceof String text && text.isBlank()) continue;
      if (value instanceof Number number && !Double.isFinite(number.doubleValue())) continue;
      if (value instanceof Map<?, ?> map && map.isEmpty()) continue;
      result.put(entry.getKey(), value);
    }
    return result;
  }

  private String formatNumber(double value) {
    if (Math.abs(value - Math.rint(value)) < 0.0001) return String.valueOf((long) Math.rint(value));
    return String.format(Locale.ROOT, "%.2f", value).replaceAll("0+$", "").replaceAll("\\.$", "");
  }

  private RecognitionResult recognizeWithRules(String text) {
    List<String> lines = textRows(text);
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    String currentName = "";
    int correctedWeightCount = 0;

    for (int index = 0; index < lines.size(); index++) {
      String line = lines.get(index);
      int rowNumber = index + 1;
      if (isHeading(line)) {
        continue;
      }

      ParsedCargo parsed = parseLine(line, currentName, rowNumber);
      if (parsed.matched()) {
        if (applyThousandSeparatedWeightCorrection(parsed.cargo(), thousandSeparatedWeightCorrections(line))) {
          correctedWeightCount++;
        }
        if (parsed.errors().isEmpty()) {
          validRows.add(parsed.cargo());
          currentName = cleanCell(parsed.cargo().get("name"));
        } else {
          issues.add(buildIssue(rowNumber, parsed.text(), parsed.errors(), parsed.cargo()));
        }
        continue;
      }

      if (looksLikeContextName(line)) {
        currentName = cleanContextName(line);
      } else if (HAS_DATA_PATTERN.matcher(line).find()) {
        issues.add(buildIssue(rowNumber, line, List.of("未能识别完整货物规格，请补充名称、长宽高、数量和重量"), Map.of("name", currentName)));
      }
    }

    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = "规则兜底已完成：支持中英文尺寸、skids/pallets/pcs、每件重量、总重换算和同名多尺寸自动型号。";
    if (correctedWeightCount > 0) {
      notes += " 已按原文千分位重量修正 " + correctedWeightCount + " 条。";
    }
    return new RecognitionResult(lines.size(), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private ParsedCargo parseDelimitedLine(String line, String currentName, int rowNumber) {
    if (!line.contains(",") && !line.contains("，") && !line.contains("\t")) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }
    DimensionParts dimensions = extractDimensions(line);
    if (dimensions == null) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    List<String> tokens = CSV_SPLIT_PATTERN.splitAsStream(line)
        .map(this::cleanCell)
        .filter(token -> !token.isBlank())
        .toList();
    int startIndex = (!tokens.isEmpty() && tokens.get(0).matches("\\d+")) ? 1 : 0;
    String name = "";
    String model = "";
    for (int i = startIndex; i < tokens.size(); i++) {
      String token = tokens.get(i);
      if (isMeasurementToken(token)) continue;
      if (name.isBlank()) {
        name = token;
      } else if (model.isBlank()) {
        model = token;
        break;
      }
    }
    Integer quantity = firstDelimitedQuantity(tokens);
    Double weightKg = firstDelimitedWeight(tokens);

    Map<String, Object> cargo = cargoMap(
        firstNonBlank(name, currentName, inferNameFromLine(line, rowNumber)),
        model,
        dimensions.lengthCm(),
        dimensions.widthCm(),
        dimensions.heightCm(),
        quantity == null ? 1 : quantity,
        weightKg == null ? 0 : weightKg,
        normalizeType(line),
        "",
        "",
        line
    );
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, line, cargo, errors);
  }

  private ParsedCargo parseLine(String line, String currentName, int rowNumber) {
    ParsedCargo delimited = parseDelimitedLine(line, currentName, rowNumber);
    if (delimited.matched()) {
      return delimited;
    }

    Matcher skid = SKID_LINE_PATTERN.matcher(line);
    if (skid.matches()) {
      String pack = cleanCell(skid.group("pack")).toLowerCase(Locale.ROOT);
      String name = firstNonBlank(skid.group("name"), currentName, inferNameFromLine(line, rowNumber));
      Map<String, Object> cargo = cargoMap(
          name,
          "",
          convertDimension(parseDimensionNumber(skid.group("length"), skid.group("dimensionUnit")), skid.group("dimensionUnit")),
          convertDimension(parseDimensionNumber(skid.group("width"), skid.group("dimensionUnit")), skid.group("dimensionUnit")),
          convertDimension(parseDimensionNumber(skid.group("height"), skid.group("dimensionUnit")), skid.group("dimensionUnit")),
          intValue(skid.group("quantity"), 1),
          parseFlexibleNumber(skid.group("weight")),
          isPalletLike(pack) ? "pallet" : normalizeType(line),
          "",
          "",
          "文本识别：" + pack
      );
      applyIndependentConstraints(cargo, line);
      cargo.put("packageInfo", packingListPackageInfo(
          isPalletLike(pack) ? "pallet" : "carton",
          intValue(skid.group("quantity"), 1),
          numberValue(cargo.get("lengthCm")),
          numberValue(cargo.get("widthCm")),
          numberValue(cargo.get("heightCm")),
          numberValue(cargo.get("weightKg")),
          numberValue(cargo.get("weightKg")) * intValue(cargo.get("quantity"), 1),
          0,
          0
      ));
      List<String> errors = validateCargo(cargo);
      return new ParsedCargo(true, line, cargo, errors);
    }

    Matcher dimension = DIMENSION_LINE_PATTERN.matcher(line);
    if (dimension.matches()) {
      String namePart = cleanCell(dimension.group("name"));
      String tail = cleanCell(dimension.group("tail"));
      String name = firstNonBlank(extractName(namePart), currentName, inferNameFromLine(line, rowNumber));
      String model = firstNonBlank(extractModel(namePart), extractModel(tail));
      Integer quantity = firstInteger(QUANTITY_PATTERN, line, 1);
      Double weightKg = firstWeight(line);
      if (weightKg != null && quantity != null && quantity > 0 && isTotalWeightLine(line)) {
        weightKg = weightKg / quantity;
      }
      Map<String, Object> cargo = cargoMap(
          name,
          model,
          convertDimension(parseDimensionNumber(dimension.group("length"), dimension.group("dimensionUnit")), dimension.group("dimensionUnit")),
          convertDimension(parseDimensionNumber(dimension.group("width"), dimension.group("dimensionUnit")), dimension.group("dimensionUnit")),
          convertDimension(parseDimensionNumber(dimension.group("height"), dimension.group("dimensionUnit")), dimension.group("dimensionUnit")),
          quantity == null ? 1 : quantity,
          weightKg == null ? 0 : weightKg,
          normalizeType(line),
          "",
          "",
          tail
      );
      applyIndependentConstraints(cargo, line);
      List<String> errors = validateCargo(cargo);
      return new ParsedCargo(true, line, cargo, errors);
    }

    return new ParsedCargo(false, line, Map.of(), List.of());
  }

  private DimensionParts extractDimensions(String text) {
    Matcher matcher = FLEX_DIMENSION_PATTERN.matcher(cleanCell(text));
    if (!matcher.find()) return null;
    String defaultUnit = firstNonBlank(matcher.group("unit1"), matcher.group("unit2"), matcher.group("unit3"), "cm");
    String lengthUnit = firstNonBlank(matcher.group("unit1"), defaultUnit);
    String widthUnit = firstNonBlank(matcher.group("unit2"), defaultUnit);
    String heightUnit = firstNonBlank(matcher.group("unit3"), defaultUnit);
    return new DimensionParts(
        convertFlexDimension(parseDimensionNumber(matcher.group("length"), lengthUnit), lengthUnit),
        convertFlexDimension(parseDimensionNumber(matcher.group("width"), widthUnit), widthUnit),
        convertFlexDimension(parseDimensionNumber(matcher.group("height"), heightUnit), heightUnit)
    );
  }

  private double convertFlexDimension(double value, String unit) {
    String normalized = cleanCell(unit).toLowerCase(Locale.ROOT);
    if ("mm".equals(normalized) || "毫米".equals(normalized)) return value / 10;
    if ("m".equals(normalized) || "米".equals(normalized)) return value * 100;
    return value;
  }

  private Integer firstDelimitedQuantity(List<String> tokens) {
    for (String token : tokens) {
      if (isDimensionToken(token) || FLEX_WEIGHT_PATTERN.matcher(token).find()) continue;
      Matcher matcher = FLEX_QUANTITY_PATTERN.matcher(token);
      if (matcher.find()) {
        return intValue(matcher.group(1), 0);
      }
    }
    return null;
  }

  private Double firstDelimitedWeight(List<String> tokens) {
    for (String token : tokens) {
      if (isDimensionToken(token)) continue;
      Matcher matcher = FLEX_WEIGHT_PATTERN.matcher(token);
      if (matcher.find()) {
        double value = parseFlexibleNumber(matcher.group(1));
        String unit = cleanCell(matcher.group(2)).toLowerCase(Locale.ROOT);
        if ("g".equals(unit) || "克".equals(unit)) return value / 1000;
        if ("t".equals(unit) || "吨".equals(unit)) return value * 1000;
        return value;
      }
    }
    return null;
  }

  private boolean isMeasurementToken(String token) {
    String text = cleanCell(token);
    if (text.matches("\\d+")) return true;
    return isDimensionToken(text)
        || FLEX_QUANTITY_PATTERN.matcher(text).matches()
        || FLEX_WEIGHT_PATTERN.matcher(text).matches();
  }

  private boolean isDimensionToken(String token) {
    return FLEX_DIMENSION_PATTERN.matcher(cleanCell(token)).find();
  }

  private ParsedCargo normalizeCargo(Map<String, Object> row, int rowNumber, String sourceText) {
    Map<String, Object> cargo = cargoMap(
        cleanCell(row.get("name")),
        cleanCell(firstNonBlank(row.get("model"), row.get("spec"))),
        numberOrZero(row.get("lengthCm")),
        numberOrZero(row.get("widthCm")),
        numberOrZero(row.get("heightCm")),
        intValue(row.get("quantity"), 0),
        numberOrZero(firstNonBlank(row.get("weightKg"), row.get("unitWeightKg"))),
        normalizeType(firstNonBlank(row.get("type"), row.get("remark"))),
        normalizeColor(row.get("color")),
        cleanCell(firstNonBlank(row.get("sku"), row.get("id"))),
        cleanCell(row.get("remark"))
    );
    if (row.get("packageInfo") instanceof Map<?, ?> packageInfo) {
      cargo.put("packageInfo", new LinkedHashMap<>(packageInfo));
    }
    if (row.containsKey("sourceRowNumber") && row.containsKey("sourceRowNumbers")) {
      for (Map.Entry<String, Object> entry : row.entrySet()) {
        if (entry.getKey().startsWith("source")) {
          cargo.put(entry.getKey(), deepCopyJsonValue(entry.getValue()));
        }
      }
    }
    applyIndependentConstraints(cargo,
        row.get("nonStack"),
        row.get("nonStackable"),
        row.get("keepUpright"),
        row.get("upright"),
        row.get("type"),
        row.get("remark"),
        sourceText);
    if (booleanValue(row.get("palletDimensionsMissing"))) {
      cargo.put("lengthCm", 0);
      cargo.put("widthCm", 0);
      cargo.put("heightCm", 0);
      @SuppressWarnings("unchecked")
      Map<String, Object> packageInfo = cargo.get("packageInfo") instanceof Map<?, ?> packageInfoRaw
          ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
          : new LinkedHashMap<>();
      packageInfo.putIfAbsent("handlingUnitType", "pallet");
      packageInfo.putIfAbsent("packageUnit", "pallet");
      packageInfo.put("dimensionSource", "missing");
      packageInfo.put("handlingUnitDimensionsExplicit", false);
      cargo.put("packageInfo", compactObject(packageInfo));
    }
    applyPackageHierarchyFormula(cargo);
    applyPackageWeightFormula(cargo);
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, sourceText.isBlank() ? "AI row " + rowNumber : sourceText, cargo, errors);
  }

  @SuppressWarnings("unchecked")
  private void applyPackageHierarchyFormula(Map<String, Object> cargo) {
    if (!isPalletHandlingUnit(cargo)) return;
    cargo.put("type", "pallet");
    Object packageInfoValue = cargo.get("packageInfo");
    Map<String, Object> packageInfo = packageInfoValue instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    packageInfo.put("packageUnit", "pallet");
    packageInfo.putIfAbsent("handlingUnitType", "pallet");
    Map<String, Object> innerCargo = packageInfo.get("innerCargo") instanceof Map<?, ?> innerRaw
        ? new LinkedHashMap<>((Map<String, Object>) innerRaw)
        : new LinkedHashMap<>();
    int cartonCount = firstPositiveInt(
        innerCargo.get("cartonCount"),
        innerCargo.get("totalCartons"),
        packageInfo.get("cartonCount"),
        packageInfo.get("totalCartons")
    );
    String innerQuantityUnit = cleanCell(innerCargo.get("quantityUnit")).toLowerCase(Locale.ROOT);
    if (cartonCount <= 0 && containsAny(innerQuantityUnit, "carton", "ctn", "箱")) {
      cartonCount = intValue(innerCargo.get("totalQuantity"), 0);
    }
    int cartonsPerPallet = firstPositiveInt(
        innerCargo.get("cartonsPerPallet"),
        packageInfo.get("cartonsPerPallet"),
        packageInfo.get("packagesPerPallet")
    );
    int layers = firstPositiveInt(innerCargo.get("layers"), packageInfo.get("layers"));
    int cartonsPerLayer = firstPositiveInt(
        innerCargo.get("cartonsPerLayer"),
        innerCargo.get("packagesPerLayer"),
        packageInfo.get("cartonsPerLayer"),
        packageInfo.get("packagesPerLayer")
    );
    if (cartonsPerPallet <= 0 && layers > 0 && cartonsPerLayer > 0) {
      cartonsPerPallet = layers * cartonsPerLayer;
      packageInfo.put("cartonsPerPalletFormula", "layers * cartonsPerLayer");
    }

    int sourceQuantity = intValue(cargo.get("quantity"), 0);
    int declaredPalletQuantity = firstPositiveInt(packageInfo.get("packageQuantity"));
    if (cartonCount > 0) innerCargo.put("cartonCount", cartonCount);
    if (cartonsPerPallet > 0) innerCargo.put("cartonsPerPallet", cartonsPerPallet);
    if (layers > 0) innerCargo.put("layers", layers);
    if (cartonsPerLayer > 0) innerCargo.put("cartonsPerLayer", cartonsPerLayer);
    if (!innerCargo.isEmpty()) packageInfo.put("innerCargo", compactObject(innerCargo));

    int palletQuantity = declaredPalletQuantity > 0 ? declaredPalletQuantity : sourceQuantity;
    if (cartonCount > 0 && cartonsPerPallet > 0) {
      palletQuantity = Math.max(1, (int) Math.ceil((double) cartonCount / cartonsPerPallet));
      packageInfo.put("quantityFormula", "ceil(cartonCount / cartonsPerPallet)");
    }
    cargo.put("quantity", palletQuantity);
    if (palletQuantity > 0) packageInfo.put("packageQuantity", palletQuantity);

    double palletGrossWeight = firstPositiveNumber(
        packageInfo.get("packageGrossWeightKg"),
        packageInfo.get("palletGrossWeightKg"),
        packageInfo.get("handlingUnitGrossWeightKg")
    );
    double palletTotalGrossWeight = firstPositiveNumber(
        packageInfo.get("packageTotalGrossWeightKg"),
        packageInfo.get("palletTotalGrossWeightKg"),
        packageInfo.get("handlingUnitTotalGrossWeightKg")
    );
    double cartonGrossWeight = firstPositiveNumber(
        innerCargo.get("cartonGrossWeightKg"),
        innerCargo.get("unitGrossWeightKg")
    );
    double containedCargoTotalWeight = firstPositiveNumber(
        packageInfo.get("cargoTotalWeightKg"),
        packageInfo.get("containedCargoTotalGrossWeightKg"),
        innerCargo.get("totalGrossWeightKg"),
        innerCargo.get("cargoTotalWeightKg"),
        innerCargo.get("totalWeightKg")
    );
    if (containedCargoTotalWeight <= 0 && cartonCount > 0 && cartonGrossWeight > 0) {
      containedCargoTotalWeight = cartonCount * cartonGrossWeight;
      packageInfo.put("weightSource", "cartonCount * cartonGrossWeightKg");
    }
    if (containedCargoTotalWeight > 0) {
      packageInfo.put("cargoTotalWeightKg", round2(containedCargoTotalWeight));
      innerCargo.put("totalGrossWeightKg", round2(containedCargoTotalWeight));
      packageInfo.put("innerCargo", compactObject(innerCargo));
    }

    if (palletGrossWeight > 0) {
      cargo.put("weightKg", round2(palletGrossWeight));
      packageInfo.put("packageGrossWeightKg", round2(palletGrossWeight));
      if (palletQuantity > 0) packageInfo.putIfAbsent("packageTotalGrossWeightKg", round2(palletGrossWeight * palletQuantity));
    } else if (palletTotalGrossWeight > 0 && palletQuantity > 0) {
      cargo.put("weightKg", round2(palletTotalGrossWeight / palletQuantity));
      packageInfo.put("packageGrossWeightKg", round2(palletTotalGrossWeight / palletQuantity));
      packageInfo.put("packageTotalGrossWeightKg", round2(palletTotalGrossWeight));
    } else if (containedCargoTotalWeight > 0 && palletQuantity > 0
        && firstPositiveNumber(
            packageInfo.get("palletTareWeightKg"),
            packageInfo.get("packageTareWeightKg"),
            packageInfo.get("palletTotalTareWeightKg"),
            packageInfo.get("packageTotalTareWeightKg")
        ) <= 0) {
      cargo.put("weightKg", round2(containedCargoTotalWeight / palletQuantity));
      packageInfo.put("weightSource", "contained cargo gross weight only; pallet tare not confirmed");
      String remark = cleanCell(cargo.get("remark"));
      String warning = "托盘重量按内装纸箱毛重合计，托盘皮重未确认";
      if (!remark.contains(warning)) cargo.put("remark", remark.isBlank() ? warning : remark + "；" + warning);
    }
    cargo.put("packageInfo", compactObject(packageInfo));
  }

  @SuppressWarnings("unchecked")
  private boolean palletDimensionsMissing(Map<String, Object> modelRow, Map<String, Object> cargo) {
    if (booleanValue(modelRow.get("palletDimensionsMissing"))) return true;
    if (!isPalletHandlingUnit(cargo)) return false;
    if (numberValue(cargo.get("lengthCm")) <= 0
        || numberValue(cargo.get("widthCm")) <= 0
        || numberValue(cargo.get("heightCm")) <= 0) {
      return true;
    }
    Object packageInfoValue = cargo.get("packageInfo");
    if (!(packageInfoValue instanceof Map<?, ?> packageInfoRaw)) return true;
    Map<String, Object> packageInfo = (Map<String, Object>) packageInfoRaw;
    String dimensionSource = cleanCell(firstNonBlank(
        packageInfo.get("dimensionSource"),
        packageInfo.get("handlingUnitDimensionSource")
    )).toLowerCase(Locale.ROOT);
    if (Set.of("missing", "derived", "inferred", "estimated").contains(dimensionSource)) return true;
    boolean explicitFlagPresent = packageInfo.containsKey("handlingUnitDimensionsExplicit");
    boolean explicitFlag = explicitFlagPresent && booleanValue(packageInfo.get("handlingUnitDimensionsExplicit"));
    if (explicitFlagPresent && !explicitFlag) return true;
    return !(dimensionSource.equals("explicit") || explicitFlag);
  }

  private boolean palletDimensionsAreOnlyInnerPackageSource(
      String rawText,
      int sourceRowNumber,
      Map<String, Object> cargo
  ) {
    if (sourceRowNumber <= 0 || !isPalletHandlingUnit(cargo)) return false;
    DimensionParts sourceDimensions = innerPackageDimensionsFromSource(rawText, sourceRowNumber);
    if (sourceDimensions == null) return false;
    DimensionParts modelDimensions = new DimensionParts(
        numberValue(cargo.get("lengthCm")),
        numberValue(cargo.get("widthCm")),
        numberValue(cargo.get("heightCm"))
    );
    return sameDimensionsIgnoringOrientation(sourceDimensions, modelDimensions);
  }

  private DimensionParts explicitPalletDimensionsFromSource(String rawText, int sourceRowNumber) {
    return dimensionsFromSourceColumns(rawText, sourceRowNumber, true);
  }

  private DimensionParts innerPackageDimensionsFromSource(String rawText, int sourceRowNumber) {
    return dimensionsFromSourceColumns(rawText, sourceRowNumber, false);
  }

  @SuppressWarnings("unchecked")
  private void applyExplicitSourceFields(Map<String, Object> modelRow, String rawText, int sourceRowNumber) {
    if (modelRow == null || sourceRowNumber <= 0) return;
    FinalPackageCandidate finalPackageCandidate = finalPackageCandidates(rawText).stream()
        .filter(candidate -> candidate.sourceRowNumber() == sourceRowNumber)
        .findFirst()
        .orElse(null);
    if (finalPackageCandidate != null) {
      applyFinalPackageCandidate(modelRow, finalPackageCandidate);
      return;
    }
    int headerRowNumber = detectedHeaderRowNumber(rawText);
    if (headerRowNumber <= 0) return;
    Map<String, String> headerCells = excelRowCells(sourceRowText(rawText, headerRowNumber));
    Map<String, String> sourceCells = excelRowCells(sourceRowText(rawText, sourceRowNumber));
    if (headerCells.isEmpty() || sourceCells.isEmpty()) return;

    putSourceText(modelRow, "name", sourceValueForRole(headerCells, sourceCells, "name"));
    putSourceText(modelRow, "model", sourceValueForRole(headerCells, sourceCells, "model"));
    putSourceText(modelRow, "sku", sourceValueForRole(headerCells, sourceCells, "sku"));
    putSourceText(modelRow, "remark", sourceValueForRole(headerCells, sourceCells, "remark"));

    String sourceType = sourceValueForRole(headerCells, sourceCells, "type");
    if (!sourceType.isBlank()) modelRow.put("type", normalizeType(sourceType));
    Integer quantity = positiveSourceInteger(sourceValueForRole(headerCells, sourceCells, "quantity"));
    Double weightKg = positiveSourceNumber(sourceValueForRole(headerCells, sourceCells, "weight"));
    if (quantity != null) modelRow.put("quantity", quantity);
    if (weightKg != null) modelRow.put("weightKg", round2(weightKg));

    String nonStack = sourceValueForRole(headerCells, sourceCells, "nonStack");
    String keepUpright = sourceValueForRole(headerCells, sourceCells, "keepUpright");
    Boolean explicitNonStack = firstExplicitBoolean(nonStack);
    Boolean explicitKeepUpright = firstExplicitBoolean(keepUpright);
    if (explicitNonStack != null) modelRow.put("nonStack", explicitNonStack);
    if (explicitKeepUpright != null) modelRow.put("keepUpright", explicitKeepUpright);

    Map<String, Object> packageInfo = modelRow.get("packageInfo") instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    Map<String, Object> innerCargo = packageInfo.get("innerCargo") instanceof Map<?, ?> innerRaw
        ? new LinkedHashMap<>((Map<String, Object>) innerRaw)
        : new LinkedHashMap<>();
    if (quantity != null) packageInfo.put("packageQuantity", quantity);
    if (weightKg != null) packageInfo.put("packageGrossWeightKg", round2(weightKg));

    Integer originalQuantity = positiveSourceInteger(sourceValueForRole(headerCells, sourceCells, "originalQuantity"));
    Integer piecesPerPackage = positiveSourceInteger(sourceValueForRole(headerCells, sourceCells, "piecesPerPackage"));
    Double tareWeight = positiveSourceNumber(sourceValueForRole(headerCells, sourceCells, "tareWeight"));
    Double innerUnitWeight = positiveSourceNumber(sourceValueForRole(headerCells, sourceCells, "innerUnitWeight"));
    if (originalQuantity != null) {
      innerCargo.put("totalQuantity", originalQuantity);
      innerCargo.put("quantityUnit", "pcs");
    }
    if (piecesPerPackage != null) {
      innerCargo.put("piecesPerPackage", piecesPerPackage);
      innerCargo.put("piecesPerPallet", piecesPerPackage);
    }
    if (innerUnitWeight != null) innerCargo.put("unitNetWeightKg", round2(innerUnitWeight));
    if (tareWeight != null) packageInfo.put("palletTareWeightKg", round2(tareWeight));
    if (!innerCargo.isEmpty()) packageInfo.put("innerCargo", compactObject(innerCargo));

    DimensionParts dimensions = explicitPalletDimensionsFromSource(rawText, sourceRowNumber);
    boolean palletSource = hasPalletHandlingUnitSignal(sourceType, modelRow.get("type"), modelRow.get("name"));
    if (palletSource) {
      modelRow.put("type", "pallet");
      packageInfo.put("handlingUnitType", "pallet");
      packageInfo.put("packageUnit", "pallet");
    }
    if (!packageInfo.isEmpty()) modelRow.put("packageInfo", compactObject(packageInfo));
    if (dimensions != null) applyExplicitPalletDimensions(modelRow, dimensions);
  }

  @SuppressWarnings("unchecked")
  private void applyFinalPackageCandidate(
      Map<String, Object> modelRow,
      FinalPackageCandidate candidate
  ) {
    modelRow.clear();
    for (Map.Entry<String, Object> entry : candidate.values().entrySet()) {
      modelRow.put(entry.getKey(), deepCopyJsonValue(entry.getValue()));
    }
    modelRow.put("sourceRowNumber", candidate.sourceRowNumber());
    modelRow.put("sourceRowNumbers", new ArrayList<>(candidate.sourceRowNumbers()));

    String sourceRange = cleanCell(candidate.values().get("sourceRange"));
    if (sourceRange.isBlank()) {
      sourceRange = "R" + candidate.sourceRowNumbers().get(0)
          + ":R" + candidate.sourceRowNumbers().get(candidate.sourceRowNumbers().size() - 1);
      modelRow.put("sourceRange", sourceRange);
    }

    Map<String, Object> packageInfo = modelRow.get("packageInfo") instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    packageInfo.put("sourceRows", new ArrayList<>(candidate.sourceRowNumbers()));
    packageInfo.put("sourceRange", sourceRange);
    modelRow.put("packageInfo", packageInfo);
  }

  private Object deepCopyJsonValue(Object value) {
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> copy = new LinkedHashMap<>();
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        copy.put(String.valueOf(entry.getKey()), deepCopyJsonValue(entry.getValue()));
      }
      return copy;
    }
    if (value instanceof List<?> list) {
      List<Object> copy = new ArrayList<>();
      for (Object item : list) copy.add(deepCopyJsonValue(item));
      return copy;
    }
    return value;
  }

  private void putSourceText(Map<String, Object> target, String key, String value) {
    String text = cleanCell(value);
    if (!text.isBlank()) target.put(key, text);
  }

  private String sourceValueForRole(
      Map<String, String> headers,
      Map<String, String> sourceCells,
      String role
  ) {
    for (Map.Entry<String, String> header : headers.entrySet()) {
      if (!matchesHeaderRole(header.getValue(), role)) continue;
      String value = cleanCell(sourceCells.get(header.getKey()));
      if (!value.isBlank()) return value;
    }
    return "";
  }

  private Integer positiveSourceInteger(String value) {
    Double number = positiveSourceNumber(value);
    if (number == null) return null;
    int rounded = (int) Math.round(number);
    return rounded > 0 ? rounded : null;
  }

  private Double positiveSourceNumber(String value) {
    String text = cleanCell(value);
    if (text.isBlank()) return null;
    Matcher matcher = DIMENSION_NUMBER_TOKEN_PATTERN.matcher(text);
    if (!matcher.find()) return null;
    try {
      double number = parseFlexibleNumber(matcher.group());
      return number > 0 ? number : null;
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private DimensionParts dimensionsFromSourceColumns(String rawText, int sourceRowNumber, boolean palletDimensions) {
    int headerRowNumber = detectedHeaderRowNumber(rawText);
    if (headerRowNumber <= 0 || sourceRowNumber <= 0) return null;
    Map<String, String> headerCells = excelRowCells(sourceRowText(rawText, headerRowNumber));
    Map<String, String> sourceCells = excelRowCells(sourceRowText(rawText, sourceRowNumber));
    if (headerCells.isEmpty() || sourceCells.isEmpty()) return null;

    for (Map.Entry<String, String> headerCell : headerCells.entrySet()) {
      boolean matchesCombinedHeader = palletDimensions
          ? isExplicitPalletCombinedDimensionHeader(headerCell.getValue())
          : isInnerPackageCombinedDimensionHeader(headerCell.getValue());
      if (!matchesCombinedHeader) continue;
      DimensionParts dimensions = extractDimensionsWithHeaderUnit(
          sourceCells.get(headerCell.getKey()),
          headerCell.getValue()
      );
      if (positiveDimensions(dimensions)) return dimensions;
    }

    String lengthColumn = dimensionAxisColumn(headerCells, palletDimensions, "length");
    String widthColumn = dimensionAxisColumn(headerCells, palletDimensions, "width");
    String heightColumn = dimensionAxisColumn(headerCells, palletDimensions, "height");
    if (lengthColumn.isBlank() || widthColumn.isBlank() || heightColumn.isBlank()
        || lengthColumn.equals(widthColumn)
        || lengthColumn.equals(heightColumn)
        || widthColumn.equals(heightColumn)) {
      return null;
    }
    DimensionParts dimensions = new DimensionParts(
        dimensionCellValue(sourceCells.get(lengthColumn), headerCells.get(lengthColumn)),
        dimensionCellValue(sourceCells.get(widthColumn), headerCells.get(widthColumn)),
        dimensionCellValue(sourceCells.get(heightColumn), headerCells.get(heightColumn))
    );
    return positiveDimensions(dimensions) ? dimensions : null;
  }

  private Map<String, String> excelRowCells(String line) {
    Map<String, String> cells = new LinkedHashMap<>();
    Matcher matcher = EXCEL_CELL_PATTERN.matcher(String.valueOf(line == null ? "" : line));
    while (matcher.find()) {
      String value;
      try {
        value = objectMapper.readValue(matcher.group(2), String.class);
      } catch (JsonProcessingException error) {
        value = matcher.group(2).replaceAll("^\"|\"$", "");
      }
      cells.put(matcher.group(1).toUpperCase(Locale.ROOT), cleanCell(value));
    }
    return cells;
  }

  private boolean isExplicitPalletCombinedDimensionHeader(String value) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT);
    boolean palletSignal = containsAny(header, "托盘", "栈板", "木托", "pallet", "skid");
    boolean dimensionSignal = containsAny(header, "尺寸", "规格", "长宽高", "外廓", "size", "dimension", "l×w×h", "l*w*h");
    return palletSignal && dimensionSignal;
  }

  private boolean isInnerPackageCombinedDimensionHeader(String value) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT);
    return containsAny(
        header,
        "单箱尺寸", "纸箱尺寸", "外箱尺寸", "内箱尺寸", "包装箱尺寸", "箱规",
        "carton size", "carton dimension", "case size", "case dimension", "box size", "box dimension"
    );
  }

  private String dimensionAxisColumn(Map<String, String> headerCells, boolean palletDimensions, String axis) {
    for (Map.Entry<String, String> entry : headerCells.entrySet()) {
      if (dimensionAxisHeader(entry.getValue(), palletDimensions, axis)) return entry.getKey();
    }
    return "";
  }

  private boolean dimensionAxisHeader(String value, boolean palletDimensions, String axis) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT);
    boolean packageSignal = palletDimensions
        ? containsAny(header, "托盘", "栈板", "木托", "pallet", "skid")
        : containsAny(header, "单箱", "纸箱", "外箱", "内箱", "包装箱", "carton", "case", "box");
    if (!packageSignal) return false;
    return switch (axis) {
      case "length" -> containsAny(header, "托盘长", "栈板长", "木托长", "单箱长", "纸箱长", "外箱长", "内箱长", "包装箱长", "外廓长", "长度", "length", "pallet l", "skid l", "carton l", "box l");
      case "width" -> containsAny(header, "托盘宽", "栈板宽", "木托宽", "单箱宽", "纸箱宽", "外箱宽", "内箱宽", "包装箱宽", "外廓宽", "宽度", "width", "pallet w", "skid w", "carton w", "box w");
      case "height" -> containsAny(header, "托盘高", "栈板高", "木托高", "单箱高", "纸箱高", "外箱高", "内箱高", "包装箱高", "外廓高", "高度", "height", "pallet h", "skid h", "carton h", "box h");
      default -> false;
    };
  }

  private DimensionParts extractDimensionsWithHeaderUnit(String value, String header) {
    Matcher matcher = FLEX_DIMENSION_PATTERN.matcher(cleanCell(value));
    if (!matcher.find()) return null;
    String defaultUnit = firstNonBlank(
        matcher.group("unit1"),
        matcher.group("unit2"),
        matcher.group("unit3"),
        dimensionUnitFromHeader(header),
        "cm"
    );
    String lengthUnit = firstNonBlank(matcher.group("unit1"), defaultUnit);
    String widthUnit = firstNonBlank(matcher.group("unit2"), defaultUnit);
    String heightUnit = firstNonBlank(matcher.group("unit3"), defaultUnit);
    return new DimensionParts(
        convertFlexDimension(parseDimensionNumber(matcher.group("length"), lengthUnit), lengthUnit),
        convertFlexDimension(parseDimensionNumber(matcher.group("width"), widthUnit), widthUnit),
        convertFlexDimension(parseDimensionNumber(matcher.group("height"), heightUnit), heightUnit)
    );
  }

  private double dimensionCellValue(String value, String header) {
    Matcher numberMatcher = DIMENSION_NUMBER_TOKEN_PATTERN.matcher(cleanCell(value));
    if (!numberMatcher.find()) return 0;
    Matcher inlineUnitMatcher = INLINE_DIMENSION_UNIT_PATTERN.matcher(cleanCell(value));
    String inlineUnit = inlineUnitMatcher.find() ? inlineUnitMatcher.group(1) : "";
    String unit = firstNonBlank(inlineUnit, dimensionUnitFromHeader(header), "cm");
    return convertFlexDimension(parseDimensionNumber(numberMatcher.group(), unit), unit);
  }

  private double parseDimensionNumber(String value, String unit) {
    String number = cleanCell(value).replace(" ", "");
    String normalizedUnit = cleanCell(unit).toLowerCase(Locale.ROOT);
    if (("m".equals(normalizedUnit) || "米".equals(normalizedUnit))
        && number.matches("-?\\d+[.,]\\d+")) {
      return Double.parseDouble(number.replace(',', '.'));
    }
    return parseFlexibleNumber(number);
  }

  private String dimensionUnitFromHeader(String value) {
    String header = cleanCell(value).toLowerCase(Locale.ROOT);
    if (containsAny(header, "毫米", "mm")) return "mm";
    if (containsAny(header, "厘米", "cm")) return "cm";
    if (header.contains("米") || Pattern.compile("(?:^|[（(\\s])m(?:$|[）)\\s])").matcher(header).find()) return "m";
    return "";
  }

  private boolean positiveDimensions(DimensionParts dimensions) {
    return dimensions != null
        && dimensions.lengthCm() > 0
        && dimensions.widthCm() > 0
        && dimensions.heightCm() > 0;
  }

  private int detectedHeaderRowNumber(String rawText) {
    for (String line : textRows(rawText)) {
      Matcher matcher = EXCEL_HEADER_ROW_PATTERN.matcher(line);
      if (matcher.matches()) return intValue(matcher.group(1), 0);
    }
    return 0;
  }

  @SuppressWarnings("unchecked")
  private void markPalletDimensionsMissing(Map<String, Object> modelRow, String sourceText) {
    markPalletDimensionsMissing(modelRow, extractDimensions(sourceText));
  }

  @SuppressWarnings("unchecked")
  private void markPalletDimensionsMissing(
      Map<String, Object> modelRow,
      DimensionParts sourceInnerDimensions
  ) {
    modelRow.put("palletDimensionsMissing", true);
    modelRow.put("lengthCm", 0);
    modelRow.put("widthCm", 0);
    modelRow.put("heightCm", 0);

    Map<String, Object> packageInfo = modelRow.get("packageInfo") instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    packageInfo.putIfAbsent("handlingUnitType", "pallet");
    packageInfo.put("dimensionSource", "missing");
    packageInfo.put("handlingUnitDimensionsExplicit", false);

    DimensionParts innerDimensions = sourceInnerDimensions;
    if (innerDimensions != null) {
      Map<String, Object> innerCargo = packageInfo.get("innerCargo") instanceof Map<?, ?> innerRaw
          ? new LinkedHashMap<>((Map<String, Object>) innerRaw)
          : new LinkedHashMap<>();
      innerCargo.putIfAbsent("lengthCm", round2(innerDimensions.lengthCm()));
      innerCargo.putIfAbsent("widthCm", round2(innerDimensions.widthCm()));
      innerCargo.putIfAbsent("heightCm", round2(innerDimensions.heightCm()));
      innerCargo.putIfAbsent("dimensionSource", "source inner-package/carton dimensions");
      packageInfo.put("innerCargo", compactObject(innerCargo));
    }
    modelRow.put("packageInfo", compactObject(packageInfo));
  }

  @SuppressWarnings("unchecked")
  private void applyExplicitPalletDimensions(Map<String, Object> modelRow, DimensionParts dimensions) {
    modelRow.put("palletDimensionsMissing", false);
    modelRow.put("lengthCm", round2(dimensions.lengthCm()));
    modelRow.put("widthCm", round2(dimensions.widthCm()));
    modelRow.put("heightCm", round2(dimensions.heightCm()));
    Map<String, Object> packageInfo = modelRow.get("packageInfo") instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    packageInfo.putIfAbsent("handlingUnitType", "pallet");
    packageInfo.put("dimensionSource", "explicit source pallet columns");
    packageInfo.put("handlingUnitDimensionsExplicit", true);
    modelRow.put("packageInfo", compactObject(packageInfo));
  }

  private boolean sameDimensionsIgnoringOrientation(DimensionParts left, DimensionParts right) {
    double[] leftValues = {left.lengthCm(), left.widthCm(), left.heightCm()};
    double[] rightValues = {right.lengthCm(), right.widthCm(), right.heightCm()};
    Arrays.sort(leftValues);
    Arrays.sort(rightValues);
    for (int index = 0; index < leftValues.length; index++) {
      if (leftValues[index] <= 0 || rightValues[index] <= 0) return false;
      if (Math.abs(leftValues[index] - rightValues[index]) > 0.01) return false;
    }
    return true;
  }

  @SuppressWarnings("unchecked")
  private boolean isPalletHandlingUnit(Map<String, Object> cargo) {
    Object packageInfoValue = cargo.get("packageInfo");
    if (packageInfoValue instanceof Map<?, ?> packageInfoRaw) {
      Map<String, Object> packageInfo = (Map<String, Object>) packageInfoRaw;
      String unit = String.join(" ",
          cleanCell(packageInfo.get("handlingUnitType")),
          cleanCell(packageInfo.get("packageUnit")),
          cleanCell(packageInfo.get("finalHandlingUnit"))
      ).trim();
      if (!unit.isBlank()) return hasPalletHandlingUnitSignal(unit);
    }
    return "pallet".equals(cleanCell(cargo.get("type")));
  }

  private boolean booleanValue(Object value) {
    if (value instanceof Boolean bool) return bool;
    String text = cleanCell(value).toLowerCase(Locale.ROOT);
    return text.equals("true") || text.equals("1") || text.equals("yes") || text.equals("y")
        || text.equals("是") || text.equals("有") || text.equals("需要") || text.equals("必需")
        || text.equals("√") || text.equals("✓");
  }

  private void applyIndependentConstraints(Map<String, Object> cargo, Object... sources) {
    StringBuilder text = new StringBuilder();
    text.append(' ').append(cleanCell(cargo.get("type")));
    text.append(' ').append(cleanCell(cargo.get("remark")));
    for (Object source : sources) text.append(' ').append(cleanCell(source));
    String normalized = text.toString().toLowerCase(Locale.ROOT);
    Boolean explicitNonStack = sources.length >= 4 ? firstExplicitBoolean(sources[0], sources[1]) : null;
    Boolean explicitKeepUpright = sources.length >= 4 ? firstExplicitBoolean(sources[2], sources[3]) : null;
    boolean detectedNonStack = detectsNonStackConstraint(normalized);
    boolean detectedKeepUpright = detectsKeepUprightConstraint(normalized);
    boolean nonStack = explicitNonStack != null
        ? explicitNonStack
        : booleanValue(cargo.get("nonStack")) || booleanValue(cargo.get("nonStackable")) || detectedNonStack;
    boolean keepUpright = explicitKeepUpright != null
        ? explicitKeepUpright
        : booleanValue(cargo.get("keepUpright")) || booleanValue(cargo.get("upright")) || detectedKeepUpright;
    cargo.put("nonStack", nonStack);
    cargo.put("keepUpright", keepUpright);
  }

  private boolean detectsNonStackConstraint(String value) {
    String probe = cleanCell(value).toLowerCase(Locale.ROOT);
    for (String phrase : List.of(
        "not non-stackable", "not nonstackable", "not non stackable",
        "非不可重压", "无需不可重压", "不要求不可重压")) {
      probe = probe.replace(phrase, " ");
    }
    for (String phrase : List.of(
        "non-stackable", "non stackable", "nonstackable", "unstackable",
        "not stackable", "do not stack", "no stack", "non-stack", "non stack", "nonstack",
        "不可重压", "不能重压", "禁止重压", "勿压", "不可堆叠", "不能堆叠", "禁止堆叠")) {
      probe = probe.replace(phrase, " __non_stack__ ");
    }
    for (String phrase : List.of(
        "非易碎", "不是易碎", "not fragile", "non-fragile", "non fragile",
        "可重压", "允许重压", "可以重压", "可堆叠", "允许堆叠", "可以堆叠",
        "can be stacked", "stacking allowed")) {
      probe = probe.replace(phrase, " ");
    }
    probe = probe.replaceAll("(?<![\\p{L}\\p{N}-])stackable(?![\\p{L}\\p{N}-])", " ");
    return probe.contains("__non_stack__") || containsAny(probe, "易碎", "fragile");
  }

  private boolean detectsKeepUprightConstraint(String value) {
    String probe = cleanCell(value).toLowerCase(Locale.ROOT);
    for (String phrase : List.of(
        "无需保持朝上", "不需要保持朝上", "不要求保持朝上", "无需朝上",
        "可以倒置", "允许倒置", "keep upright not required", "upright not required", "not upright")) {
      probe = probe.replace(phrase, " ");
    }
    return containsAny(probe,
        "保持朝上", "朝上", "向上", "不可倒置", "请勿倒置",
        "upright", "this side up", "keep upright");
  }

  private Boolean firstExplicitBoolean(Object... values) {
    for (Object value : values) {
      if (value instanceof Boolean bool) return bool;
      if (value instanceof Number number) {
        if (number.doubleValue() == 0) return false;
        if (number.doubleValue() == 1) return true;
      }
      String text = cleanCell(value).toLowerCase(Locale.ROOT);
      if (text.isBlank()) continue;
      if (List.of("1", "true", "yes", "y", "是", "有", "需要", "必需", "√", "✓").contains(text)) return true;
      if (List.of("0", "false", "no", "n", "否", "无", "不需要", "×", "✕").contains(text)) return false;
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private void applyPackageWeightFormula(Map<String, Object> cargo) {
    Object packageInfoValue = cargo.get("packageInfo");
    if (!(packageInfoValue instanceof Map<?, ?> packageInfoRaw)) return;
    Map<String, Object> packageInfo = new LinkedHashMap<>((Map<String, Object>) packageInfoRaw);
    Map<String, Object> innerCargo = packageInfo.get("innerCargo") instanceof Map<?, ?> innerRaw
        ? new LinkedHashMap<>((Map<String, Object>) innerRaw)
        : new LinkedHashMap<>();
    int quantity = intValue(cargo.get("quantity"), 0);
    if (quantity <= 0) return;

    double explicitPackageGrossWeight = firstPositiveNumber(
        packageInfo.get("packageGrossWeightKg"),
        packageInfo.get("palletGrossWeightKg"),
        packageInfo.get("handlingUnitGrossWeightKg")
    );
    double explicitPackageTotalGrossWeight = firstPositiveNumber(
        packageInfo.get("packageTotalGrossWeightKg"),
        packageInfo.get("palletTotalGrossWeightKg"),
        packageInfo.get("handlingUnitTotalGrossWeightKg")
    );
    if (explicitPackageGrossWeight > 0 || explicitPackageTotalGrossWeight > 0) {
      double unitGrossWeight = explicitPackageGrossWeight > 0
          ? explicitPackageGrossWeight
          : explicitPackageTotalGrossWeight / quantity;
      cargo.put("weightKg", round2(unitGrossWeight));
      packageInfo.put("packageGrossWeightKg", round2(unitGrossWeight));
      packageInfo.put("packageTotalGrossWeightKg", round2(
          explicitPackageTotalGrossWeight > 0 ? explicitPackageTotalGrossWeight : unitGrossWeight * quantity
      ));
      cargo.put("packageInfo", compactObject(packageInfo));
      return;
    }

    double palletTarePerUnit = firstPositiveNumber(
        packageInfo.get("palletTareWeightKg"),
        packageInfo.get("packageTareWeightKg"),
        packageInfo.get("woodenPackageWeightKg"),
        packageInfo.get("tareWeightKg")
    );
    double palletTareTotal = firstPositiveNumber(
        packageInfo.get("palletTotalTareWeightKg"),
        packageInfo.get("packageTotalTareWeightKg"),
        packageInfo.get("woodenPackageTotalWeightKg"),
        packageInfo.get("tareTotalWeightKg")
    );
    double cargoTotalWeight = firstPositiveNumber(
        packageInfo.get("cargoTotalWeightKg"),
        packageInfo.get("containedCargoTotalGrossWeightKg"),
        innerCargo.get("totalGrossWeightKg"),
        innerCargo.get("cargoTotalWeightKg"),
        innerCargo.get("totalWeightKg")
    );

    if (cargoTotalWeight <= 0 || (palletTarePerUnit <= 0 && palletTareTotal <= 0)) return;
    double tareTotal = palletTareTotal > 0 ? palletTareTotal : palletTarePerUnit * quantity;
    double packageTotalGrossWeight = tareTotal + cargoTotalWeight;
    double packageGrossWeight = packageTotalGrossWeight / quantity;
    cargo.put("weightKg", round2(packageGrossWeight));
    packageInfo.put("packageGrossWeightKg", round2(packageGrossWeight));
    packageInfo.put("packageTotalGrossWeightKg", round2(packageTotalGrossWeight));
    packageInfo.putIfAbsent("weightFormula", "pallet tare total + contained cargo gross total, divided by pallet quantity");
    cargo.put("packageInfo", compactObject(packageInfo));

    String remark = cleanCell(cargo.get("remark"));
    String note = "托盘单重已按托盘/木架重量+货物总毛重折算";
    if (!remark.contains(note)) {
      cargo.put("remark", remark.isBlank() ? note : remark + "；" + note);
    }
  }

  private List<String> reviewWarnings(Map<String, Object> cargo, String sourceText) {
    String text = String.join(" ",
        cleanCell(sourceText),
        cleanCell(cargo.get("name")),
        cleanCell(cargo.get("model")),
        cleanCell(cargo.get("remark")),
        cleanCell(cargo.get("type")),
        cleanCell(cargo.get("packageInfo"))
    ).toLowerCase(Locale.ROOT);
    List<String> warnings = new ArrayList<>();
    if (containsAny(text, "空托盘", "空托", "空木托", "empty pallet", "empty skid")) {
      warnings.add("复核：疑似空托盘/单独托盘，请确认是否需要作为独立装柜货物；若只是托盘皮重说明，应改入备注或删除该项。");
    }
    if (containsAny(text, "拼装", "拼托", "混装", "合拼", "共托", "mixed pallet", "combined pallet", "mixed skid", "combined skid")) {
      warnings.add("复核：疑似拼装/混装托盘，请确认尺寸为最终托盘尺寸，单重已包含托盘/木架和托盘内货物总重。");
    }
    if (containsAny(text, "可能", "不确定", "未确认", "疑似", "人工确认", "重复", "复核", "uncertain", "maybe", "possible", "duplicate")) {
      warnings.add("复核：识别内容带有可能、不确定、重复或人工确认信号，请对照原文核对后再导入。");
    }
    if (isPalletHandlingUnit(cargo)
        && containsAny(text, "单独", "独立", "单个", "separate", "standalone", "alone")
        && containsAny(text, "托盘", "木托", "栈板", "pallet", "skid")) {
      warnings.add("复核：疑似单独托盘，请确认不是承托其他货物的空托盘，也不是重复计算的托盘行。");
    }
    if (isPalletHandlingUnit(cargo) && numberValue(cargo.get("weightKg")) <= 0) {
      warnings.add("复核：托盘单重为空或为 0，装箱计算会低估重量，请补全单重。");
    }
    return warnings.stream().distinct().toList();
  }

  private boolean describesPalletDimensionsMissing(String code, List<String> errors, String message) {
    if ("PALLET_DIMENSIONS_MISSING".equals(cleanCell(code))) return true;
    String text = String.join(" ", String.join(" ", errors), cleanCell(message)).toLowerCase(Locale.ROOT);
    boolean palletSignal = containsAny(text, "托盘", "栈板", "木托", "pallet", "skid");
    boolean dimensionSignal = containsAny(text, "尺寸", "外廓", "长宽高", "dimension", "size", "length", "width", "height");
    boolean missingSignal = containsAny(text, "缺少", "缺失", "未提供", "未给", "missing", "not provided", "absent");
    return palletSignal && dimensionSignal && missingSignal;
  }

  private boolean containsAny(String text, String... words) {
    for (String word : words) {
      if (text.contains(word)) return true;
    }
    return false;
  }

  private Map<String, Object> cargoMap(
      String name,
      String model,
      Double lengthCm,
      Double widthCm,
      Double heightCm,
      Integer quantity,
      Double weightKg,
      String type,
      String color,
      String sku,
      String remark
  ) {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("name", cleanCell(name));
    cargo.put("model", cleanCell(model));
    cargo.put("lengthCm", round2(lengthCm));
    cargo.put("widthCm", round2(widthCm));
    cargo.put("heightCm", round2(heightCm));
    cargo.put("quantity", quantity == null ? 0 : quantity);
    cargo.put("weightKg", round2(weightKg));
    cargo.put("type", "pallet".equalsIgnoreCase(cleanCell(type)) ? "pallet" : "normal");
    applyIndependentConstraints(cargo, type, remark);
    cargo.put("color", normalizeColor(color));
    cargo.put("sku", cleanCell(sku));
    cargo.put("remark", cleanCell(remark));
    return cargo;
  }

  private Map<String, Object> buildIssue(int rowNumber, String text, List<String> errors, Map<String, Object> cargo) {
    Map<String, Object> suggestionCargo = new LinkedHashMap<>(cargo);
    suggestionCargo.putIfAbsent("name", firstNonBlank(cargo.get("name"), "第" + rowNumber + "行货物"));
    suggestionCargo.putIfAbsent("quantity", 1);
    suggestionCargo.putIfAbsent("weightKg", 0);
    suggestionCargo.putIfAbsent("type", "normal");
    Map<String, Object> suggestion = new LinkedHashMap<>();
    suggestion.put("cargo", suggestionCargo);
    suggestion.put("errors", validateCargo(suggestionCargo));
    suggestion.put("notes", List.of("建议由用户确认后再导入"));

    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("rowNumber", rowNumber);
    issue.put("text", text);
    issue.put("errors", errors);
    issue.put("suggestion", suggestion);
    return issue;
  }

  private List<Map<String, Object>> aggregateCargos(List<Map<String, Object>> cargos) {
    Map<String, Map<String, Object>> aggregate = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String key = List.of(
          String.valueOf(cargo.getOrDefault("sku", "")),
          String.valueOf(cargo.getOrDefault("name", "")),
          String.valueOf(cargo.getOrDefault("model", "")),
          String.valueOf(cargo.getOrDefault("lengthCm", "")),
          String.valueOf(cargo.getOrDefault("widthCm", "")),
          String.valueOf(cargo.getOrDefault("heightCm", "")),
          String.valueOf(cargo.getOrDefault("weightKg", "")),
          String.valueOf(cargo.getOrDefault("type", "")),
          String.valueOf(cargo.getOrDefault("nonStack", false)),
          String.valueOf(cargo.getOrDefault("keepUpright", false)),
          String.valueOf(cargo.getOrDefault("color", ""))
      ).toString();
      Map<String, Object> existing = aggregate.get(key);
      if (existing == null) {
        aggregate.put(key, new LinkedHashMap<>(cargo));
      } else {
        existing.put("quantity", intValue(existing.get("quantity"), 0) + intValue(cargo.get("quantity"), 0));
        Map<String, Object> mergedPackageInfo = mergePackageInfo(existing.get("packageInfo"), cargo.get("packageInfo"), intValue(existing.get("quantity"), 0));
        if (!mergedPackageInfo.isEmpty()) existing.put("packageInfo", mergedPackageInfo);
      }
    }
    return assignCargoModels(new ArrayList<>(aggregate.values()));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> mergePackageInfo(Object leftValue, Object rightValue, int packageQuantity) {
    Map<String, Object> left = leftValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> right = rightValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    if (left.isEmpty() && right.isEmpty()) return Map.of();
    Map<String, Object> base = new LinkedHashMap<>(left.isEmpty() ? right : left);
    base.put("packageQuantity", packageQuantity);

    Map<String, Object> leftInner = left.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> rightInner = right.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    if (!leftInner.isEmpty() || !rightInner.isEmpty()) {
      Map<String, Object> inner = new LinkedHashMap<>(leftInner);
      inner.putAll(rightInner);
      sumPackageField(inner, leftInner, rightInner, "totalQuantity", true);
      sumPackageField(inner, leftInner, rightInner, "cartonCount", true);
      sumPackageField(inner, leftInner, rightInner, "totalCartons", true);
      sumPackageField(inner, leftInner, rightInner, "totalGrossWeightKg", false);
      sumPackageField(inner, leftInner, rightInner, "cargoTotalWeightKg", false);
      sumPackageField(inner, leftInner, rightInner, "totalWeightKg", false);
      String defaultQuantityUnit = firstPositiveInt(inner.get("cartonCount"), inner.get("totalCartons")) > 0 ? "cartons" : "pcs";
      inner.putIfAbsent("quantityUnit", firstNonBlank(leftInner.get("quantityUnit"), rightInner.get("quantityUnit"), defaultQuantityUnit));
      base.put("innerCargo", compactObject(inner));
    }

    sumPackageField(base, left, right, "packageTotalGrossWeightKg", false);
    sumPackageField(base, left, right, "palletTotalGrossWeightKg", false);
    sumPackageField(base, left, right, "handlingUnitTotalGrossWeightKg", false);
    sumPackageField(base, left, right, "cargoTotalWeightKg", false);
    sumPackageField(base, left, right, "containedCargoTotalGrossWeightKg", false);
    sumPackageField(base, left, right, "palletTotalTareWeightKg", false);
    sumPackageField(base, left, right, "packageTotalTareWeightKg", false);
    return compactObject(base);
  }

  private void sumPackageField(
      Map<String, Object> target,
      Map<String, Object> left,
      Map<String, Object> right,
      String field,
      boolean integer
  ) {
    double total = numberValue(left.get(field)) + numberValue(right.get(field));
    if (total <= 0) return;
    target.put(field, integer ? Math.round(total) : round2(total));
  }

  private List<Map<String, Object>> assignCargoModels(List<Map<String, Object>> cargos) {
    Map<String, List<Map<String, Object>>> byName = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String name = cleanCell(cargo.get("name"));
      if (!name.isBlank()) {
        byName.computeIfAbsent(name, ignored -> new ArrayList<>()).add(cargo);
      }
    }

    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> cargo : cargos) {
      Map<String, Object> next = new LinkedHashMap<>(cargo);
      List<Map<String, Object>> siblings = byName.getOrDefault(cleanCell(cargo.get("name")), List.of());
      List<String> dimensionKeys = siblings.stream().map(this::dimensionKey).distinct().sorted(this::compareDimensionKey).toList();
      if (dimensionKeys.size() > 1 && cleanCell(cargo.get("model")).isBlank()) {
        int index = Math.max(0, dimensionKeys.indexOf(dimensionKey(cargo)));
        next.put("model", "型号 " + modelLabel(index));
      }
      result.add(next);
    }
    return result;
  }

  private List<String> validateCargo(Map<String, Object> cargo) {
    List<String> errors = new ArrayList<>();
    if (cleanCell(cargo.get("name")).isBlank()) errors.add("缺少货物名称");
    if (numberValue(cargo.get("lengthCm")) <= 0) errors.add("长度必须大于 0");
    if (numberValue(cargo.get("widthCm")) <= 0) errors.add("宽度必须大于 0");
    if (numberValue(cargo.get("heightCm")) <= 0) errors.add("高度必须大于 0");
    if (intValue(cargo.get("quantity"), 0) <= 0) errors.add("数量必须是正整数");
    if (numberValue(cargo.get("weightKg")) < 0) errors.add("单件重量必须大于等于 0");
    return errors;
  }

  private String systemPrompt() {
    return """
        You are a cargo import data extraction agent for a container packing system.
        Return strict JSON only. Do not wrap it in Markdown.
        Extract cargo rows from messy Chinese or English shipment text.
        Output schema:
        {
          "rows": [
            {
              "sourceRowNumber": 12,
              "sourceText": "original line or clause",
              "name": "cargo name",
              "model": "model/specification, empty if unknown",
              "lengthCm": 0,
              "widthCm": 0,
              "heightCm": 0,
              "quantity": 1,
              "weightKg": 0,
              "type": "normal|pallet",
              "nonStack": false,
              "keepUpright": false,
              "palletDimensionsMissing": false,
              "remark": "short note",
              "packageInfo": {
                "algorithmBasis": "package-unit",
                "handlingUnitType": "carton|pallet|crate",
                "packageUnit": "carton|pallet|crate",
                "packageQuantity": 1,
                "dimensionSource": "explicit|missing",
                "handlingUnitDimensionsExplicit": true,
                "packageDimensionsCm": {"lengthCm": 0, "widthCm": 0, "heightCm": 0},
                "packageGrossWeightKg": 0,
                "packageTotalGrossWeightKg": 0,
                "palletTareWeightKg": 0,
                "cargoTotalWeightKg": 0,
                "weightFormula": "pallet tare total + contained cargo gross total, divided by pallet quantity",
                "innerCargo": {"cartonCount": 0, "cartonsPerPallet": 0, "cartonDimensionsCm": {"lengthCm": 0, "widthCm": 0, "heightCm": 0}, "cartonGrossWeightKg": 0, "layers": 0, "cartonsPerLayer": 0, "totalQuantity": 0, "piecesPerPackage": 0, "totalGrossWeightKg": 0, "quantityUnit": "cartons|pcs"}
              }
            }
          ],
          "issues": [
            {"sourceRowNumber": 12, "text": "raw text", "code": "optional stable code", "errors": ["missing dimension"], "cargo": {"same fields as a row when a repair candidate is available"}}
          ],
          "skippedSourceRowNumbers": [1, 2],
          "notes": "short Chinese summary"
        }
        Rules:
        - All dimensions must be centimeters.
        - All weights must be kilograms per single item.
        - The algorithm fields lengthCm,widthCm,heightCm,quantity,weightKg must always describe the final handled package unit: pallet, carton, crate, wooden case, or box. Never put loose-piece dimensions into these fields when the goods are shipped inside cartons/pallets.
        - Infer the packaging hierarchy from the meaning and relationships of headers, values, file/sheet names, notes, merged cells, and neighboring rows. Header wording is not fixed and may differ by customer or language; do not depend on exact column names.
        - Signals that a row may represent a loaded pallet include cartons/packages per pallet, pallet/load total weight or volume, layer count, cartons per layer, pallet assembly notes, repeated one-pallet rows, or file/sheet names describing pallet loads. When these semantic signals exist, do not automatically fall back to carton-level cargo merely because carton dimensions and carton counts are present.
        - Do not skip a repeated pallet row merely because its product name and dimensions match another row. Different source rows/SKUs can represent different physical pallets; emit each source row first and let the backend aggregate only after the final handling unit is validated.
        - For a pallet final handling unit, quantity is the pallet count, not the number of cartons inside it. Store carton count, cartons per pallet, carton dimensions, carton weight, layers, and cartons per layer only in packageInfo.innerCargo. When cartonCount and cartonsPerPallet are both clear, pallet quantity is ceil(cartonCount / cartonsPerPallet).
        - For every pallet candidate, packageInfo is mandatory and must include handlingUnitType="pallet", packageUnit="pallet", packageQuantity, dimensionSource, and handlingUnitDimensionsExplicit. packageInfo may be omitted only for non-pallet rows that have no packaging hierarchy.
        - nonStack and keepUpright are independent packing constraints and may both be true on the same row. Set nonStack=true for fragile/no-stack cargo and keepUpright=true for this-side-up/upright cargo. Never drop one when both constraints appear. type describes the physical package (normally "normal" or "pallet"); the two booleans are authoritative for handling constraints.
        - For a constrained pallet, keep packageInfo.handlingUnitType="pallet" and preserve both independent booleans. Do not change both booleans back to false merely because the physical package is a pallet.
        - Pallet algorithm dimensions must be the explicit loaded-pallet outer length, width, and height from the source. Total volume, carton dimensions, layer count, or a guessed grid cannot uniquely prove pallet outer dimensions. Never substitute carton dimensions or invent pallet dimensions.
        - If the final handling unit is a pallet but explicit loaded-pallet L/W/H is absent, still emit one row candidate under rows (not only under issues) with the applicable constraint type, the best-known pallet quantity and gross weight, lengthCm=0,widthCm=0,heightCm=0, palletDimensionsMissing=true, packageInfo.dimensionSource="missing", packageInfo.handlingUnitDimensionsExplicit=false, and the carton details in packageInfo.innerCargo. The backend will block import and ask the user to enter the pallet dimensions.
        - If loose-piece/order details exist, store them only in packageInfo.innerCargo and/or remark.
        - For input beginning with EXCEL_FORMATTED_TABLE_FOR_AGENT, use the Excel coordinates, merged ranges, and neighboring rows/columns to understand the table layout. Do not blindly parse the first recognizable table.
        - FINAL_PACKAGE_CANDIDATE metadata is a high-confidence, source-derived final handling unit and has priority over generic header/column inference. Emit its name, model, dimensions, quantity, weight, type, constraints, remark, packageInfo, and source metadata exactly for its sourceRowNumber anchor; never replace those values with aligned loose-product or inner-carton columns.
        - A FINAL_PACKAGE_CANDIDATE sourceRowNumbers/sourceRows span describes the context and inner contents associated with one final package. Emit cargo only for the candidate sourceRowNumber anchor. Non-anchor rows in that span are context-only and must not become separate cargo.
        - If the input contains EXCEL_AGENT_BATCH, emit rows and issues only for lines under BATCH_TARGET_ROWS. Lines under BATCH_CONTEXT_ONLY are read-only layout/header context and must never be emitted or counted.
        - For EXCEL_AGENT_BATCH, copy the R number into sourceRowNumber. Every number in BATCH_TARGET_SOURCE_ROWS must be covered by a row, an issue, or skippedSourceRowNumbers. A cargo row may also appear in issues when review is required. skippedSourceRowNumbers is mutually exclusive with rows/issues; use it only for headers, totals, blank/reference rows, and anything intentionally not cargo.
        - Keep the JSON compact. Do not copy full Excel source rows into remark or notes. Omit optional packageInfo when it adds no information needed for final package weight or review.
        - If a sheet has product/carton details on the left and pallet/final-package columns on the right, output the right-side final pallet/package rows as the algorithm cargo. The left-side product/carton rows become inner contents only.
        - Chinese packing sheets with right-side headers such as 免熏蒸木托盘体积, 免熏蒸木托盘重量KG, 数量, 总体积m3, 重量KG, 托盘拼装 are final pallet-unit lists. Extract those pallets, not the left-side cartons.
        - For final pallet or wooden-package rows, weightKg must be the gross weight of one final handled unit. When the sheet gives pallet/wooden-package tare weight plus product gross weights, calculate: weightKg = (palletTareWeightKg * palletQuantity + containedCargoTotalGrossWeightKg) / palletQuantity. If the sheet gives a final gross total that clearly already includes pallet plus cargo, use finalGrossTotal / palletQuantity instead and mention it. Never use the bare pallet tare as weightKg when contained cargo weights are available.
        - When a right-side pallet cell spans or visually aligns with multiple left-side product rows, associate those product rows with that pallet. Example: a 116×116×168 cm pallet aligned with 明装筒灯 1000只/20箱 and 线条灯 200条/13箱 should become one pallet cargo row; its weight is pallet tare plus the sum of those two product total gross weights.
        - Put review-only warnings in "issues" even when the row is also returned in "rows". This includes empty/standalone pallets, mixed or assembled pallets, unclear pallet-to-product alignment, possible duplicated pallet weight, and any mapping that needs user confirmation. Prefix those messages with "复核：" and keep the usable cargo row in "rows".
        - English examples like "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm" mean quantity=2, weightKg=31200, dimensions in cm.
        - Important: in English shipment weights, a dot followed by exactly three digits before kg/kgs is a thousands separator, not a decimal point. Output 29.200 kgs as 29200 kg, never 29.2 kg.
        - For a generic carton-only PL / packing-list with no semantic evidence of palletized final handling, columns like Size, T.CTNS, PCS/CTN, Order Qty, N.W, G.W and CARTON SIZE(CM) describe carton cargo:
          extract the carton packing unit, not loose product pieces and not pallet summary totals.
          Use Size as name/model text when no product name exists.
          Use T.CTNS / total cartons / 总箱数 as quantity.
          Use CARTON SIZE(CM) / 纸箱尺寸 as lengthCm,widthCm,heightCm.
          Use per-carton G.W / 单箱毛重 as weightKg. If only total gross weight exists, divide it by T.CTNS.
          PCS/CTN and Order Qty are loose-piece/product counts; keep them only in remark and never use Order Qty as quantity.
          Do not use this carton-only rule when the source semantically describes palletized final handling. Pallet totals, per-pallet counts, layer layouts, or pallet-by-pallet rows override the carton-only default and trigger the pallet rules above.
        - Do not calculate loose pieces / 散件 for container packing. Import the actual handled package unit: carton, crate, wooden case, or explicit final pallet unit.
        - If one product title is followed by multiple skid lines, use that title as the name for those rows.
        - If the same name has different dimensions and no model, leave model empty; the backend will assign 型号 A/B/C.
        - Map skids, pallets, wooden cases and crates to type="pallet". Use type="normal" for ordinary cartons or other non-pallet units. Record fragile/no-stack only in nonStack and this-side-up/upright only in keepUpright; preserve both booleans when both apply.
        """;
  }

  private String userPrompt(String text, String languageHint) {
    String hint = cleanCell(languageHint);
    return "Language hint: " + (hint.isBlank() ? "auto" : hint) + "\nRaw cargo text:\n" + text;
  }

  private String extractJsonObject(String content) {
    String text = cleanCell(content);
    int start = text.indexOf('{');
    int end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new AgentProtocolException("Agent response did not contain a JSON object");
    }
    return text.substring(start, end + 1);
  }

  private List<String> textRows(String text) {
    return String.valueOf(text == null ? "" : text).lines()
        .map(this::cleanCell)
        .filter(line -> !line.isBlank())
        .toList();
  }

  private boolean isHeading(String line) {
    String text = cleanCell(line);
    if (text.isBlank()) return true;
    String lower = text.toLowerCase(Locale.ROOT);
    return lower.equals("cargo:") || lower.equals("cargo") || lower.equals("goods:") || lower.equals("货物:");
  }

  private boolean looksLikeContextName(String line) {
    String text = cleanCell(line);
    return text.length() <= 80 && HAS_LETTER_OR_HAN.matcher(text).matches() && !HAS_DATA_PATTERN.matcher(text).find();
  }

  private String cleanContextName(String line) {
    return cleanCell(line).replaceAll("[:：]+$", "");
  }

  private String extractName(String namePart) {
    String text = cleanCell(namePart);
    if (text.isBlank()) return "";
    text = MODEL_PATTERN.matcher(text).replaceAll("");
    return text.replaceAll("(?i)\\b(qty|quantity|pcs|pieces|件|数量)\\b.*$", "").trim();
  }

  private String inferNameFromLine(String line, int rowNumber) {
    Matcher matcher = Pattern.compile("^[\\p{IsHan}A-Za-z][\\p{IsHan}A-Za-z0-9._\\-\\s]{0,40}").matcher(line);
    if (matcher.find()) {
      String name = cleanCell(matcher.group());
      if (!name.isBlank() && !name.matches("\\d+.*")) return name;
    }
    return "第" + rowNumber + "行货物";
  }

  private String extractModel(String text) {
    Matcher matcher = MODEL_PATTERN.matcher(cleanCell(text));
    return matcher.find() ? matcher.group(1) : "";
  }

  private Integer firstInteger(Pattern pattern, String text, int groupIndex) {
    Matcher matcher = pattern.matcher(text);
    if (!matcher.find()) return null;
    return intValue(matcher.group(groupIndex), 0);
  }

  private Double firstWeight(String text) {
    Matcher matcher = WEIGHT_PATTERN.matcher(text);
    if (!matcher.find()) return null;
    double value = parseFlexibleNumber(matcher.group(1));
    String unit = matcher.group(2).toLowerCase(Locale.ROOT);
    if ("g".equals(unit) || "克".equals(unit)) return value / 1000;
    if ("t".equals(unit) || "吨".equals(unit)) return value * 1000;
    return value;
  }

  @SuppressWarnings("unchecked")
  private boolean applyThousandSeparatedWeightCorrection(Map<String, Object> cargo, Map<Long, Double> corrections) {
    if (cargo == null || cargo.isEmpty() || corrections == null || corrections.isEmpty()) return false;
    Object packageInfoValue = cargo.get("packageInfo");
    Map<String, Object> packageInfo = packageInfoValue instanceof Map<?, ?> packageInfoRaw
        ? new LinkedHashMap<>((Map<String, Object>) packageInfoRaw)
        : new LinkedHashMap<>();
    Object innerCargoValue = packageInfo.get("innerCargo");
    Map<String, Object> innerCargo = innerCargoValue instanceof Map<?, ?> innerCargoRaw
        ? new LinkedHashMap<>((Map<String, Object>) innerCargoRaw)
        : new LinkedHashMap<>();

    boolean cargoChanged = false;
    boolean packageChanged = false;
    boolean innerChanged = false;
    for (Map.Entry<Long, Double> correction : corrections.entrySet()) {
      long key = correction.getKey();
      double correctedValue = correction.getValue();
      boolean finalUnitMatch = hasCorrectableWeightField(cargo, key, correctedValue, "weightKg", "unitWeightKg")
          || hasCorrectableWeightField(packageInfo, key, correctedValue, "packageGrossWeightKg", "palletGrossWeightKg", "handlingUnitGrossWeightKg");
      boolean finalTotalMatch = hasCorrectableWeightField(packageInfo, key, correctedValue, "packageTotalGrossWeightKg", "palletTotalGrossWeightKg", "handlingUnitTotalGrossWeightKg");
      boolean tareUnitMatch = hasCorrectableWeightField(packageInfo, key, correctedValue, "palletTareWeightKg", "packageTareWeightKg", "woodenPackageWeightKg", "tareWeightKg");
      boolean tareTotalMatch = hasCorrectableWeightField(packageInfo, key, correctedValue, "palletTotalTareWeightKg", "packageTotalTareWeightKg", "woodenPackageTotalWeightKg", "tareTotalWeightKg");
      boolean containedTotalMatch = hasCorrectableWeightField(packageInfo, key, correctedValue, "cargoTotalWeightKg", "containedCargoTotalGrossWeightKg")
          || hasCorrectableWeightField(innerCargo, key, correctedValue, "totalGrossWeightKg", "cargoTotalWeightKg", "totalWeightKg");
      boolean innerUnitMatch = hasCorrectableWeightField(innerCargo, key, correctedValue, "cartonGrossWeightKg", "unitGrossWeightKg");
      int matchingRoles = (finalUnitMatch ? 1 : 0)
          + (finalTotalMatch ? 1 : 0)
          + (tareUnitMatch ? 1 : 0)
          + (tareTotalMatch ? 1 : 0)
          + (containedTotalMatch ? 1 : 0)
          + (innerUnitMatch ? 1 : 0);
      if (matchingRoles != 1) continue;

      if (finalUnitMatch) {
        cargoChanged |= correctWeightFields(cargo, key, correctedValue, "weightKg", "unitWeightKg");
        packageChanged |= correctWeightFields(packageInfo, key, correctedValue, "packageGrossWeightKg", "palletGrossWeightKg", "handlingUnitGrossWeightKg");
      } else if (finalTotalMatch) {
        packageChanged |= correctWeightFields(packageInfo, key, correctedValue, "packageTotalGrossWeightKg", "palletTotalGrossWeightKg", "handlingUnitTotalGrossWeightKg");
      } else if (tareUnitMatch) {
        packageChanged |= correctWeightFields(packageInfo, key, correctedValue, "palletTareWeightKg", "packageTareWeightKg", "woodenPackageWeightKg", "tareWeightKg");
      } else if (tareTotalMatch) {
        packageChanged |= correctWeightFields(packageInfo, key, correctedValue, "palletTotalTareWeightKg", "packageTotalTareWeightKg", "woodenPackageTotalWeightKg", "tareTotalWeightKg");
      } else if (containedTotalMatch) {
        packageChanged |= correctWeightFields(packageInfo, key, correctedValue, "cargoTotalWeightKg", "containedCargoTotalGrossWeightKg");
        innerChanged |= correctWeightFields(innerCargo, key, correctedValue, "totalGrossWeightKg", "cargoTotalWeightKg", "totalWeightKg");
      } else {
        innerChanged |= correctWeightFields(innerCargo, key, correctedValue, "cartonGrossWeightKg", "unitGrossWeightKg");
      }
    }
    if (innerChanged) {
      packageInfo.put("innerCargo", innerCargo);
      packageChanged = true;
    }
    if (packageChanged) cargo.put("packageInfo", packageInfo);
    return cargoChanged || packageChanged;
  }

  private boolean hasCorrectableWeightField(
      Map<String, Object> target,
      long correctionKey,
      double correctedValue,
      String... fields
  ) {
    for (String field : fields) {
      if (!target.containsKey(field)) continue;
      double current = numberValue(target.get(field));
      if (weightKey(current) == correctionKey && correctedValue > current + 0.001) return true;
    }
    return false;
  }

  private boolean correctWeightFields(
      Map<String, Object> target,
      long correctionKey,
      double correctedValue,
      String... fields
  ) {
    boolean changed = false;
    for (String field : fields) {
      if (!target.containsKey(field)) continue;
      double current = numberValue(target.get(field));
      if (weightKey(current) == correctionKey && correctedValue > current + 0.001) {
        target.put(field, round2(correctedValue));
        changed = true;
      }
    }
    return changed;
  }

  private String weightCorrectionSourceText(Map<String, Object> modelItem, int sourceRowNumber, String rawText) {
    String provided = cleanCell(firstNonBlank(modelItem.get("sourceText"), modelItem.get("text")));
    if (String.valueOf(rawText).contains("EXCEL_AGENT_BATCH")) {
      String originalBatchRow = sourceRowText(rawText, sourceRowNumber);
      if (!originalBatchRow.isBlank()) return originalBatchRow;
    }
    return provided.isBlank() ? sourceRowText(rawText, sourceRowNumber) : provided;
  }

  private String sourceRowText(String rawText, int sourceRowNumber) {
    if (sourceRowNumber <= 0) return "";
    List<String> lines = textRows(rawText);
    for (String line : lines) {
      Matcher matcher = EXCEL_ROW_PATTERN.matcher(line);
      if (matcher.matches() && intValue(matcher.group(1), 0) == sourceRowNumber) return line;
    }
    return sourceRowNumber <= lines.size() ? lines.get(sourceRowNumber - 1) : "";
  }

  private String normalizedSourceSignature(String value) {
    return cleanCell(value).replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
  }

  private Map<Long, Double> thousandSeparatedWeightCorrections(String rawText) {
    Map<Long, Double> corrections = new LinkedHashMap<>();
    Matcher matcher = THOUSAND_KG_PATTERN.matcher(String.valueOf(rawText == null ? "" : rawText));
    while (matcher.find()) {
      String token = matcher.group(1);
      Double decimalValue = decimalInterpretation(token);
      if (decimalValue == null) continue;
      if (hasAmbiguousDecimalWeightToken(rawText, token, decimalValue)) continue;
      corrections.put(weightKey(decimalValue), parseFlexibleNumber(token));
    }
    return corrections;
  }

  private boolean hasAmbiguousDecimalWeightToken(String rawText, String thousandToken, double decimalValue) {
    Matcher matcher = KG_WEIGHT_TOKEN_PATTERN.matcher(String.valueOf(rawText == null ? "" : rawText));
    String normalizedThousandToken = cleanCell(thousandToken).replace(" ", "");
    while (matcher.find()) {
      String candidate = cleanCell(matcher.group(1)).replace(" ", "");
      if (candidate.equals(normalizedThousandToken)) continue;
      Double candidateDecimal = ordinaryDecimalWeight(candidate);
      if (candidateDecimal != null && weightKey(candidateDecimal) == weightKey(decimalValue)) return true;
    }
    return false;
  }

  private Double ordinaryDecimalWeight(String token) {
    String text = cleanCell(token).replace(" ", "");
    if (text.isBlank() || (text.contains(".") && text.contains(","))) return null;
    try {
      return Double.parseDouble(text.replace(',', '.'));
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private Double decimalInterpretation(String token) {
    String text = cleanCell(token).replace(" ", "");
    if (text.isBlank()) return null;
    if (text.indexOf('.') != text.lastIndexOf('.')) return null;
    try {
      return Double.parseDouble(text);
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private long weightKey(double value) {
    return Math.round(value * 1000);
  }

  private boolean isTotalWeightLine(String text) {
    String lower = cleanCell(text).toLowerCase(Locale.ROOT);
    return lower.contains("总重") || lower.contains("总重量") || lower.contains("total weight") || lower.contains("gross weight");
  }

  private double convertDimension(double value, String unit) {
    String normalized = cleanCell(unit).toLowerCase(Locale.ROOT);
    if ("mm".equals(normalized) || "毫米".equals(normalized)) return value / 10;
    if ("m".equals(normalized) || "米".equals(normalized)) return value * 100;
    return value;
  }

  private double parseFlexibleNumber(Object value) {
    String text = cleanCell(value).replace(" ", "");
    if (text.isBlank()) return 0;
    if (text.matches("\\d{1,3}(?:\\.\\d{3})+")) {
      return Double.parseDouble(text.replace(".", ""));
    }
    if (text.matches("\\d{1,3}(?:,\\d{3})+")) {
      return Double.parseDouble(text.replace(",", ""));
    }
    if (text.contains(",") && !text.contains(".")) {
      return Double.parseDouble(text.replace(",", "."));
    }
    if (text.contains(",") && text.contains(".")) {
      return Double.parseDouble(text.replace(",", ""));
    }
    return Double.parseDouble(text);
  }

  private String normalizeType(Object... values) {
    return hasPalletHandlingUnitSignal(values) ? "pallet" : "normal";
  }

  private boolean isPalletLike(String pack) {
    return hasPalletHandlingUnitSignal(pack);
  }

  private boolean hasPalletHandlingUnitSignal(Object... values) {
    StringBuilder text = new StringBuilder();
    for (Object value : values) text.append(' ').append(cleanCell(value).toLowerCase(Locale.ROOT));
    String normalized = text.toString();
    return containsAny(normalized,
        "托盘", "栈板", "木托", "木箱", "木制箱", "木质箱", "木包装", "木制包装", "木质包装")
        || PALLET_HANDLING_UNIT_PATTERN.matcher(normalized).find();
  }

  private String normalizeColor(Object value) {
    String text = cleanCell(value);
    return text.matches("^#[0-9a-fA-F]{6}$") ? text : "";
  }

  private String dimensionKey(Map<String, Object> cargo) {
    return List.of(
        String.valueOf(round2(numberValue(cargo.get("lengthCm")))),
        String.valueOf(round2(numberValue(cargo.get("widthCm")))),
        String.valueOf(round2(numberValue(cargo.get("heightCm")))),
        String.valueOf(round2(numberValue(cargo.get("weightKg")))),
        String.valueOf(cargo.getOrDefault("type", "normal")),
        String.valueOf(cargo.getOrDefault("nonStack", false)),
        String.valueOf(cargo.getOrDefault("keepUpright", false))
    ).stream().reduce((left, right) -> left + "|" + right).orElse("");
  }

  private int compareDimensionKey(String a, String b) {
    String[] aParts = a.split("\\|");
    String[] bParts = b.split("\\|");
    for (int i = 0; i < 4; i++) {
      double diff = numberValue(i < aParts.length ? aParts[i] : "0") - numberValue(i < bParts.length ? bParts[i] : "0");
      if (Math.abs(diff) > 0.0001) return diff > 0 ? 1 : -1;
    }
    String aType = aParts.length > 4 ? aParts[4] : "";
    String bType = bParts.length > 4 ? bParts[4] : "";
    return aType.compareTo(bType);
  }

  private String modelLabel(int index) {
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (index < alphabet.length()) return String.valueOf(alphabet.charAt(index));
    return alphabet.charAt(index % alphabet.length()) + String.valueOf(index / alphabet.length() + 1);
  }

  private double numberOrZero(Object value) {
    return round2(numberValue(value));
  }

  private double numberValue(Object value) {
    if (value instanceof Number number) return number.doubleValue();
    String text = cleanCell(value);
    if (text.isBlank()) return 0;
    Matcher matcher = Pattern.compile("-?\\d+(?:[.,]\\d+)?").matcher(text);
    if (!matcher.find()) return 0;
    try {
      return parseFlexibleNumber(matcher.group());
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  private int intValue(Object value, int fallback) {
    if (value instanceof Number number) return number.intValue();
    String text = cleanCell(value);
    if (text.isBlank()) return fallback;
    Matcher matcher = Pattern.compile("-?\\d+").matcher(text);
    if (!matcher.find()) return fallback;
    try {
      return Integer.parseInt(matcher.group());
    } catch (NumberFormatException error) {
      return fallback;
    }
  }

  private double round2(Double value) {
    if (value == null) return 0;
    return Math.round(value * 100.0) / 100.0;
  }

  private String firstNonBlank(Object... values) {
    for (Object value : values) {
      String text = cleanCell(value);
      if (!text.isBlank()) return text;
    }
    return "";
  }

  private int firstPositiveInt(Object... values) {
    for (Object value : values) {
      int number = intValue(value, 0);
      if (number > 0) return number;
    }
    return 0;
  }

  private double firstPositiveNumber(Object... values) {
    for (Object value : values) {
      double number = numberValue(value);
      if (number > 0) return number;
    }
    return 0;
  }

  private String cleanCell(Object value) {
    if (value == null) return "";
    return String.valueOf(value).replace("\uFEFF", "").trim();
  }

  private String trim(String value, int length) {
    if (value == null) return null;
    return value.length() <= length ? value : value.substring(0, length);
  }

  private String normalizeSource(String mode) {
    return "local".equalsIgnoreCase(cleanCell(mode)) ? "LOCAL" : "AGENT";
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> modelIssueCargo(Map<String, Object> modelIssue) {
    Object directCargo = modelIssue.get("cargo");
    if (directCargo instanceof Map<?, ?> cargoRaw) {
      return new LinkedHashMap<>((Map<String, Object>) cargoRaw);
    }
    Object suggestionValue = modelIssue.get("suggestion");
    if (suggestionValue instanceof Map<?, ?> suggestionRaw) {
      Object suggestionCargo = ((Map<String, Object>) suggestionRaw).get("cargo");
      if (suggestionCargo instanceof Map<?, ?> cargoRaw) {
        return new LinkedHashMap<>((Map<String, Object>) cargoRaw);
      }
    }
    if (modelIssue.containsKey("name")
        || modelIssue.containsKey("packageInfo")
        || modelIssue.containsKey("lengthCm")
        || modelIssue.containsKey("quantity")) {
      return new LinkedHashMap<>(modelIssue);
    }
    return new LinkedHashMap<>();
  }

  private List<Map<String, Object>> mapList(Object value) {
    if (value instanceof List<?> list) {
      List<Map<String, Object>> result = new ArrayList<>();
      for (Object item : list) {
        if (item instanceof Map<?, ?> map) {
          Map<String, Object> row = new LinkedHashMap<>();
          map.forEach((key, mapValue) -> row.put(String.valueOf(key), mapValue));
          result.add(row);
        }
      }
      return result;
    }
    return List.of();
  }

  private List<String> stringList(Object value) {
    if (value instanceof List<?> list) {
      return list.stream().map(this::cleanCell).filter(text -> !text.isBlank()).toList();
    }
    String text = cleanCell(value);
    return text.isBlank() ? List.of() : List.of(text);
  }

  private Map<String, Object> mapTaskRow(ResultSet rs, boolean includePayload) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("taskNo", rs.getString("task_no"));
    row.put("sourceChannel", rs.getString("source_channel"));
    row.put("sourceName", rs.getString("source_name"));
    row.put("status", rs.getString("status"));
    row.put("rowCount", rs.getInt("row_count"));
    row.put("validCount", rs.getInt("valid_count"));
    row.put("issueCount", rs.getInt("issue_count"));
    row.put("cleanedCount", rs.getInt("cleaned_count"));
    row.put("agentNotes", rs.getString("agent_notes"));
    row.put("errorMessage", rs.getString("error_message"));
    row.put("serverEngineVersion", TEXT_RECOGNITION_ENGINE_VERSION);
    row.put("serverAdaptiveBatching", true);
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    row.put("updatedAt", stringTimestamp(rs, "updated_at"));
    row.put("finishedAt", stringTimestamp(rs, "finished_at"));
    if (includePayload) {
      List<Map<String, Object>> parsedIssues = parseJsonList(rs.getString("issues_json"));
      row.put("cleanedRows", parseJsonList(rs.getString("cleaned_json")));
      row.put("issues", parsedIssues);
      row.put("partial", parsedIssues.stream().anyMatch(issue -> isBlockingRecognitionIssueCode(issue.get("code"))));
    }
    return row;
  }

  private boolean isBlockingRecognitionIssueCode(Object code) {
    return Set.of("AGENT_OUTPUT_LIMIT", "AGENT_ROW_COVERAGE", "AGENT_REQUEST_BUDGET", "INPUT_TRUNCATED", "PALLET_DIMENSIONS_MISSING")
        .contains(cleanCell(code));
  }

  private List<Map<String, Object>> parseJsonList(String json) {
    if (json == null || json.isBlank()) return List.of();
    try {
      return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
    } catch (JsonProcessingException error) {
      return List.of();
    }
  }

  private String stringTimestamp(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }

  private static class RetryableAgentOutputException extends IllegalStateException {
    private RetryableAgentOutputException(String message) {
      super(message);
    }

    private RetryableAgentOutputException(String message, Throwable cause) {
      super(message, cause);
    }
  }

  private static final class PartialBatchCoverageException extends RetryableAgentOutputException {
    private final RecognitionResult partialResult;
    private final Set<Integer> missingRowNumbers;

    private PartialBatchCoverageException(RecognitionResult partialResult, Set<Integer> missingRowNumbers) {
      super("Agent response did not cover source rows: " + missingRowNumbers);
      this.partialResult = partialResult;
      this.missingRowNumbers = Set.copyOf(missingRowNumbers);
    }

    private RecognitionResult partialResult() {
      return partialResult;
    }

    private Set<Integer> missingRowNumbers() {
      return missingRowNumbers;
    }
  }

  private static final class AgentProtocolException extends IllegalStateException {
    private AgentProtocolException(String message) {
      super(message);
    }
  }

  private record ExcelAgentRow(int rowNumber, String line) {}

  private record FinalPackageCandidate(
      int sourceRowNumber,
      List<Integer> sourceRowNumbers,
      Map<String, Object> values,
      String metadataLine
  ) {}

  private record ExcelSheetSection(
      String sheetLine,
      List<String> metadata,
      List<ExcelAgentRow> rows,
      int headerRowNumber
  ) {}

  private record StructuredSheetSelection(
      ExcelSheetSection section,
      boolean completeCargoTable,
      boolean summaryTable,
      List<ExcelAgentRow> cargoRows
  ) {}

  private static final class ExcelSheetSectionBuilder {
    private final String sheetLine;
    private final List<String> metadata = new ArrayList<>();
    private final List<ExcelAgentRow> rows = new ArrayList<>();
    private int headerRowNumber = 1;

    private ExcelSheetSectionBuilder(String sheetLine) {
      this.sheetLine = sheetLine;
    }

    private ExcelSheetSection build() {
      return new ExcelSheetSection(sheetLine, List.copyOf(metadata), List.copyOf(rows), headerRowNumber);
    }
  }

  private record ExcelAgentBatch(
      List<String> preamble,
      ExcelSheetSection section,
      List<ExcelAgentRow> targetRows
  ) {
    private ExcelAgentBatch withTargetRows(List<ExcelAgentRow> rows) {
      return new ExcelAgentBatch(preamble, section, rows);
    }
  }

  private record BatchRecognitionResult(List<RecognitionResult> results, int requestCount) {}

  private record IndexedBatchRecognitionResult(int index, BatchRecognitionResult result) {}

  private static final class AgentRequestBudget {
    private final int limit;
    private final long deadlineNanos;
    private int used;

    private AgentRequestBudget(int limit, Duration deadline) {
      this.limit = Math.max(1, limit);
      this.deadlineNanos = System.nanoTime() + Math.max(1, deadline.toNanos());
    }

    private synchronized boolean tryAcquire() {
      if (used >= limit || System.nanoTime() >= deadlineNanos) return false;
      used += 1;
      return true;
    }
  }

  private record ParsedCargo(
      boolean matched,
      String text,
      Map<String, Object> cargo,
      List<String> errors
  ) {}

  private record DimensionParts(
      double lengthCm,
      double widthCm,
      double heightCm
  ) {}

  private record RecognitionResult(
      int rowCount,
      int validCount,
      int issueCount,
      List<Map<String, Object>> cleanedRows,
      List<Map<String, Object>> issues,
      String agentNotes
  ) {
    RecognitionResult withNotes(String notes) {
      return new RecognitionResult(rowCount, validCount, issueCount, cleanedRows, issues, notes);
    }
  }
}
