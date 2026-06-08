package com.expensetracker.service;

import com.expensetracker.dto.ExpenseDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.UUID;

public interface ExpenseService {
    Page<ExpenseDto> getExpenses(UUID userId, String search, String category, UUID accountId,
                                 LocalDate startDate, LocalDate endDate, Pageable pageable);
    ExpenseDto getExpense(UUID userId, UUID id);
    ExpenseDto createExpense(UUID userId, ExpenseDto expenseDto);
    ExpenseDto updateExpense(UUID userId, UUID id, ExpenseDto expenseDto);
    void deleteExpense(UUID userId, UUID id);
}
