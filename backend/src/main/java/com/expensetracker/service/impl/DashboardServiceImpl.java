package com.expensetracker.service.impl;

import com.expensetracker.dto.CategorySummaryDto;
import com.expensetracker.dto.DashboardSummaryDto;
import com.expensetracker.dto.ExpenseDto;
import com.expensetracker.dto.MonthlyTrendDto;
import com.expensetracker.entity.Expense;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.ExpenseRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final AccountRepository accountRepository;
    private final ExpenseRepository expenseRepository;
    private final IncomeRepository incomeRepository;

    @Override
    @Transactional(readOnly = true)
    public DashboardSummaryDto getDashboardSummary(UUID userId) {
        LocalDate today = LocalDate.now();
        LocalDate firstDayOfMonth = today.withDayOfMonth(1);
        LocalDate startOfSixMonthsAgo = today.minusMonths(5).withDayOfMonth(1);

        BigDecimal totalBalance = accountRepository.sumCurrentBalanceByUserId(userId);
        BigDecimal todayExpenses = expenseRepository.sumAmountByUserAndDate(userId, today);
        BigDecimal monthlyExpenses = expenseRepository.sumAmountByUserAndDateRange(userId, firstDayOfMonth, today);
        BigDecimal monthlyIncome = incomeRepository.sumAmountByUserAndDateRange(userId, firstDayOfMonth, today);

        List<CategorySummaryDto> categorySummary = buildCategorySummary(
                expenseRepository.sumAmountByCategory(userId, firstDayOfMonth, today),
                monthlyExpenses
        );

        List<MonthlyTrendDto> monthlyTrends = buildMonthlyTrends(
                today,
                expenseRepository.sumAmountByMonth(userId, startOfSixMonthsAgo, today),
                incomeRepository.sumAmountByMonth(userId, startOfSixMonthsAgo, today)
        );

        List<ExpenseDto> recentExpenses = expenseRepository
                .findRecentByUserId(userId, PageRequest.of(0, 5))
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());

        return DashboardSummaryDto.builder()
                .totalBalance(totalBalance)
                .todayExpenses(todayExpenses)
                .monthlyExpenses(monthlyExpenses)
                .monthlyIncome(monthlyIncome)
                .categoryExpenses(categorySummary)
                .monthlyTrends(monthlyTrends)
                .recentExpenses(recentExpenses)
                .build();
    }

    private List<CategorySummaryDto> buildCategorySummary(List<Object[]> categoryRows, BigDecimal monthlyExpenses) {
        return categoryRows.stream()
                .map(row -> {
                    String category = (String) row[0];
                    BigDecimal amt = (BigDecimal) row[1];
                    double percentage = 0.0;
                    if (monthlyExpenses.compareTo(BigDecimal.ZERO) > 0) {
                        percentage = amt.multiply(new BigDecimal("100"))
                                .divide(monthlyExpenses, 2, RoundingMode.HALF_UP)
                                .doubleValue();
                    }
                    return CategorySummaryDto.builder()
                            .category(category)
                            .amount(amt)
                            .percentage(percentage)
                            .build();
                })
                .sorted(Comparator.comparing(CategorySummaryDto::getAmount).reversed())
                .collect(Collectors.toList());
    }

    private List<MonthlyTrendDto> buildMonthlyTrends(
            LocalDate today,
            List<Object[]> expenseByMonth,
            List<Object[]> incomeByMonth
    ) {
        Map<YearMonth, BigDecimal> expenseMap = toMonthAmountMap(expenseByMonth);
        Map<YearMonth, BigDecimal> incomeMap = toMonthAmountMap(incomeByMonth);

        List<MonthlyTrendDto> monthlyTrends = new ArrayList<>();
        for (int i = 5; i >= 0; i--) {
            LocalDate monthDate = today.minusMonths(i);
            YearMonth yearMonth = YearMonth.from(monthDate);
            String monthLabel = monthDate.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + monthDate.getYear();

            monthlyTrends.add(MonthlyTrendDto.builder()
                    .month(monthLabel)
                    .income(incomeMap.getOrDefault(yearMonth, BigDecimal.ZERO))
                    .expense(expenseMap.getOrDefault(yearMonth, BigDecimal.ZERO))
                    .build());
        }
        return monthlyTrends;
    }

    private Map<YearMonth, BigDecimal> toMonthAmountMap(List<Object[]> rows) {
        Map<YearMonth, BigDecimal> map = new HashMap<>();
        for (Object[] row : rows) {
            int year = ((Number) row[0]).intValue();
            int month = ((Number) row[1]).intValue();
            BigDecimal amount = (BigDecimal) row[2];
            map.put(YearMonth.of(year, month), amount);
        }
        return map;
    }

    private ExpenseDto mapToDto(Expense expense) {
        return ExpenseDto.builder()
                .id(expense.getId())
                .accountId(expense.getAccount().getId())
                .accountName(expense.getAccount().getAccountName())
                .description(expense.getDescription())
                .amount(expense.getAmount())
                .category(expense.getCategory())
                .paymentMode(expense.getPaymentMode())
                .expenseDate(expense.getExpenseDate())
                .notes(expense.getNotes())
                .createdAt(expense.getCreatedAt())
                .build();
    }
}
