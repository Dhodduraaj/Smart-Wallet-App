package com.expensetracker.service.impl;

import com.expensetracker.entity.Account;
import com.expensetracker.entity.Expense;
import com.expensetracker.entity.Income;
import com.expensetracker.entity.User;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.ExpenseRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.DefaultCashAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class DefaultCashAccountServiceImpl implements DefaultCashAccountService {

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;
    private final ExpenseRepository expenseRepository;
    private final IncomeRepository incomeRepository;

    @Override
    @Transactional
    public Account ensureForUser(User user) {
        List<Account> cashAccounts = accountRepository
                .findByUserIdAndAccountTypeIgnoreCaseOrderByCreatedAtAsc(user.getId(), CASH_ACCOUNT_TYPE);

        if (cashAccounts.isEmpty()) {
            Account created = accountRepository.save(buildDefaultCashAccount(user));
            log.info("Created default Cash account for user {}", user.getId());
            return created;
        }

        Account canonical = cashAccounts.getFirst();
        normalizeCashAccount(canonical);

        if (cashAccounts.size() > 1) {
            mergeDuplicateCashAccounts(user.getId(), canonical, cashAccounts.subList(1, cashAccounts.size()));
            log.warn("Merged {} duplicate Cash account(s) for user {}", cashAccounts.size() - 1, user.getId());
        }

        return accountRepository.save(canonical);
    }

    @Override
    @Transactional
    public void ensureForUserId(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        ensureForUser(user);
    }

    @Override
    @Transactional
    public void migrateAllUsers() {
        List<User> users = userRepository.findAll();
        int created = 0;
        int reconciled = 0;

        for (User user : users) {
            List<Account> cashAccounts = accountRepository
                    .findByUserIdAndAccountTypeIgnoreCaseOrderByCreatedAtAsc(user.getId(), CASH_ACCOUNT_TYPE);

            if (cashAccounts.isEmpty()) {
                accountRepository.save(buildDefaultCashAccount(user));
                created++;
            } else if (cashAccounts.size() > 1) {
                Account canonical = cashAccounts.getFirst();
                normalizeCashAccount(canonical);
                mergeDuplicateCashAccounts(user.getId(), canonical, cashAccounts.subList(1, cashAccounts.size()));
                accountRepository.save(canonical);
                reconciled++;
            } else {
                Account only = cashAccounts.getFirst();
                if (normalizeCashAccount(only)) {
                    accountRepository.save(only);
                }
            }
        }

        log.info("Cash account migration finished: {} users, {} created, {} reconciled duplicates",
                users.size(), created, reconciled);
    }

    private Account buildDefaultCashAccount(User user) {
        return Account.builder()
                .user(user)
                .accountName(CASH_ACCOUNT_NAME)
                .accountType(CASH_ACCOUNT_TYPE)
                .currentBalance(BigDecimal.ZERO)
                .build();
    }

    /**
     * @return true if fields were changed
     */
    private boolean normalizeCashAccount(Account account) {
        boolean changed = false;
        if (!CASH_ACCOUNT_NAME.equals(account.getAccountName())) {
            account.setAccountName(CASH_ACCOUNT_NAME);
            changed = true;
        }
        if (!CASH_ACCOUNT_TYPE.equalsIgnoreCase(account.getAccountType())) {
            account.setAccountType(CASH_ACCOUNT_TYPE);
            changed = true;
        }
        if (account.getCurrentBalance() == null) {
            account.setCurrentBalance(BigDecimal.ZERO);
            changed = true;
        }
        return changed;
    }

    private void mergeDuplicateCashAccounts(UUID userId, Account canonical, List<Account> duplicates) {
        for (Account duplicate : duplicates) {
            canonical.setCurrentBalance(
                    canonical.getCurrentBalance().add(
                            duplicate.getCurrentBalance() != null ? duplicate.getCurrentBalance() : BigDecimal.ZERO
                    )
            );

            List<Expense> expenses = expenseRepository.findByUserIdAndAccountId(userId, duplicate.getId());
            for (Expense expense : expenses) {
                expense.setAccount(canonical);
            }
            expenseRepository.saveAll(expenses);

            List<Income> incomes = incomeRepository.findByUserIdAndAccountId(userId, duplicate.getId());
            for (Income income : incomes) {
                income.setAccount(canonical);
            }
            incomeRepository.saveAll(incomes);

            accountRepository.delete(duplicate);
        }
    }
}
