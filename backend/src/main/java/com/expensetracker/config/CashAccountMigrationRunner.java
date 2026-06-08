package com.expensetracker.config;

import com.expensetracker.service.DefaultCashAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * On startup: ensure DB index for one Cash account per user (PostgreSQL) and backfill missing accounts.
 */
@Component
@Profile("!test")
@Order(100)
@RequiredArgsConstructor
@Slf4j
public class CashAccountMigrationRunner implements ApplicationRunner {

    private final DefaultCashAccountService defaultCashAccountService;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        createPartialUniqueIndexIfSupported();
        defaultCashAccountService.migrateAllUsers();
    }

    private void createPartialUniqueIndexIfSupported() {
        try {
            jdbcTemplate.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uk_accounts_one_cash_per_user
                    ON accounts (user_id)
                    WHERE UPPER(account_type) = 'CASH'
                    """);
            log.info("Ensured partial unique index uk_accounts_one_cash_per_user");
        } catch (Exception e) {
            log.debug("Skipping partial unique index (non-PostgreSQL or unsupported): {}", e.getMessage());
        }
    }
}
