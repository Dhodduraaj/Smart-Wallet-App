package com.expensetracker.service;

import com.expensetracker.entity.Account;
import com.expensetracker.entity.User;

import java.util.UUID;

/**
 * Single source of truth for the mandatory per-user default Cash account.
 */
public interface DefaultCashAccountService {

    String CASH_ACCOUNT_TYPE = "CASH";
    String CASH_ACCOUNT_NAME = "Cash";

    /**
     * Ensures exactly one default Cash account exists for the user (creates or reconciles duplicates).
     */
    Account ensureForUser(User user);

    void ensureForUserId(UUID userId);

    /**
     * Backfills Cash accounts for all users (startup migration).
     */
    void migrateAllUsers();
}
