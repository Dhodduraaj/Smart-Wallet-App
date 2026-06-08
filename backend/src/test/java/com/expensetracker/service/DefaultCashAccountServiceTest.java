package com.expensetracker.service;

import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.Account;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DefaultCashAccountServiceTest {

    @Autowired
    private DefaultCashAccountService defaultCashAccountService;

    @Autowired
    private UserService userService;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        accountRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void migrateAllUsersCreatesMissingCash() {
        var auth = userService.register(RegisterRequest.builder()
                .fullName("Legacy User")
                .email("legacy@example.com")
                .password("password123")
                .build());

        accountRepository.deleteAll();

        assertTrue(accountRepository.findByUserId(auth.getUserId()).isEmpty());

        defaultCashAccountService.migrateAllUsers();

        List<Account> accounts = accountRepository.findByUserId(auth.getUserId());
        assertEquals(1, accounts.size());
        assertEquals(DefaultCashAccountService.CASH_ACCOUNT_NAME, accounts.get(0).getAccountName());
        assertEquals(DefaultCashAccountService.CASH_ACCOUNT_TYPE, accounts.get(0).getAccountType());
    }

    @Test
    void ensureForUserIdIsIdempotent() {
        var auth = userService.register(RegisterRequest.builder()
                .fullName("User")
                .email("user@example.com")
                .password("password123")
                .build());

        UUID userId = auth.getUserId();
        defaultCashAccountService.ensureForUserId(userId);
        defaultCashAccountService.ensureForUserId(userId);

        long cashCount = accountRepository.countByUserIdAndAccountTypeIgnoreCase(
                userId, DefaultCashAccountService.CASH_ACCOUNT_TYPE);
        assertEquals(1, cashCount);
    }
}
