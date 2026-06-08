package com.expensetracker.service;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.dto.ExpenseDto;
import com.expensetracker.dto.IncomeDto;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.dto.ReportDto;
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
class ReportServiceTest {

    @Autowired
    private ReportService reportService;

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
                .currentBalance(new BigDecimal("2000.00"))
                .build());
        accountId = acc.getId();
    }

    @Test
    void testReportGeneration() {
        LocalDate today = LocalDate.now();

        // Create expense
        expenseService.createExpense(userId, ExpenseDto.builder()
                .accountId(accountId)
                .description("Groceries")
                .amount(new BigDecimal("300.00"))
                .category("Food")
                .paymentMode("Cash")
                .expenseDate(today)
                .build());

        // Create income
        incomeService.createIncome(userId, IncomeDto.builder()
                .accountId(accountId)
                .description("Bonus")
                .amount(new BigDecimal("1000.00"))
                .incomeDate(today)
                .build());

        // Fetch report
        ReportDto report = reportService.getReportData(userId, today.minusDays(1), today.plusDays(1));

        assertNotNull(report);
        assertEquals(0, new BigDecimal("300.00").compareTo(report.getTotalExpenses()));
        assertEquals(0, new BigDecimal("1000.00").compareTo(report.getTotalIncome()));
        assertEquals(0, new BigDecimal("700.00").compareTo(report.getNetSavings()));
        assertEquals(1, report.getExpenses().size());
        assertEquals(1, report.getIncomes().size());

        // Generate PDF
        byte[] pdfBytes = reportService.generatePdfReport(report);
        assertNotNull(pdfBytes);
        assertTrue(pdfBytes.length > 0);
    }
}
