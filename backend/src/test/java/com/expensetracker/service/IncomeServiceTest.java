package com.expensetracker.service;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.dto.IncomeDto;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class IncomeServiceTest {

    @Autowired
    private IncomeService incomeService;

    @Autowired
    private AccountService accountService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private IncomeRepository incomeRepository;

    private UUID userId;
    private UUID accountId1;
    private UUID accountId2;

    @BeforeEach
    void setUp() {
        incomeRepository.deleteAll();
        accountRepository.deleteAll();
        userRepository.deleteAll();

        // Setup user
        var user = userService.register(RegisterRequest.builder()
                .fullName("User One")
                .email("user1@example.com")
                .password("password123")
                .build());
        userId = user.getUserId();

        // Setup Account 1
        AccountDto acc1 = accountService.createAccount(userId, AccountDto.builder()
                .accountName("SBI Bank")
                .accountType("BANK")
                .currentBalance(new BigDecimal("1000.00"))
                .build());
        accountId1 = acc1.getId();

        AccountDto acc2 = accountService.getAccounts(userId).stream()
                .filter(a -> "CASH".equals(a.getAccountType()))
                .findFirst()
                .orElseThrow();
        acc2.setCurrentBalance(new BigDecimal("2000.00"));
        acc2 = accountService.updateAccount(userId, acc2.getId(), acc2);
        accountId2 = acc2.getId();
    }

    @Test
    void testCreateIncomeIncreasesBalance() {
        IncomeDto incomeDto = IncomeDto.builder()
                .accountId(accountId1)
                .description("Salary")
                .amount(new BigDecimal("5000.00"))
                .incomeDate(LocalDate.now())
                .build();

        IncomeDto saved = incomeService.createIncome(userId, incomeDto);
        assertNotNull(saved.getId());

        // SBI Bank balance should be 1000 + 5000 = 6000
        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("6000.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testUpdateIncomeAdjustsBalanceSameAccount() {
        IncomeDto incomeDto = IncomeDto.builder()
                .accountId(accountId1)
                .description("Freelance")
                .amount(new BigDecimal("1000.00"))
                .incomeDate(LocalDate.now())
                .build();

        IncomeDto saved = incomeService.createIncome(userId, incomeDto);

        // Update amount from 1000 to 1200 (delta is +200, so add 200 more)
        saved.setAmount(new BigDecimal("1200.00"));
        incomeService.updateIncome(userId, saved.getId(), saved);

        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("2200.00").compareTo(account.getCurrentBalance()));

        // Update amount from 1200 to 800 (delta is -400, so subtract 400)
        saved.setAmount(new BigDecimal("800.00"));
        incomeService.updateIncome(userId, saved.getId(), saved);

        account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("1800.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testUpdateIncomeSwitchesAccounts() {
        IncomeDto incomeDto = IncomeDto.builder()
                .accountId(accountId1)
                .description("Gift")
                .amount(new BigDecimal("500.00"))
                .incomeDate(LocalDate.now())
                .build();

        IncomeDto saved = incomeService.createIncome(userId, incomeDto);

        // Switch to accountId2, change amount to 800
        // Expected: accountId1 gets deduction of 500 (balance becomes 1000)
        // Expected: accountId2 gets addition of 800 (balance becomes 2000 + 800 = 2800)
        saved.setAccountId(accountId2);
        saved.setAmount(new BigDecimal("800.00"));
        incomeService.updateIncome(userId, saved.getId(), saved);

        AccountDto account1 = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("1000.00").compareTo(account1.getCurrentBalance()));

        AccountDto account2 = accountService.getAccount(userId, accountId2);
        assertEquals(0, new BigDecimal("2800.00").compareTo(account2.getCurrentBalance()));
    }

    @Test
    void testDeleteIncomeRestoresBalance() {
        IncomeDto incomeDto = IncomeDto.builder()
                .accountId(accountId1)
                .description("Bonus")
                .amount(new BigDecimal("2000.00"))
                .incomeDate(LocalDate.now())
                .build();

        IncomeDto saved = incomeService.createIncome(userId, incomeDto);

        incomeService.deleteIncome(userId, saved.getId());

        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("1000.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testSearchAndFilterIncomes() {
        incomeService.createIncome(userId, IncomeDto.builder()
                .accountId(accountId1)
                .description("Regular salary")
                .amount(new BigDecimal("5000.00"))
                .incomeDate(LocalDate.now().minusDays(1))
                .build());

        incomeService.createIncome(userId, IncomeDto.builder()
                .accountId(accountId2)
                .description("Sell old bicycle")
                .amount(new BigDecimal("300.00"))
                .incomeDate(LocalDate.now())
                .build());

        // Search text "bicycle"
        Page<IncomeDto> page = incomeService.getIncomes(userId, "bicycle", null, null, null, PageRequest.of(0, 10));
        assertEquals(1, page.getTotalElements());
        assertEquals(0, new BigDecimal("300.00").compareTo(page.getContent().get(0).getAmount()));
    }
}
