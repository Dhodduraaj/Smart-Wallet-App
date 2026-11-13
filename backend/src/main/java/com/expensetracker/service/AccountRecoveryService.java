package com.expensetracker.service;

import com.expensetracker.dto.AccountRecoveryRequest;
import com.expensetracker.dto.AuthResponse;
import com.expensetracker.dto.BatchSyncRequest;
import com.expensetracker.dto.BatchSyncResponse;
import com.expensetracker.entity.User;
import com.expensetracker.entity.UserBackup;
import com.expensetracker.repository.UserBackupRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccountRecoveryService {

    private final UserRepository userRepository;
    private final UserBackupRepository userBackupRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    private static final ZoneId IST_ZONE = ZoneId.of("Asia/Kolkata");

    private boolean isPostgres = false;
    private boolean hasAccountsTable = false;
    private boolean hasExpensesTable = false;
    private boolean hasIncomesTable = false;
    private boolean hasRemindersTable = false;
    private boolean hasTombstonesTable = false;

    @PostConstruct
    public void init() {
        try {
            if (jdbcTemplate.getDataSource() != null) {
                try (Connection conn = jdbcTemplate.getDataSource().getConnection()) {
                    DatabaseMetaData meta = conn.getMetaData();
                    String prod = meta.getDatabaseProductName();
                    isPostgres = prod != null && prod.toLowerCase().contains("postgres");
                    hasAccountsTable = checkTable(meta, "accounts");
                    hasExpensesTable = checkTable(meta, "expenses");
                    hasIncomesTable = checkTable(meta, "incomes");
                    hasRemindersTable = checkTable(meta, "upcoming_payments");
                    hasTombstonesTable = checkTable(meta, "sync_tombstones");

                    if (isPostgres && !hasTombstonesTable) {
                        try {
                            jdbcTemplate.execute(
                                "CREATE TABLE IF NOT EXISTS sync_tombstones (" +
                                "id VARCHAR(64) NOT NULL, " +
                                "entity_type VARCHAR(32) NOT NULL, " +
                                "user_id UUID NOT NULL, " +
                                "deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
                                "PRIMARY KEY (id, user_id))"
                            );
                            jdbcTemplate.execute(
                                "CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user ON sync_tombstones(user_id, deleted_at DESC)"
                            );
                            hasTombstonesTable = true;
                            log.info("Created sync_tombstones table and index in PostgreSQL.");
                        } catch (Exception e) {
                            log.warn("Could not create sync_tombstones table: {}", e.getMessage());
                        }
                    }

                    log.info("AccountRecoveryService initialized: isPostgres={}, hasAccounts={}, hasExpenses={}, hasIncomes={}, hasTombstones={}",
                            isPostgres, hasAccountsTable, hasExpensesTable, hasIncomesTable, hasTombstonesTable);

                    if (hasAccountsTable) {
                        reconcileAndConstrainAccounts();
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not check metadata during AccountRecoveryService init: {}", e.getMessage());
        }
    }

    private boolean checkTable(DatabaseMetaData meta, String tableName) {
        try {
            try (ResultSet rs = meta.getTables(null, null, tableName, new String[]{"TABLE"})) {
                if (rs.next()) return true;
            }
            try (ResultSet rs = meta.getTables(null, null, tableName.toUpperCase(), new String[]{"TABLE"})) {
                if (rs.next()) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private void recordTombstone(String entityId, String entityType, UUID userId) {
        if (!isPostgres || !hasTombstonesTable || entityId == null || userId == null) return;
        try {
            jdbcTemplate.update(
                    "INSERT INTO sync_tombstones (id, entity_type, user_id, deleted_at) " +
                    "VALUES (?, ?, ?, ?) " +
                    "ON CONFLICT (id, user_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at",
                    entityId.trim().toLowerCase(), entityType.toUpperCase(), userId, Timestamp.from(Instant.now())
            );
            log.info("Recorded tombstone for {} ID: {} user: {}", entityType, entityId, userId);
        } catch (Exception e) {
            log.warn("Failed to record tombstone for entity {}: {}", entityId, e.getMessage());
        }
    }

    private boolean isTombstoned(String entityId, UUID userId) {
        if (!isPostgres || !hasTombstonesTable || entityId == null || userId == null) return false;
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sync_tombstones WHERE id = ? AND user_id = ?",
                    Integer.class, entityId.trim().toLowerCase(), userId
            );
            return count != null && count > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private String formatIsoTimestamp(Object timestampObj) {
        if (timestampObj == null) return null;
        if (timestampObj instanceof Timestamp) {
            return ((Timestamp) timestampObj).toInstant().toString();
        }
        if (timestampObj instanceof java.util.Date) {
            return ((java.util.Date) timestampObj).toInstant().toString();
        }
        try {
            String s = String.valueOf(timestampObj).trim();
            if (s.isEmpty()) return null;
            if (s.endsWith("Z") || s.matches(".*[+-]\\d{2}:?\\d{2}$")) {
                return s;
            }
            s = s.replace(' ', 'T');
            if (!s.endsWith("Z")) {
                s += "Z";
            }
            return Instant.parse(s).toString();
        } catch (Exception e) {
            return String.valueOf(timestampObj);
        }
    }

    /**
     * Fast, Decoupled Account Recovery:
     * Authenticates existing user or safely registers local offline user in Neon.
     * Returns 30-day JWT session immediately (<250ms) without waiting for historical uploads.
     */
    public ResponseEntity<?> recoverAccountOnly(AccountRecoveryRequest request) {
        String normalizedEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";
        String rawPassword = request.getPassword() != null ? request.getPassword() : "";

        if (normalizedEmail.isEmpty() || rawPassword.isEmpty() || rawPassword.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("message", "Valid email and password (minimum 6 characters) are required"));
        }

        Optional<User> existingUserOpt = userRepository.findByEmail(normalizedEmail);
        User user;

        if (existingUserOpt.isPresent()) {
            user = existingUserOpt.get();
            if (user.getPassword() != null && !user.getPassword().isBlank()) {
                if (!passwordEncoder.matches(rawPassword, user.getPassword())) {
                    log.warn("Account recovery rejected: Password mismatch for existing cloud user {}", normalizedEmail);
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                            .body(Map.of("message", "Incorrect password for existing cloud account"));
                }
                log.info("Recovery verified existing cloud password for {}", normalizedEmail);
            } else {
                user.setPassword(passwordEncoder.encode(rawPassword));
                if (request.getFullName() != null && !request.getFullName().isBlank()) {
                    user.setFullName(request.getFullName().trim());
                }
                user = userRepository.save(user);
                log.info("Initialized password for legacy cloud user {} during recovery", normalizedEmail);
            }
        } else {
            UUID userId = null;
            if (request.getLocalUserId() != null && !request.getLocalUserId().isBlank()) {
                try {
                    UUID requestedId = UUID.fromString(request.getLocalUserId().trim());
                    if (!userRepository.existsById(requestedId)) {
                        userId = requestedId;
                    }
                } catch (Exception ignored) {}
            }
            if (userId == null) {
                userId = UUID.randomUUID();
            }

            user = User.builder()
                    .id(userId)
                    .email(normalizedEmail)
                    .fullName(request.getFullName() != null && !request.getFullName().isBlank() ? request.getFullName().trim() : normalizedEmail.split("@")[0])
                    .password(passwordEncoder.encode(rawPassword))
                    .onboardingCompleted(true)
                    .build();
            user = userRepository.save(user);
            log.info("Created cloud user during fast recovery: {} with ID: {}", normalizedEmail, user.getId());
        }

        // Generate 30-day JWT session token immediately
        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getFullName());

        return ResponseEntity.ok(AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(true)
                .message("Account successfully recovered. Ready for offline-first usage.")
                .build());
    }

    /**
     * Backward-compatible recoverAndSync endpoint that performs fast authentication
     * and persists snapshot without blocking client indefinitely.
     */
    public ResponseEntity<?> recoverAndSync(AccountRecoveryRequest request) {
        ResponseEntity<?> authRes = recoverAccountOnly(request);
        if (!authRes.getStatusCode().is2xxSuccessful()) {
            return authRes;
        }

        AuthResponse auth = (AuthResponse) authRes.getBody();
        if (auth == null || auth.getUserId() == null) {
            return authRes;
        }

        UUID userId = auth.getUserId();
        Map<String, Object> payload = request.getPayload() != null ? request.getPayload() : new HashMap<>();

        // Save JSON backup in user_backup table
        try {
            Map<String, Object> backupWrapper = new HashMap<>(payload);
            backupWrapper.put("localUserId", userId.toString());
            backupWrapper.put("userId", userId.toString());
            backupWrapper.put("email", auth.getEmail());
            backupWrapper.put("syncedAt", Instant.now().toString());

            String jsonPayload = objectMapper.writeValueAsString(backupWrapper);
            UserBackup backup = userBackupRepository.findById(userId)
                    .orElse(new UserBackup());
            backup.setUserId(userId);
            backup.setPayload(jsonPayload);
            backup.setLastSync(LocalDateTime.now());
            userBackupRepository.save(backup);
        } catch (Exception e) {
            log.warn("Failed to save background JSON snapshot: {}", e.getMessage());
        }

        // Relational synchronization (safe, limited)
        Map<String, Integer> syncCounts = new LinkedHashMap<>();
        syncCounts.put("accounts", 0);
        syncCounts.put("expenses", 0);
        syncCounts.put("incomes", 0);
        syncCounts.put("transfers", 0);
        syncCounts.put("reminders", 0);
        syncCounts.put("people", extractList(payload, "people").size());
        syncCounts.put("peopleLedger", extractList(payload, "peopleLedger").size());

        try {
            syncRelationalTables(userId, payload, syncCounts);
        } catch (Exception e) {
            log.warn("Relational sync encountered issue during recovery: {}", e.getMessage());
        }

        auth.setSyncedCounts(syncCounts);
        return ResponseEntity.ok(auth);
    }

    /**
     * Process Batch Operations from the Persistent Sync Queue
     * Atomically upserts/deletes records in relational tables, maintains transactional
     * balance consistency on accounts, and updates backup snapshot.
     */
    @Transactional
    public ResponseEntity<?> processBatchSync(BatchSyncRequest request) {
        if (request == null || request.getUserId() == null || request.getOperations() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "userId and operations are required"));
        }

        UUID userId = request.getUserId();
        List<String> processedIds = new ArrayList<>();
        UUID defaultCashId = ensureDefaultCashAccount(userId);

        for (BatchSyncRequest.SyncOperationDto op : request.getOperations()) {
            if (op == null || op.getId() == null || op.getEntityType() == null) continue;

            try {
                String entityType = op.getEntityType().toUpperCase();
                String opType = op.getOperationType() != null ? op.getOperationType().toUpperCase() : "CREATE";
                Map<String, Object> payload = op.getPayload() != null ? op.getPayload() : Map.of();
                UUID entityId = parseUUID(op.getEntityId());
                if (entityId == null && payload.containsKey("id")) {
                    entityId = parseUUID(payload.get("id"));
                }
                if (entityId == null) entityId = UUID.randomUUID();

                if ("ACCOUNT".equals(entityType)) {
                    if ("DELETE".equals(opType)) {
                        if (hasAccountsTable && isPostgres) {
                            // Default Cash account cannot be deleted
                            jdbcTemplate.update("DELETE FROM accounts WHERE id = ? AND user_id = ? AND account_type <> 'SYSTEM' AND LOWER(account_name) <> 'cash'", entityId, userId);
                        }
                    } else {
                        String accName = getString(payload.get("accountName"), "Cash");
                        String accType = getString(payload.get("accountType"), "CUSTOM");
                        BigDecimal balance = getBigDecimal(payload.get("currentBalance"), BigDecimal.ZERO);
                        Timestamp createdAt = parseTimestamp(payload.get("createdAt"));

                        boolean isCashOrSystem = "SYSTEM".equalsIgnoreCase(accType) || "cash".equalsIgnoreCase(accName);

                        if (hasAccountsTable && isPostgres) {
                            if (isCashOrSystem) {
                                // Idempotent: Update canonical Cash account rather than inserting duplicate
                                UUID canonicalId = ensureDefaultCashAccount(userId);
                                jdbcTemplate.update(
                                        "UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?",
                                        balance, canonicalId, userId
                                );
                            } else {
                                jdbcTemplate.update(
                                        "INSERT INTO accounts (id, account_name, account_type, created_at, current_balance, user_id) " +
                                        "VALUES (?, ?, ?, ?, ?, ?) " +
                                        "ON CONFLICT (id) DO UPDATE SET " +
                                        "account_name = EXCLUDED.account_name, " +
                                        "account_type = EXCLUDED.account_type, " +
                                        "current_balance = EXCLUDED.current_balance",
                                        entityId, accName, accType, createdAt, balance, userId
                                );
                            }
                        }
                    }
                } else if ("EXPENSE".equals(entityType)) {
                    if ("DELETE".equals(opType)) {
                        recordTombstone(entityId.toString(), "EXPENSE", userId);
                        if (hasExpensesTable && isPostgres) {
                            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                                    "SELECT amount, account_id FROM expenses WHERE id = ? AND user_id = ?",
                                    entityId, userId
                            );
                            if (!existing.isEmpty()) {
                                BigDecimal oldAmount = getBigDecimal(existing.get(0).get("amount"), BigDecimal.ZERO);
                                UUID oldAccId = parseUUID(existing.get(0).get("account_id"));
                                jdbcTemplate.update("DELETE FROM expenses WHERE id = ? AND user_id = ?", entityId, userId);
                                if (hasAccountsTable && oldAccId != null) {
                                    jdbcTemplate.update(
                                            "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                            oldAmount, oldAccId, userId
                                    );
                                }
                            }
                        }
                    } else {
                        if (isTombstoned(entityId.toString(), userId)) {
                            log.info("processBatchSync skipping tombstoned expense ID {}", entityId);
                            processedIds.add(op.getId());
                            continue;
                        }
                        BigDecimal amount = getBigDecimal(payload.get("amount"), BigDecimal.ZERO);
                        String category = getString(payload.get("category"), "Others");
                        String description = getString(payload.get("description"), "Expense");
                        Date expenseDate = parseSqlDate(payload.get("expenseDate"), payload.get("transactionDateTime"), payload.get("createdAt"));
                        String notes = getString(payload.get("notes"), null);
                        String paymentMode = getString(payload.get("paymentMode"), "CASH");
                        UUID accId = parseUUID(payload.get("accountId"));
                        if (accId == null) accId = defaultCashId;

                        // Ensure target account exists
                        if (hasAccountsTable && isPostgres) {
                            List<UUID> matched = jdbcTemplate.query(
                                    "SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1",
                                    (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                                    accId, userId
                            );
                            if (matched.isEmpty()) {
                                accId = defaultCashId;
                            }
                        }

                        Timestamp createdAt = parseTimestamp(payload.get("createdAt"));

                        if (hasExpensesTable && isPostgres) {
                            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                                    "SELECT amount, account_id FROM expenses WHERE id = ? AND user_id = ?",
                                    entityId, userId
                            );

                            if (existing.isEmpty()) {
                                // Insert new expense
                                jdbcTemplate.update(
                                        "INSERT INTO expenses (id, amount, category, created_at, description, expense_date, notes, payment_mode, account_id, user_id) " +
                                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                        entityId, amount, category, createdAt, description, expenseDate, notes, paymentMode, accId, userId
                                );
                                // Deduct from account balance atomically
                                if (hasAccountsTable) {
                                    jdbcTemplate.update(
                                            "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                            amount, accId, userId
                                    );
                                }
                            } else {
                                BigDecimal oldAmount = getBigDecimal(existing.get(0).get("amount"), BigDecimal.ZERO);
                                UUID oldAccId = parseUUID(existing.get(0).get("account_id"));

                                jdbcTemplate.update(
                                        "UPDATE expenses SET amount = ?, category = ?, description = ?, expense_date = ?, notes = ?, payment_mode = ?, account_id = ? " +
                                        "WHERE id = ? AND user_id = ?",
                                        amount, category, description, expenseDate, notes, paymentMode, accId, entityId, userId
                                );

                                if (hasAccountsTable) {
                                    if (oldAccId != null && oldAccId.equals(accId)) {
                                        BigDecimal diff = amount.subtract(oldAmount);
                                        if (diff.compareTo(BigDecimal.ZERO) != 0) {
                                            jdbcTemplate.update(
                                                    "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                                    diff, accId, userId
                                            );
                                        }
                                    } else {
                                        if (oldAccId != null) {
                                            jdbcTemplate.update(
                                                    "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                                    oldAmount, oldAccId, userId
                                            );
                                        }
                                        jdbcTemplate.update(
                                                "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                                amount, accId, userId
                                        );
                                    }
                                }
                            }
                        }
                    }
                } else if ("INCOME".equals(entityType)) {
                    if ("DELETE".equals(opType)) {
                        recordTombstone(entityId.toString(), "INCOME", userId);
                        if (hasIncomesTable && isPostgres) {
                            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                                    "SELECT amount, account_id FROM incomes WHERE id = ? AND user_id = ?",
                                    entityId, userId
                            );
                            if (!existing.isEmpty()) {
                                BigDecimal oldAmount = getBigDecimal(existing.get(0).get("amount"), BigDecimal.ZERO);
                                UUID oldAccId = parseUUID(existing.get(0).get("account_id"));
                                jdbcTemplate.update("DELETE FROM incomes WHERE id = ? AND user_id = ?", entityId, userId);
                                if (hasAccountsTable && oldAccId != null) {
                                    jdbcTemplate.update(
                                            "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                            oldAmount, oldAccId, userId
                                    );
                                }
                            }
                        }
                    } else {
                        if (isTombstoned(entityId.toString(), userId)) {
                            log.info("processBatchSync skipping tombstoned income ID {}", entityId);
                            processedIds.add(op.getId());
                            continue;
                        }
                        BigDecimal amount = getBigDecimal(payload.get("amount"), BigDecimal.ZERO);
                        String description = getString(payload.get("description"), "Income");
                        Date incomeDate = parseSqlDate(payload.get("incomeDate"), payload.get("transactionDateTime"), payload.get("createdAt"));
                        String notes = getString(payload.get("notes"), null);
                        UUID accId = parseUUID(payload.get("accountId"));
                        if (accId == null) accId = defaultCashId;

                        if (hasAccountsTable && isPostgres) {
                            List<UUID> matched = jdbcTemplate.query(
                                    "SELECT id FROM accounts WHERE id = ? AND user_id = ? LIMIT 1",
                                    (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                                    accId, userId
                            );
                            if (matched.isEmpty()) {
                                accId = defaultCashId;
                            }
                        }

                        Timestamp createdAt = parseTimestamp(payload.get("createdAt"));

                        if (hasIncomesTable && isPostgres) {
                            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                                    "SELECT amount, account_id FROM incomes WHERE id = ? AND user_id = ?",
                                    entityId, userId
                            );

                            if (existing.isEmpty()) {
                                jdbcTemplate.update(
                                        "INSERT INTO incomes (id, amount, created_at, description, income_date, notes, account_id, user_id) " +
                                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                        entityId, amount, createdAt, description, incomeDate, notes, accId, userId
                                );
                                if (hasAccountsTable) {
                                    jdbcTemplate.update(
                                            "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                            amount, accId, userId
                                    );
                                }
                            } else {
                                BigDecimal oldAmount = getBigDecimal(existing.get(0).get("amount"), BigDecimal.ZERO);
                                UUID oldAccId = parseUUID(existing.get(0).get("account_id"));

                                jdbcTemplate.update(
                                        "UPDATE incomes SET amount = ?, description = ?, income_date = ?, notes = ?, account_id = ? " +
                                        "WHERE id = ? AND user_id = ?",
                                        amount, description, incomeDate, notes, accId, entityId, userId
                                );

                                if (hasAccountsTable) {
                                    if (oldAccId != null && oldAccId.equals(accId)) {
                                        BigDecimal diff = amount.subtract(oldAmount);
                                        if (diff.compareTo(BigDecimal.ZERO) != 0) {
                                            jdbcTemplate.update(
                                                    "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                                    diff, accId, userId
                                            );
                                        }
                                    } else {
                                        if (oldAccId != null) {
                                            jdbcTemplate.update(
                                                    "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                                    oldAmount, oldAccId, userId
                                            );
                                        }
                                        jdbcTemplate.update(
                                                "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                                amount, accId, userId
                                        );
                                    }
                                }
                            }
                        }
                    }
                } else if ("TRANSFER".equals(entityType)) {
                    BigDecimal amount = getBigDecimal(payload.get("amount"), BigDecimal.ZERO);
                    UUID fromAccId = parseUUID(payload.get("fromAccountId"));
                    UUID toAccId = parseUUID(payload.get("toAccountId"));

                    if (hasAccountsTable && isPostgres && fromAccId != null && toAccId != null) {
                        jdbcTemplate.update(
                                "UPDATE accounts SET current_balance = current_balance - ? WHERE id = ? AND user_id = ?",
                                amount, fromAccId, userId
                        );
                        jdbcTemplate.update(
                                "UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                                amount, toAccId, userId
                        );
                    }
                } else if ("REMINDER".equals(entityType)) {
                    if ("DELETE".equals(opType)) {
                        recordTombstone(entityId.toString(), "REMINDER", userId);
                        if (hasRemindersTable && isPostgres) {
                            jdbcTemplate.update("DELETE FROM upcoming_payments WHERE id = ? AND user_id = ?", entityId, userId);
                        }
                    } else {
                        if (isTombstoned(entityId.toString(), userId)) {
                            log.info("processBatchSync skipping tombstoned reminder ID {}", entityId);
                            processedIds.add(op.getId());
                            continue;
                        }
                        String title = getString(payload.get("title"), "Reminder");
                        BigDecimal amount = getBigDecimal(payload.get("amount"), BigDecimal.ZERO);
                        Date dueDate = parseSqlDate(payload.get("dueDate"), null, null);
                        Date reminderDate = parseSqlDate(payload.get("reminderDate"), null, null);
                        String desc = getString(payload.get("description"), "");
                        boolean completed = Boolean.TRUE.equals(payload.get("completed"));
                        boolean notified = Boolean.TRUE.equals(payload.get("reminderNotified"));
                        Timestamp createdAt = parseTimestamp(payload.get("createdAt"));

                        if (hasRemindersTable && isPostgres) {
                            jdbcTemplate.update(
                                    "INSERT INTO upcoming_payments (id, amount, completed, created_at, description, due_date, reminder_date, reminder_notified, title, user_id) " +
                                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                                    "ON CONFLICT (id) DO UPDATE SET " +
                                    "amount = EXCLUDED.amount, " +
                                    "completed = EXCLUDED.completed, " +
                                    "description = EXCLUDED.description, " +
                                    "due_date = EXCLUDED.due_date, " +
                                    "reminder_date = EXCLUDED.reminder_date, " +
                                    "reminder_notified = EXCLUDED.reminder_notified, " +
                                    "title = EXCLUDED.title",
                                    entityId, amount, completed, createdAt, desc, dueDate, reminderDate, notified, title, userId
                            );
                        }
                    }
                }

                processedIds.add(op.getId());
            } catch (Exception e) {
                log.warn("Failed to process sync operation: {}", op.getId(), e);
            }
        }

        return ResponseEntity.ok(BatchSyncResponse.builder()
                .status("SUCCESS")
                .processedIds(processedIds)
                .processedCount(processedIds.size())
                .message("Processed " + processedIds.size() + " operations")
                .build());
    }

    public void reconcileAndConstrainAccounts() {
        if (!hasAccountsTable) return;
        try {
            log.info("Starting Cash account reconciliation and deduplication...");
            List<UUID> usersWithDupes = jdbcTemplate.query(
                    "SELECT user_id FROM accounts " +
                    "WHERE LOWER(account_name) = 'cash' OR account_type = 'SYSTEM' " +
                    "GROUP BY user_id HAVING count(*) > 1",
                    (rs, rowNum) -> UUID.fromString(rs.getString("user_id"))
            );

            log.info("Found {} user(s) with multiple Cash accounts needing reconciliation", usersWithDupes.size());

            for (UUID userId : usersWithDupes) {
                reconcileUserCashAccounts(userId);
            }

            if (isPostgres) {
                try {
                    jdbcTemplate.execute(
                            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_default_cash " +
                            "ON accounts (user_id) " +
                            "WHERE account_type = 'SYSTEM' OR LOWER(account_name) = 'cash'"
                    );
                    log.info("PostgreSQL unique index uq_user_default_cash verified.");
                } catch (Exception e) {
                    log.warn("Could not create unique index uq_user_default_cash: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Error during account reconciliation: {}", e.getMessage());
        }
    }

    public void reconcileUserCashAccounts(UUID userId) {
        if (!hasAccountsTable) return;
        try {
            List<Map<String, Object>> candidates = jdbcTemplate.queryForList(
                    "SELECT id, account_name, account_type, current_balance, created_at FROM accounts " +
                    "WHERE user_id = ? AND (LOWER(account_name) = 'cash' OR account_type = 'SYSTEM')",
                    userId
            );

            if (candidates.size() <= 1) return;

            UUID canonicalId = null;
            long bestScore = -1;
            Timestamp oldestCreatedAt = null;

            for (Map<String, Object> c : candidates) {
                UUID id = UUID.fromString(String.valueOf(c.get("id")));
                BigDecimal bal = getBigDecimal(c.get("current_balance"), BigDecimal.ZERO);
                Timestamp createdAt = null;
                Object rawCreated = c.get("created_at");
                if (rawCreated instanceof Timestamp) {
                    createdAt = (Timestamp) rawCreated;
                }

                int expCount = 0;
                int incCount = 0;
                if (hasExpensesTable) {
                    Integer count = jdbcTemplate.queryForObject(
                            "SELECT COUNT(*) FROM expenses WHERE account_id = ? AND user_id = ?",
                            Integer.class, id, userId);
                    if (count != null) expCount = count;
                }
                if (hasIncomesTable) {
                    Integer count = jdbcTemplate.queryForObject(
                            "SELECT COUNT(*) FROM incomes WHERE account_id = ? AND user_id = ?",
                            Integer.class, id, userId);
                    if (count != null) incCount = count;
                }

                long score = (expCount + incCount) * 1000L + (bal.compareTo(BigDecimal.ZERO) != 0 ? 100L : 0L);

                if (score > bestScore || (score == bestScore && (oldestCreatedAt == null || (createdAt != null && createdAt.before(oldestCreatedAt))))) {
                    bestScore = score;
                    canonicalId = id;
                    oldestCreatedAt = createdAt;
                }
            }

            if (canonicalId == null) return;

            log.info("Reconciling user {} Cash accounts: selected canonical ID {}", userId, canonicalId);

            for (Map<String, Object> c : candidates) {
                UUID dupId = UUID.fromString(String.valueOf(c.get("id")));
                if (dupId.equals(canonicalId)) continue;

                BigDecimal dupBal = getBigDecimal(c.get("current_balance"), BigDecimal.ZERO);
                BigDecimal dupExpenses = BigDecimal.ZERO;
                BigDecimal dupIncomes = BigDecimal.ZERO;

                if (hasExpensesTable) {
                    BigDecimal sumExp = jdbcTemplate.queryForObject(
                            "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE account_id = ? AND user_id = ?",
                            BigDecimal.class, dupId, userId);
                    if (sumExp != null) dupExpenses = sumExp;
                    jdbcTemplate.update("UPDATE expenses SET account_id = ? WHERE account_id = ? AND user_id = ?",
                            canonicalId, dupId, userId);
                }

                if (hasIncomesTable) {
                    BigDecimal sumInc = jdbcTemplate.queryForObject(
                            "SELECT COALESCE(SUM(amount), 0) FROM incomes WHERE account_id = ? AND user_id = ?",
                            BigDecimal.class, dupId, userId);
                    if (sumInc != null) dupIncomes = sumInc;
                    jdbcTemplate.update("UPDATE incomes SET account_id = ? WHERE account_id = ? AND user_id = ?",
                            canonicalId, dupId, userId);
                }

                // If duplicate had transactions, apply net delta to canonical
                if (dupExpenses.compareTo(BigDecimal.ZERO) > 0 || dupIncomes.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal netDelta = dupIncomes.subtract(dupExpenses);
                    jdbcTemplate.update("UPDATE accounts SET current_balance = current_balance + ? WHERE id = ? AND user_id = ?",
                            netDelta, canonicalId, userId);
                } else if (dupBal.compareTo(BigDecimal.ZERO) != 0) {
                    BigDecimal canonBal = getBigDecimal(jdbcTemplate.queryForObject(
                            "SELECT current_balance FROM accounts WHERE id = ? AND user_id = ?",
                            BigDecimal.class, canonicalId, userId), BigDecimal.ZERO);
                    if (canonBal.compareTo(BigDecimal.ZERO) == 0) {
                        jdbcTemplate.update("UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?",
                                dupBal, canonicalId, userId);
                    }
                }

                jdbcTemplate.update("DELETE FROM accounts WHERE id = ? AND user_id = ?", dupId, userId);
                log.info("Safely deleted duplicate Cash account {} for user {}", dupId, userId);
            }

            jdbcTemplate.update("UPDATE accounts SET account_name = 'Cash', account_type = 'SYSTEM' WHERE id = ? AND user_id = ?",
                    canonicalId, userId);

        } catch (Exception e) {
            log.warn("Failed to reconcile Cash accounts for user {}: {}", userId, e.getMessage());
        }
    }

    public UUID ensureDefaultCashAccount(UUID userId) {
        if (!hasAccountsTable) return UUID.randomUUID();
        try {
            List<UUID> existing = jdbcTemplate.query(
                    "SELECT id FROM accounts WHERE user_id = ? AND (account_type = 'SYSTEM' OR LOWER(account_name) = 'cash') " +
                    "ORDER BY ABS(current_balance) DESC, created_at ASC LIMIT 1",
                    (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                    userId
            );
            if (!existing.isEmpty()) {
                return existing.get(0);
            }
            UUID cashId = UUID.randomUUID();
            if (isPostgres) {
                jdbcTemplate.update(
                        "INSERT INTO accounts (id, account_name, account_type, created_at, current_balance, user_id) " +
                        "VALUES (?, 'Cash', 'SYSTEM', ?, 0, ?) ON CONFLICT DO NOTHING",
                        cashId, Timestamp.from(Instant.now()), userId
                );
            } else {
                jdbcTemplate.update(
                        "INSERT INTO accounts (id, account_name, account_type, created_at, current_balance, user_id) " +
                        "VALUES (?, 'Cash', 'SYSTEM', ?, 0, ?)",
                        cashId, Timestamp.from(Instant.now()), userId
                );
            }
            List<UUID> confirmed = jdbcTemplate.query(
                    "SELECT id FROM accounts WHERE user_id = ? AND (account_type = 'SYSTEM' OR LOWER(account_name) = 'cash') LIMIT 1",
                    (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                    userId
            );
            return !confirmed.isEmpty() ? confirmed.get(0) : cashId;
        } catch (Exception e) {
            log.warn("Could not ensure default cash account for user {}", userId, e);
            return UUID.randomUUID();
        }
    }

    @SuppressWarnings("unchecked")
    @Transactional
    public void syncRelationalTables(UUID userId, Map<String, Object> payload, Map<String, Integer> syncCounts) {
        List<Map<String, Object>> accounts = extractList(payload, "accounts");
        Set<UUID> validAccountIds = new HashSet<>();
        Map<UUID, UUID> remappedAccountIds = new HashMap<>();

        UUID defaultCashAccountId = ensureDefaultCashAccount(userId);
        validAccountIds.add(defaultCashAccountId);

        for (Map<String, Object> acc : accounts) {
            try {
                UUID accId = parseUUID(acc.get("id"));
                if (accId == null) accId = UUID.randomUUID();

                String accName = getString(acc.get("accountName"), "Cash");
                String accType = getString(acc.get("accountType"), "CUSTOM");
                BigDecimal balance = getBigDecimal(acc.get("currentBalance"), BigDecimal.ZERO);
                Timestamp createdAt = parseTimestamp(acc.get("createdAt"));

                boolean isCashOrSystem = "SYSTEM".equalsIgnoreCase(accType) || "cash".equalsIgnoreCase(accName);

                if (isCashOrSystem) {
                    remappedAccountIds.put(accId, defaultCashAccountId);
                    validAccountIds.add(defaultCashAccountId);

                    if (hasAccountsTable && balance.compareTo(BigDecimal.ZERO) != 0) {
                        BigDecimal currentCanonBal = getBigDecimal(jdbcTemplate.queryForObject(
                                "SELECT current_balance FROM accounts WHERE id = ? AND user_id = ?",
                                BigDecimal.class, defaultCashAccountId, userId), BigDecimal.ZERO);
                        if (currentCanonBal.compareTo(BigDecimal.ZERO) == 0) {
                            jdbcTemplate.update(
                                    "UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?",
                                    balance, defaultCashAccountId, userId
                            );
                        }
                    }
                    syncCounts.put("accounts", syncCounts.get("accounts") + 1);
                    continue;
                }

                if (hasAccountsTable && isPostgres) {
                    jdbcTemplate.update(
                            "INSERT INTO accounts (id, account_name, account_type, created_at, current_balance, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO UPDATE SET " +
                            "account_name = EXCLUDED.account_name, " +
                            "account_type = EXCLUDED.account_type, " +
                            "current_balance = EXCLUDED.current_balance",
                            accId, accName, accType, createdAt, balance, userId
                    );
                }

                validAccountIds.add(accId);
                syncCounts.put("accounts", syncCounts.get("accounts") + 1);
            } catch (Exception e) {
                log.warn("Failed to sync account: {}", acc, e);
            }
        }

        List<Map<String, Object>> expenses = extractList(payload, "expenses");
        for (Map<String, Object> exp : expenses) {
            try {
                UUID expId = parseUUID(exp.get("id"));
                if (expId == null) expId = UUID.randomUUID();

                if (isTombstoned(expId.toString(), userId)) {
                    log.info("syncRelationalTables skipping tombstoned expense ID {}", expId);
                    continue;
                }

                BigDecimal amount = getBigDecimal(exp.get("amount"), BigDecimal.ZERO);
                String category = getString(exp.get("category"), "Others");
                String description = getString(exp.get("description"), "Expense");
                Date expenseDate = parseSqlDate(exp.get("expenseDate"), exp.get("transactionDateTime"), exp.get("createdAt"));
                String notes = getString(exp.get("notes"), null);
                String paymentMode = getString(exp.get("paymentMode"), "CASH");

                UUID accId = parseUUID(exp.get("accountId"));
                if (accId != null && remappedAccountIds.containsKey(accId)) {
                    accId = remappedAccountIds.get(accId);
                }
                if (accId == null || !validAccountIds.contains(accId)) {
                    accId = defaultCashAccountId;
                }

                Timestamp createdAt = parseTimestamp(exp.get("createdAt"));

                if (hasExpensesTable && isPostgres) {
                    jdbcTemplate.update(
                            "INSERT INTO expenses (id, amount, category, created_at, description, expense_date, notes, payment_mode, account_id, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO UPDATE SET " +
                            "amount = EXCLUDED.amount, " +
                            "category = EXCLUDED.category, " +
                            "description = EXCLUDED.description, " +
                            "expense_date = EXCLUDED.expense_date, " +
                            "notes = EXCLUDED.notes, " +
                            "payment_mode = EXCLUDED.payment_mode, " +
                            "account_id = EXCLUDED.account_id",
                            expId, amount, category, createdAt, description, expenseDate, notes, paymentMode, accId, userId
                    );
                }

                syncCounts.put("expenses", syncCounts.get("expenses") + 1);
            } catch (Exception e) {
                log.warn("Failed to sync expense: {}", exp, e);
            }
        }

        List<Map<String, Object>> incomes = extractList(payload, "incomes");
        for (Map<String, Object> inc : incomes) {
            try {
                UUID incId = parseUUID(inc.get("id"));
                if (incId == null) incId = UUID.randomUUID();

                if (isTombstoned(incId.toString(), userId)) {
                    log.info("syncRelationalTables skipping tombstoned income ID {}", incId);
                    continue;
                }

                BigDecimal amount = getBigDecimal(inc.get("amount"), BigDecimal.ZERO);
                String description = getString(inc.get("description"), "Income");
                Date incomeDate = parseSqlDate(inc.get("incomeDate"), inc.get("transactionDateTime"), inc.get("createdAt"));
                String notes = getString(inc.get("notes"), null);

                UUID accId = parseUUID(inc.get("accountId"));
                if (accId != null && remappedAccountIds.containsKey(accId)) {
                    accId = remappedAccountIds.get(accId);
                }
                if (accId == null || !validAccountIds.contains(accId)) {
                    accId = defaultCashAccountId;
                }

                Timestamp createdAt = parseTimestamp(inc.get("createdAt"));

                if (hasIncomesTable && isPostgres) {
                    jdbcTemplate.update(
                            "INSERT INTO incomes (id, amount, created_at, description, income_date, notes, account_id, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO UPDATE SET " +
                            "amount = EXCLUDED.amount, " +
                            "description = EXCLUDED.description, " +
                            "income_date = EXCLUDED.income_date, " +
                            "notes = EXCLUDED.notes, " +
                            "account_id = EXCLUDED.account_id",
                            incId, amount, createdAt, description, incomeDate, notes, accId, userId
                    );
                }

                syncCounts.put("incomes", syncCounts.get("incomes") + 1);
            } catch (Exception e) {
                log.warn("Failed to sync income: {}", inc, e);
            }
        }
    }

    @SuppressWarnings("unchecked")
    public void enrichWithRelationalData(UUID userId, Map<String, Object> payload) {
        if (!isPostgres) return;
        try {
            if (hasAccountsTable) {
                reconcileUserCashAccounts(userId);

                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        "SELECT id, account_name, account_type, current_balance FROM accounts WHERE user_id = ? " +
                        "ORDER BY (CASE WHEN account_type = 'SYSTEM' OR LOWER(account_name) = 'cash' THEN 0 ELSE 1 END), created_at ASC",
                        userId
                );
                if (!rows.isEmpty()) {
                    List<Map<String, Object>> accList = new ArrayList<>();
                    boolean cashSeen = false;
                    for (Map<String, Object> row : rows) {
                        String name = (String) row.get("account_name");
                        String type = (String) row.get("account_type");
                        boolean isCash = "SYSTEM".equalsIgnoreCase(type) || "cash".equalsIgnoreCase(name);
                        if (isCash) {
                            if (cashSeen) continue;
                            cashSeen = true;
                        }
                        Map<String, Object> a = new HashMap<>();
                        a.put("id", String.valueOf(row.get("id")));
                        a.put("accountName", isCash ? "Cash" : name);
                        a.put("accountType", isCash ? "SYSTEM" : type);
                        a.put("currentBalance", row.get("current_balance"));
                        a.put("deleted", false);
                        accList.add(a);
                    }
                    payload.put("accounts", accList);
                }
            }

            if (hasTombstonesTable) {
                try {
                    List<Map<String, Object>> tRows = jdbcTemplate.queryForList(
                            "SELECT id, entity_type, deleted_at FROM sync_tombstones WHERE user_id = ? ORDER BY deleted_at DESC",
                            userId
                    );
                    List<Map<String, Object>> tombList = new ArrayList<>();
                    List<String> deletedIds = new ArrayList<>();
                    for (Map<String, Object> tRow : tRows) {
                        Map<String, Object> t = new HashMap<>();
                        String tId = String.valueOf(tRow.get("id"));
                        t.put("id", tId);
                        t.put("entityType", tRow.get("entity_type"));
                        t.put("deletedAt", formatIsoTimestamp(tRow.get("deleted_at")));
                        tombList.add(t);
                        deletedIds.add(tId.toLowerCase());
                    }
                    payload.put("tombstones", tombList);
                    payload.put("deletedIds", deletedIds);
                } catch (Exception e) {
                    log.warn("Could not load tombstones for user {}: {}", userId, e.getMessage());
                }
            }

            if (hasExpensesTable) {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        "SELECT e.id, e.amount, e.category, e.description, e.expense_date, e.notes, e.payment_mode, e.account_id, e.created_at, a.account_name " +
                        "FROM expenses e LEFT JOIN accounts a ON e.account_id = a.id " +
                        "WHERE e.user_id = ? ORDER BY e.created_at DESC",
                        userId
                );
                if (!rows.isEmpty()) {
                    List<Map<String, Object>> expList = new ArrayList<>();
                    for (Map<String, Object> row : rows) {
                        String eId = String.valueOf(row.get("id"));
                        if (isTombstoned(eId, userId)) {
                            continue;
                        }
                        Map<String, Object> e = new HashMap<>();
                        e.put("id", eId);
                        e.put("amount", row.get("amount"));
                        e.put("category", row.get("category"));
                        e.put("description", row.get("description"));
                        e.put("expenseDate", row.get("expense_date") != null ? row.get("expense_date").toString() : null);
                        e.put("notes", row.get("notes"));
                        e.put("paymentMode", row.get("payment_mode"));
                        e.put("accountId", row.get("account_id") != null ? String.valueOf(row.get("account_id")) : null);
                        e.put("accountName", row.get("account_name") != null ? String.valueOf(row.get("account_name")) : "Cash");
                        e.put("createdAt", formatIsoTimestamp(row.get("created_at")));
                        e.put("transactionDateTime", formatIsoTimestamp(row.get("created_at")));
                        e.put("deleted", false);
                        expList.add(e);
                    }
                    payload.put("expenses", expList);
                }
            }

            if (hasIncomesTable) {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        "SELECT i.id, i.amount, i.description, i.income_date, i.notes, i.account_id, i.created_at, a.account_name " +
                        "FROM incomes i LEFT JOIN accounts a ON i.account_id = a.id " +
                        "WHERE i.user_id = ? ORDER BY i.created_at DESC",
                        userId
                );
                if (!rows.isEmpty()) {
                    List<Map<String, Object>> incList = new ArrayList<>();
                    for (Map<String, Object> row : rows) {
                        String iId = String.valueOf(row.get("id"));
                        if (isTombstoned(iId, userId)) {
                            continue;
                        }
                        Map<String, Object> i = new HashMap<>();
                        i.put("id", iId);
                        i.put("amount", row.get("amount"));
                        i.put("description", row.get("description"));
                        i.put("incomeDate", row.get("income_date") != null ? row.get("income_date").toString() : null);
                        i.put("notes", row.get("notes"));
                        i.put("accountId", row.get("account_id") != null ? String.valueOf(row.get("account_id")) : null);
                        i.put("accountName", row.get("account_name") != null ? String.valueOf(row.get("account_name")) : "Cash");
                        i.put("createdAt", formatIsoTimestamp(row.get("created_at")));
                        i.put("transactionDateTime", formatIsoTimestamp(row.get("created_at")));
                        i.put("deleted", false);
                        incList.add(i);
                    }
                    payload.put("incomes", incList);
                }
            }
        } catch (Exception e) {
            log.warn("Could not enrich with relational data: {}", e.getMessage());
        }
    }

    private List<Map<String, Object>> extractList(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof List<?>) {
            return (List<Map<String, Object>>) val;
        }
        return Collections.emptyList();
    }

    private UUID parseUUID(Object val) {
        if (val == null) return null;
        if (val instanceof UUID) return (UUID) val;
        try {
            return UUID.fromString(String.valueOf(val).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String getString(Object val, String defaultValue) {
        if (val == null) return defaultValue;
        String s = String.valueOf(val).trim();
        return s.isEmpty() ? defaultValue : s;
    }

    private BigDecimal getBigDecimal(Object val, BigDecimal defaultValue) {
        if (val == null) return defaultValue;
        try {
            if (val instanceof BigDecimal) return (BigDecimal) val;
            if (val instanceof Number) return BigDecimal.valueOf(((Number) val).doubleValue());
            return new BigDecimal(String.valueOf(val).trim());
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private Timestamp parseTimestamp(Object val) {
        if (val == null) return Timestamp.from(Instant.now());
        try {
            if (val instanceof Timestamp) return (Timestamp) val;
            if (val instanceof java.util.Date) return new Timestamp(((java.util.Date) val).getTime());
            String s = String.valueOf(val).trim();
            if (s.isEmpty()) return Timestamp.from(Instant.now());
            if (s.endsWith("Z") || s.matches(".*[+-]\\d{2}:?\\d{2}$")) {
                return Timestamp.from(Instant.parse(s));
            }
            s = s.replace(' ', 'T');
            if (!s.endsWith("Z") && !s.matches(".*[+-]\\d{2}:?\\d{2}$")) {
                s += "Z";
            }
            return Timestamp.from(Instant.parse(s));
        } catch (Exception e) {
            return Timestamp.from(Instant.now());
        }
    }

    private Date parseSqlDate(Object dateVal, Object fallbackDtVal, Object fallbackCreatedVal) {
        Object val = dateVal != null ? dateVal : (fallbackDtVal != null ? fallbackDtVal : fallbackCreatedVal);
        if (val == null) return Date.valueOf(LocalDate.now(IST_ZONE));
        try {
            String s = String.valueOf(val).trim();
            if (s.length() == 10 && s.charAt(4) == '-' && s.charAt(7) == '-') {
                return Date.valueOf(s);
            }
            Timestamp ts = parseTimestamp(s);
            LocalDate istDate = ts.toInstant().atZone(IST_ZONE).toLocalDate();
            return Date.valueOf(istDate);
        } catch (Exception e) {
            return Date.valueOf(LocalDate.now(IST_ZONE));
        }
    }
}
