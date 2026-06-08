package com.expensetracker.dto;

import lombok.*;

import java.math.BigDecimal;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardSummaryDto {
    private BigDecimal totalBalance;
    private BigDecimal todayExpenses;
    private BigDecimal monthlyExpenses;
    private BigDecimal monthlyIncome;
    private List<CategorySummaryDto> categoryExpenses;
    private List<MonthlyTrendDto> monthlyTrends;
    private List<ExpenseDto> recentExpenses;
}
