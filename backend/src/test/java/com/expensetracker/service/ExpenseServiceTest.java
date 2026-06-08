package com.expensetracker.service;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.dto.ExpenseDto;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.ExpenseRepository;
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
class ExpenseServiceTest {

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private AccountService accountService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

    private UUID userId;
    private UUID accountId1;
    private UUID accountId2;

    @BeforeEach
    void setUp() {
        expenseRepository.deleteAll();
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

        // Default Cash account (auto-created on register)
        AccountDto acc2 = accountService.getAccounts(userId).stream()
                .filter(a -> "CASH".equals(a.getAccountType()))
                .findFirst()
                .orElseThrow();
        acc2.setCurrentBalance(new BigDecimal("2000.00"));
        acc2 = accountService.updateAccount(userId, acc2.getId(), acc2);
        accountId2 = acc2.getId();
    }

    @Test
    void testCreateExpenseDeductsBalance() {
        ExpenseDto expenseDto = ExpenseDto.builder()
                .accountId(accountId1)
                .description("Lunch")
                .amount(new BigDecimal("150.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build();

        ExpenseDto saved = expenseService.createExpense(userId, expenseDto);
        assertNotNull(saved.getId());

        // SBI Bank balance should be 1000 - 150 = 850
        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("850.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testUpdateExpenseAdjustsBalanceSameAccount() {
        ExpenseDto expenseDto = ExpenseDto.builder()
                .accountId(accountId1)
                .description("Lunch")
                .amount(new BigDecimal("150.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build();

        ExpenseDto saved = expenseService.createExpense(userId, expenseDto);

        // Update amount from 150 to 200 (delta is +50, so deduct 50 more)
        saved.setAmount(new BigDecimal("200.00"));
        expenseService.updateExpense(userId, saved.getId(), saved);

        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("800.00").compareTo(account.getCurrentBalance()));

        // Update amount from 200 to 120 (delta is -80, so add 80 back)
        saved.setAmount(new BigDecimal("120.00"));
        expenseService.updateExpense(userId, saved.getId(), saved);

        account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("880.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testUpdateExpenseSwitchesAccounts() {
        ExpenseDto expenseDto = ExpenseDto.builder()
                .accountId(accountId1)
                .description("Lunch")
                .amount(new BigDecimal("150.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build();

        ExpenseDto saved = expenseService.createExpense(userId, expenseDto);

        // Switch to accountId2, change amount to 300
        // Expected: accountId1 gets refund of 150 (balance becomes 1000)
        // Expected: accountId2 gets deduction of 300 (balance becomes 2000 - 300 = 1700)
        saved.setAccountId(accountId2);
        saved.setAmount(new BigDecimal("300.00"));
        expenseService.updateExpense(userId, saved.getId(), saved);

        AccountDto account1 = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("1000.00").compareTo(account1.getCurrentBalance()));

        AccountDto account2 = accountService.getAccount(userId, accountId2);
        assertEquals(0, new BigDecimal("1700.00").compareTo(account2.getCurrentBalance()));
    }

    @Test
    void testDeleteExpenseRestoresBalance() {
        ExpenseDto expenseDto = ExpenseDto.builder()
                .accountId(accountId1)
                .description("Lunch")
                .amount(new BigDecimal("150.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build();

        ExpenseDto saved = expenseService.createExpense(userId, expenseDto);

        expenseService.deleteExpense(userId, saved.getId());

        AccountDto account = accountService.getAccount(userId, accountId1);
        assertEquals(0, new BigDecimal("1000.00").compareTo(account.getCurrentBalance()));
    }

    @Test
    void testSearchAndFilterExpenses() {
        expenseService.createExpense(userId, ExpenseDto.builder()
                .accountId(accountId1)
                .description("Supermarket shopping")
                .amount(new BigDecimal("500.00"))
                .category("Shopping")
                .paymentMode("Debit Card")
                .expenseDate(LocalDate.now().minusDays(1))
                .build());

        expenseService.createExpense(userId, ExpenseDto.builder()
                .accountId(accountId1)
                .description("Bus ticket")
                .amount(new BigDecimal("50.00"))
                .category("Transport")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build());

        // Filter by category "Shopping"
        Page<ExpenseDto> page = expenseService.getExpenses(userId, null, "Shopping", null, null, null, PageRequest.of(0, 10));
        assertEquals(1, page.getTotalElements());
        assertEquals("Supermarket shopping", page.getContent().get(0).getDescription());

        // Search text "ticket"
        page = expenseService.getExpenses(userId, "ticket", null, null, null, null, PageRequest.of(0, 10));
        assertEquals(1, page.getTotalElements());
        assertEquals("Transport", page.getContent().get(0).getCategory());
    }
}
