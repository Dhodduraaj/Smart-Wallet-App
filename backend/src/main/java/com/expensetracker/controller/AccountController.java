package com.expensetracker.controller;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.AccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping
    public ResponseEntity<List<AccountDto>> getAccounts(@AuthenticationPrincipal CustomUserDetails userDetails) {
        List<AccountDto> accounts = accountService.getAccounts(userDetails.getId());
        return ResponseEntity.ok(accounts);
    }

    @GetMapping("/{id}")
    public ResponseEntity<AccountDto> getAccount(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        AccountDto account = accountService.getAccount(userDetails.getId(), id);
        return ResponseEntity.ok(account);
    }

    @PostMapping
    public ResponseEntity<AccountDto> createAccount(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody AccountDto accountDto) {
        AccountDto createdAccount = accountService.createAccount(userDetails.getId(), accountDto);
        return new ResponseEntity<>(createdAccount, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<AccountDto> updateAccount(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id,
            @Valid @RequestBody AccountDto accountDto) {
        AccountDto updatedAccount = accountService.updateAccount(userDetails.getId(), id, accountDto);
        return ResponseEntity.ok(updatedAccount);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAccount(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        accountService.deleteAccount(userDetails.getId(), id);
        return ResponseEntity.noContent().build();
    }
}
