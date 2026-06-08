package com.expensetracker.dto;

import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReportDto {
    private LocalDate startDate;
    private LocalDate endDate;
    private String fullName;
    private String email;
    
    private List<ExpenseDto> expenses;
    private List<IncomeDto> incomes;
    
    private BigDecimal totalExpenses;
    private BigDecimal totalIncome;
    private BigDecimal netSavings;
    
    private List<CategorySummaryDto> categorySummary;
}
