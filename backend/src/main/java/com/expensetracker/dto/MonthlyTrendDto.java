package com.expensetracker.dto;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MonthlyTrendDto {
    private String month; // e.g. "JAN", "2026-05"
    private BigDecimal income;
    private BigDecimal expense;
}
