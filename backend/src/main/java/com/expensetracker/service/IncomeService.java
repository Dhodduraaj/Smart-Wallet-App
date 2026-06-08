package com.expensetracker.service;

import com.expensetracker.dto.IncomeDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.UUID;

public interface IncomeService {
    Page<IncomeDto> getIncomes(UUID userId, String search, UUID accountId,
                               LocalDate startDate, LocalDate endDate, Pageable pageable);
    IncomeDto getIncome(UUID userId, UUID id);
    IncomeDto createIncome(UUID userId, IncomeDto incomeDto);
    IncomeDto updateIncome(UUID userId, UUID id, IncomeDto incomeDto);
    void deleteIncome(UUID userId, UUID id);
}
