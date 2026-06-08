package com.expensetracker.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ensures PostgreSQL indexes exist for user-scoped queries on accounts, expenses, and incomes.
 */
@Component
@Profile("!test")
@Order(99)
@RequiredArgsConstructor
@Slf4j
public class DatabaseIndexRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        createIndexesIfSupported();
    }

    private void createIndexesIfSupported() {
        String[] statements = {
                "CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date DESC)",
                "CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, income_date DESC)"
        };

        for (String sql : statements) {
            try {
                jdbcTemplate.execute(sql);
            } catch (Exception e) {
                log.debug("Skipping index creation (non-PostgreSQL or unsupported): {} — {}", sql, e.getMessage());
            }
        }
        log.info("Ensured performance indexes on accounts, expenses, and incomes");
    }
}
