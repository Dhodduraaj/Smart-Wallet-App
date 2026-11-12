package com.expensetracker.service;

import com.expensetracker.dto.AccountRecoveryRequest;
import com.expensetracker.dto.AuthResponse;
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

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

    private boolean isPostgres = false;
    private boolean hasAccountsTable = false;
    private boolean hasExpensesTable = false;
    private boolean hasIncomesTable = false;
    private boolean hasRemindersTable = false;

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
                    log.info("AccountRecoveryService initialized: isPostgres={}, hasAccounts={}, hasExpenses={}, hasIncomes={}",
                            isPostgres, hasAccountsTable, hasExpensesTable, hasIncomesTable);
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

    public ResponseEntity<?> recoverAndSync(AccountRecoveryRequest request) {
        String normalizedEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";
        String rawPassword = request.getPassword() != null ? request.getPassword() : "";

        if (normalizedEmail.isEmpty() || rawPassword.isEmpty() || rawPassword.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("message", "Valid email and password (minimum 6 characters) are required"));
        }

        // 1. Resolve or Create User in Neon
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
            log.info("Created cloud user during recovery: {} with ID: {}", normalizedEmail, user.getId());
        }

        // 2. Prepare payload and statistics
        Map<String, Object> payload = request.getPayload() != null ? request.getPayload() : new HashMap<>();
        Map<String, Integer> syncCounts = new LinkedHashMap<>();
        syncCounts.put("accounts", 0);
        syncCounts.put("expenses", 0);
        syncCounts.put("incomes", 0);
        syncCounts.put("transfers", 0);
        syncCounts.put("reminders", 0);
        syncCounts.put("people", 0);
        syncCounts.put("peopleLedger", 0);

        // 3. Save complete JSON backup in user_backup table
        try {
            Map<String, Object> backupWrapper = new HashMap<>(payload);
            backupWrapper.put("localUserId", user.getId().toString());
            backupWrapper.put("userId", user.getId().toString());
            backupWrapper.put("email", normalizedEmail);
            backupWrapper.put("syncedAt", Instant.now().toString());

            String jsonPayload = objectMapper.writeValueAsString(backupWrapper);
            UserBackup backup = userBackupRepository.findById(user.getId())
                    .orElse(new UserBackup());
            backup.setUserId(user.getId());
            backup.setPayload(jsonPayload);
            backup.setLastSync(LocalDateTime.now());
            userBackupRepository.save(backup);
            log.info("Saved complete JSON user_backup snapshot for user ID: {}", user.getId());
        } catch (Exception e) {
            log.error("Failed to store user_backup JSON for user: {}", user.getId(), e);
        }

        // 4. Migrate and Synchronize Relational Tables (accounts, expenses, incomes, upcoming_payments)
        syncRelationalTables(user.getId(), payload, syncCounts);

        // 5. Generate 30-day JWT session token
        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getFullName());

        return ResponseEntity.ok(AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(true)
                .message("Account recovered and financial data successfully synchronized with cloud database.")
                .syncedCounts(syncCounts)
                .build());
    }

    @SuppressWarnings("unchecked")
    private void syncRelationalTables(UUID userId, Map<String, Object> payload, Map<String, Integer> syncCounts) {
        // Collect Accounts
        List<Map<String, Object>> accounts = extractList(payload, "accounts");
        Set<UUID> validAccountIds = new HashSet<>();
        UUID defaultCashAccountId = null;

        for (Map<String, Object> acc : accounts) {
            try {
                UUID accId = parseUUID(acc.get("id"));
                if (accId == null) accId = UUID.randomUUID();

                String accName = getString(acc.get("accountName"), "Cash");
                String accType = getString(acc.get("accountType"), "CUSTOM");
                BigDecimal balance = getBigDecimal(acc.get("currentBalance"), BigDecimal.ZERO);
                Timestamp createdAt = parseTimestamp(acc.get("createdAt"));

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
                if (defaultCashAccountId == null || "SYSTEM".equalsIgnoreCase(accType) || "Cash".equalsIgnoreCase(accName)) {
                    defaultCashAccountId = accId;
                }
                syncCounts.put("accounts", syncCounts.get("accounts") + 1);
            } catch (Exception e) {
                log.warn("Failed to sync account: {}", acc, e);
            }
        }

        // Fallback default cash account if none exists
        if (defaultCashAccountId == null) {
            defaultCashAccountId = UUID.randomUUID();
            if (hasAccountsTable && isPostgres) {
                jdbcTemplate.update(
                        "INSERT INTO accounts (id, account_name, account_type, created_at, current_balance, user_id) " +
                        "VALUES (?, 'Cash', 'SYSTEM', ?, 0, ?) ON CONFLICT (id) DO NOTHING",
                        defaultCashAccountId, Timestamp.from(Instant.now()), userId
                );
            }
            validAccountIds.add(defaultCashAccountId);
        }

        // Collect Expenses (either from "expenses" list or from "transactions" where type="expense")
        List<Map<String, Object>> expenses = extractList(payload, "expenses");
        if (expenses.isEmpty()) {
            List<Map<String, Object>> txs = extractList(payload, "transactions");
            for (Map<String, Object> tx : txs) {
                if ("expense".equalsIgnoreCase(getString(tx.get("transactionType"), ""))) {
                    expenses.add(tx);
                }
            }
        }

        for (Map<String, Object> exp : expenses) {
            try {
                UUID expId = parseUUID(exp.get("id"));
                if (expId == null) expId = UUID.randomUUID();

                BigDecimal amount = getBigDecimal(exp.get("amount"), BigDecimal.ZERO);
                String category = getString(exp.get("category"), "General");
                String description = getString(exp.get("description"), "Expense");
                Date expenseDate = parseSqlDate(exp.get("expenseDate"), exp.get("transactionDateTime"), exp.get("createdAt"));
                String notes = getString(exp.get("notes"), null);
                String paymentMode = getString(exp.get("paymentMode"), "CASH");

                UUID accId = parseUUID(exp.get("accountId"));
                if (accId == null || !validAccountIds.contains(accId)) {
                    accId = defaultCashAccountId;
                }

                Timestamp createdAt = parseTimestamp(exp.get("createdAt"));

                int rows = 1;
                if (hasExpensesTable && isPostgres) {
                    rows = jdbcTemplate.update(
                            "INSERT INTO expenses (id, amount, category, created_at, description, expense_date, notes, payment_mode, account_id, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO NOTHING",
                            expId, amount, category, createdAt, description, expenseDate, notes, paymentMode, accId, userId
                    );
                }
                syncCounts.put("expenses", syncCounts.get("expenses") + rows);
            } catch (Exception e) {
                log.warn("Failed to sync expense: {}", exp, e);
            }
        }

        // Collect Incomes (either from "incomes" list or from "transactions" where type="income")
        List<Map<String, Object>> incomes = extractList(payload, "incomes");
        if (incomes.isEmpty()) {
            List<Map<String, Object>> txs = extractList(payload, "transactions");
            for (Map<String, Object> tx : txs) {
                if ("income".equalsIgnoreCase(getString(tx.get("transactionType"), ""))) {
                    incomes.add(tx);
                }
            }
        }

        for (Map<String, Object> inc : incomes) {
            try {
                UUID incId = parseUUID(inc.get("id"));
                if (incId == null) incId = UUID.randomUUID();

                BigDecimal amount = getBigDecimal(inc.get("amount"), BigDecimal.ZERO);
                String description = getString(inc.get("description"), "Income");
                Date incomeDate = parseSqlDate(inc.get("incomeDate"), inc.get("transactionDateTime"), inc.get("createdAt"));
                String notes = getString(inc.get("notes"), null);

                UUID accId = parseUUID(inc.get("accountId"));
                if (accId == null || !validAccountIds.contains(accId)) {
                    accId = defaultCashAccountId;
                }

                Timestamp createdAt = parseTimestamp(inc.get("createdAt"));

                int rows = 1;
                if (hasIncomesTable && isPostgres) {
                    rows = jdbcTemplate.update(
                            "INSERT INTO incomes (id, amount, created_at, description, income_date, notes, account_id, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO NOTHING",
                            incId, amount, createdAt, description, incomeDate, notes, accId, userId
                    );
                }
                syncCounts.put("incomes", syncCounts.get("incomes") + rows);
            } catch (Exception e) {
                log.warn("Failed to sync income: {}", inc, e);
            }
        }

        // Reminders / Upcoming Payments
        List<Map<String, Object>> reminders = extractList(payload, "reminders");
        for (Map<String, Object> rem : reminders) {
            try {
                UUID remId = parseUUID(rem.get("id"));
                if (remId == null) remId = UUID.randomUUID();

                BigDecimal amount = getBigDecimal(rem.get("amount"), BigDecimal.ZERO);
                boolean completed = Boolean.TRUE.equals(rem.get("completed"));
                String title = getString(rem.get("title"), "Upcoming Payment");
                String description = getString(rem.get("description"), null);
                Date dueDate = parseSqlDate(rem.get("dueDate"), rem.get("date"), null);
                Date reminderDate = parseSqlDate(rem.get("reminderDate"), rem.get("dueDate"), null);
                boolean notified = Boolean.TRUE.equals(rem.get("reminderNotified"));
                Timestamp createdAt = parseTimestamp(rem.get("createdAt"));

                int rows = 1;
                if (hasRemindersTable && isPostgres) {
                    rows = jdbcTemplate.update(
                            "INSERT INTO upcoming_payments (id, amount, completed, created_at, description, due_date, reminder_date, reminder_notified, title, user_id) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                            "ON CONFLICT (id) DO NOTHING",
                            remId, amount, completed, createdAt, description, dueDate, reminderDate, notified, title, userId
                    );
                }
                syncCounts.put("reminders", syncCounts.get("reminders") + rows);
            } catch (Exception e) {
                log.warn("Failed to sync reminder: {}", rem, e);
            }
        }

        // Record counts for People, PeopleLedger, and Transfers stored in user_backup
        List<Map<String, Object>> people = extractList(payload, "people");
        syncCounts.put("people", people.size());

        List<Map<String, Object>> peopleLedger = extractList(payload, "peopleLedger");
        syncCounts.put("peopleLedger", peopleLedger.size());

        List<Map<String, Object>> transfers = extractList(payload, "transfers");
        syncCounts.put("transfers", transfers.size());

        log.info("Relational synchronization complete for user {}: {}", userId, syncCounts);
    }

    // --- Helper parsing methods ---

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractList(Map<String, Object> payload, String key) {
        Object val = payload.get(key);
        if (val instanceof List) {
            return (List<Map<String, Object>>) val;
        }
        return new ArrayList<>();
    }

    private UUID parseUUID(Object val) {
        if (val == null) return null;
        try {
            return UUID.fromString(val.toString().trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String getString(Object val, String fallback) {
        if (val == null) return fallback;
        String s = val.toString().trim();
        return s.isEmpty() ? fallback : s;
    }

    private BigDecimal getBigDecimal(Object val, BigDecimal fallback) {
        if (val == null) return fallback;
        try {
            return new BigDecimal(val.toString());
        } catch (Exception e) {
            return fallback;
        }
    }

    private Date parseSqlDate(Object... candidates) {
        for (Object c : candidates) {
            if (c != null) {
                String s = c.toString().trim();
                if (!s.isEmpty()) {
                    try {
                        if (s.length() >= 10) {
                            String ymd = s.substring(0, 10);
                            return Date.valueOf(ymd);
                        }
                    } catch (Exception ignored) {}
                }
            }
        }
        return Date.valueOf(LocalDate.now());
    }

    private Timestamp parseTimestamp(Object val) {
        if (val == null) return Timestamp.from(Instant.now());
        String s = val.toString().trim();
        try {
            if (s.endsWith("Z") || s.contains("T")) {
                Instant inst = Instant.parse(s);
                return Timestamp.from(inst);
            }
            if (s.length() == 10) {
                return Timestamp.valueOf(LocalDate.parse(s).atStartOfDay());
            }
            return Timestamp.valueOf(s);
        } catch (Exception e) {
            return Timestamp.from(Instant.now());
        }
    }
}
