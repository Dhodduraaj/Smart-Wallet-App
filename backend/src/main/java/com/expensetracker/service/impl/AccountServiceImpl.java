package com.expensetracker.service.impl;

import com.expensetracker.dto.AccountDto;
import com.expensetracker.entity.Account;
import com.expensetracker.entity.User;
import com.expensetracker.exception.BadRequestException;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.AccountService;
import com.expensetracker.service.DefaultCashAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccountServiceImpl implements AccountService {

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;
    private final DefaultCashAccountService defaultCashAccountService;

    @Override
    @Transactional
    public List<AccountDto> getAccounts(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        defaultCashAccountService.ensureForUser(user);
        return accountRepository.findByUserId(userId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public AccountDto getAccount(UUID userId, UUID id) {
        defaultCashAccountService.ensureForUserId(userId);
        Account account = accountRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Account not found with id: " + id));
        return mapToDto(account);
    }

    @Override
    @Transactional
    public AccountDto createAccount(UUID userId, AccountDto accountDto) {
        rejectManualCashAccount(accountDto.getAccountType());

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));

        defaultCashAccountService.ensureForUser(user);

        Account account = Account.builder()
                .user(user)
                .accountName(accountDto.getAccountName())
                .accountType(accountDto.getAccountType())
                .currentBalance(accountDto.getCurrentBalance())
                .build();

        account = accountRepository.save(account);
        return mapToDto(account);
    }

    @Override
    @Transactional
    public AccountDto updateAccount(UUID userId, UUID id, AccountDto accountDto) {
        Account account = accountRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Account not found with id: " + id));

        if (DefaultCashAccountService.CASH_ACCOUNT_TYPE.equalsIgnoreCase(account.getAccountType())) {
            account.setCurrentBalance(accountDto.getCurrentBalance());
        } else {
            rejectManualCashAccount(accountDto.getAccountType());
            account.setAccountName(accountDto.getAccountName());
            account.setAccountType(accountDto.getAccountType());
            account.setCurrentBalance(accountDto.getCurrentBalance());
        }

        account = accountRepository.save(account);
        return mapToDto(account);
    }

    @Override
    @Transactional
    public void deleteAccount(UUID userId, UUID id) {
        Account account = accountRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Account not found with id: " + id));
        if (DefaultCashAccountService.CASH_ACCOUNT_TYPE.equalsIgnoreCase(account.getAccountType())) {
            throw new BadRequestException("The default Cash account cannot be deleted");
        }
        accountRepository.delete(account);
    }

    private void rejectManualCashAccount(String accountType) {
        if (DefaultCashAccountService.CASH_ACCOUNT_TYPE.equalsIgnoreCase(accountType)) {
            throw new BadRequestException(
                    "Cash account is created automatically and cannot be added or changed to manually");
        }
    }

    private AccountDto mapToDto(Account account) {
        return AccountDto.builder()
                .id(account.getId())
                .accountName(account.getAccountName())
                .accountType(account.getAccountType())
                .currentBalance(account.getCurrentBalance())
                .createdAt(account.getCreatedAt())
                .build();
    }
}
