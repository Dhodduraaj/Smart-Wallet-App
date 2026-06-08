package com.expensetracker.dto;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategorySummaryDto {
    private String category;
    private BigDecimal amount;
    private double percentage;
}
