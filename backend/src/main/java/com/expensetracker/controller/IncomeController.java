package com.expensetracker.controller;

import com.expensetracker.dto.IncomeDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.IncomeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/incomes")
@RequiredArgsConstructor
public class IncomeController {

    private final IncomeService incomeService;

    @GetMapping
    public ResponseEntity<Page<IncomeDto>> getIncomes(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @PageableDefault(size = 10, sort = "incomeDate") Pageable pageable) {

        Page<IncomeDto> incomes = incomeService.getIncomes(
                userDetails.getId(), search, accountId, startDate, endDate, pageable);
        return ResponseEntity.ok(incomes);
    }

    @GetMapping("/{id}")
    public ResponseEntity<IncomeDto> getIncome(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        IncomeDto income = incomeService.getIncome(userDetails.getId(), id);
        return ResponseEntity.ok(income);
    }

    @PostMapping
    public ResponseEntity<IncomeDto> createIncome(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody IncomeDto incomeDto) {
        IncomeDto created = incomeService.createIncome(userDetails.getId(), incomeDto);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<IncomeDto> updateIncome(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id,
            @Valid @RequestBody IncomeDto incomeDto) {
        IncomeDto updated = incomeService.updateIncome(userDetails.getId(), id, incomeDto);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIncome(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        incomeService.deleteIncome(userDetails.getId(), id);
        return ResponseEntity.noContent().build();
    }
}
