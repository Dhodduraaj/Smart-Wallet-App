package com.expensetracker.service;

import com.expensetracker.dto.*;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.ExpenseRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DashboardServiceTest {

    @Autowired
    private DashboardService dashboardService;

    @Autowired
    private UserService userService;

    @Autowired
    private AccountService accountService;

    @Autowired
    private ExpenseService expenseService;

    @Autowired
    private IncomeService incomeService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private ExpenseRepository expenseRepository;

    @Autowired
    private IncomeRepository incomeRepository;

    private UUID userId;
    private UUID accountId;

    @BeforeEach
    void setUp() {
        expenseRepository.deleteAll();
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

        // Setup Account
        AccountDto acc = accountService.createAccount(userId, AccountDto.builder()
                .accountName("SBI Bank")
                .accountType("BANK")
                .currentBalance(new BigDecimal("1000.00"))
                .build());
        accountId = acc.getId();
    }

    @Test
    void testDashboardCalculations() {
        // Log an expense (Food, 150.00)
        expenseService.createExpense(userId, ExpenseDto.builder()
                .accountId(accountId)
                .description("Snacks")
                .amount(new BigDecimal("150.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(LocalDate.now())
                .build());

        // Log an income (Salary, 2000.00)
        incomeService.createIncome(userId, IncomeDto.builder()
                .accountId(accountId)
                .description("Part-time payment")
                .amount(new BigDecimal("2000.00"))
                .incomeDate(LocalDate.now())
                .build());

        // Retrieve dashboard summary
        DashboardSummaryDto summary = dashboardService.getDashboardSummary(userId);

        assertNotNull(summary);
        // Total balance = 1000 (initial) - 150 + 2000 = 2850
        assertEquals(0, new BigDecimal("2850.00").compareTo(summary.getTotalBalance()));
        assertEquals(0, new BigDecimal("150.00").compareTo(summary.getTodayExpenses()));
        assertEquals(0, new BigDecimal("150.00").compareTo(summary.getMonthlyExpenses()));
        assertEquals(0, new BigDecimal("2000.00").compareTo(summary.getMonthlyIncome()));

        // Category check
        assertEquals(1, summary.getCategoryExpenses().size());
        CategorySummaryDto catSummary = summary.getCategoryExpenses().get(0);
        assertEquals("Food", catSummary.getCategory());
        assertEquals(0, new BigDecimal("150.00").compareTo(catSummary.getAmount()));
        assertEquals(100.0, catSummary.getPercentage());

        // Trend check: last 6 months list should have 6 items
        assertEquals(6, summary.getMonthlyTrends().size());
        
        // The last item (current month) should have income = 2000 and expense = 150
        MonthlyTrendDto currentMonthTrend = summary.getMonthlyTrends().get(5);
        assertEquals(0, new BigDecimal("2000.00").compareTo(currentMonthTrend.getIncome()));
        assertEquals(0, new BigDecimal("150.00").compareTo(currentMonthTrend.getExpense()));

        assertNotNull(summary.getRecentExpenses());
        assertEquals(1, summary.getRecentExpenses().size());
        assertEquals("Snacks", summary.getRecentExpenses().get(0).getDescription());
    }
}
