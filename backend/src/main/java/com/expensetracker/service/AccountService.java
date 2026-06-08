package com.expensetracker.service;

import com.expensetracker.dto.AccountDto;

import java.util.List;
import java.util.UUID;

public interface AccountService {
    List<AccountDto> getAccounts(UUID userId);
    AccountDto getAccount(UUID userId, UUID id);
    AccountDto createAccount(UUID userId, AccountDto accountDto);
    AccountDto updateAccount(UUID userId, UUID id, AccountDto accountDto);
    void deleteAccount(UUID userId, UUID id);
}
