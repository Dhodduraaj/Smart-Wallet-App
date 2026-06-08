package com.expensetracker.service;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.exception.BadRequestException;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AccountServiceTest {

    @Autowired
    private AccountService accountService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    private UUID userId1;
    private UUID userId2;

    @BeforeEach
    void setUp() {
        accountRepository.deleteAll();
        userRepository.deleteAll();

        // Setup user 1
        var user1 = userService.register(RegisterRequest.builder()
                .fullName("User One")
                .email("user1@example.com")
                .password("password123")
                .build());
        userId1 = user1.getUserId();

        // Setup user 2
        var user2 = userService.register(RegisterRequest.builder()
                .fullName("User Two")
                .email("user2@example.com")
                .password("password123")
                .build());
        userId2 = user2.getUserId();
    }

    @Test
    void testCreateAndGetAccounts() {
        AccountDto bank = AccountDto.builder()
                .accountName("SBI Savings")
                .accountType("BANK")
                .currentBalance(new BigDecimal("500.00"))
                .build();

        AccountDto saved = accountService.createAccount(userId1, bank);
        assertNotNull(saved.getId());
        assertEquals("SBI Savings", saved.getAccountName());
        assertEquals(0, new BigDecimal("500.00").compareTo(saved.getCurrentBalance()));

        List<AccountDto> accounts = accountService.getAccounts(userId1);
        assertEquals(2, accounts.size());

        List<AccountDto> accounts2 = accountService.getAccounts(userId2);
        assertEquals(1, accounts2.size());
        assertEquals("CASH", accounts2.get(0).getAccountType());
    }

    @Test
    void testCannotCreateCashManually() {
        AccountDto cash = AccountDto.builder()
                .accountName("Extra Cash")
                .accountType("CASH")
                .currentBalance(new BigDecimal("100.00"))
                .build();
        assertThrows(BadRequestException.class, () -> accountService.createAccount(userId1, cash));
    }

    @Test
    void testTenantIsolation() {
        AccountDto bank = AccountDto.builder()
                .accountName("HDFC")
                .accountType("BANK")
                .currentBalance(new BigDecimal("500.00"))
                .build();
        AccountDto saved = accountService.createAccount(userId1, bank);

        // User 1 can retrieve it
        AccountDto found = accountService.getAccount(userId1, saved.getId());
        assertNotNull(found);

        // User 2 cannot retrieve it and gets 404
        assertThrows(ResourceNotFoundException.class, () -> accountService.getAccount(userId2, saved.getId()));

        // User 2 cannot update it
        assertThrows(ResourceNotFoundException.class, () -> accountService.updateAccount(userId2, saved.getId(), bank));

        // User 2 cannot delete it
        assertThrows(ResourceNotFoundException.class, () -> accountService.deleteAccount(userId2, saved.getId()));
    }

    @Test
    void testUpdateAndDetails() {
        AccountDto sbi = AccountDto.builder()
                .accountName("SBI Savings")
                .accountType("BANK")
                .currentBalance(new BigDecimal("10000.00"))
                .build();
        AccountDto saved = accountService.createAccount(userId1, sbi);

        saved.setAccountName("SBI Checking");
        saved.setCurrentBalance(new BigDecimal("9500.00"));
        AccountDto updated = accountService.updateAccount(userId1, saved.getId(), saved);

        assertEquals("SBI Checking", updated.getAccountName());
        assertEquals(0, new BigDecimal("9500.00").compareTo(updated.getCurrentBalance()));

        accountService.deleteAccount(userId1, saved.getId());
        List<AccountDto> remaining = accountService.getAccounts(userId1);
        assertEquals(1, remaining.size());
        assertEquals("CASH", remaining.get(0).getAccountType());
    }
}
