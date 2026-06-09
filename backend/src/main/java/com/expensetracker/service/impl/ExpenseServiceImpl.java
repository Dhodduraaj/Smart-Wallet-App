package com.expensetracker.service.impl;

import com.expensetracker.dto.ExpenseDto;
import com.expensetracker.entity.Account;
import com.expensetracker.entity.Expense;
import com.expensetracker.entity.User;
import com.expensetracker.exception.BadRequestException;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.ExpenseRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.ExpenseService;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExpenseServiceImpl implements ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final AccountRepository accountRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<ExpenseDto> getExpenses(UUID userId, String search, String category, UUID accountId,
                                         LocalDate startDate, LocalDate endDate, Pageable pageable) {
        Specification<Expense> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Scoped to user
            predicates.add(cb.equal(root.get("user").get("id"), userId));

            if (StringUtils.hasText(search)) {
                predicates.add(cb.like(cb.lower(root.get("description")), "%" + search.toLowerCase() + "%"));
            }
            if (StringUtils.hasText(category)) {
                predicates.add(cb.equal(root.get("category"), category));
            }
            if (accountId != null) {
                predicates.add(cb.equal(root.get("account").get("id"), accountId));
            }
            if (startDate != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("expenseDate"), startDate));
            }
            if (endDate != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("expenseDate"), endDate));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return expenseRepository.findAll(spec, pageable).map(this::mapToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public ExpenseDto getExpense(UUID userId, UUID id) {
        Expense expense = expenseRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found with id: " + id));
        return mapToDto(expense);
    }

    @Override
    @Transactional
    public ExpenseDto createExpense(UUID userId, ExpenseDto expenseDto) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Account account = accountRepository.findByUserIdAndId(userId, expenseDto.getAccountId())
                .orElseThrow(() -> new ResourceNotFoundException("Account not found or access denied"));

        // Deduct from account balance
        BigDecimal newBalance = account.getCurrentBalance().subtract(expenseDto.getAmount());
        account.setCurrentBalance(newBalance);
        accountRepository.save(account);

        Expense expense = Expense.builder()
                .user(user)
                .account(account)
                .description(expenseDto.getDescription())
                .amount(expenseDto.getAmount())
                .category(expenseDto.getCategory())
                .paymentMode(expenseDto.getPaymentMode())
                .expenseDate(expenseDto.getExpenseDate())
                .notes(expenseDto.getNotes())
                .createdAt(expenseDto.getCreatedAt())
                .build();

        expense = expenseRepository.save(expense);
        return mapToDto(expense);
    }

    @Override
    @Transactional
    public ExpenseDto updateExpense(UUID userId, UUID id, ExpenseDto expenseDto) {
        Expense expense = expenseRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found with id: " + id));

        Account oldAccount = expense.getAccount();
        BigDecimal oldAmount = expense.getAmount();

        Account newAccount;
        if (oldAccount.getId().equals(expenseDto.getAccountId())) {
            newAccount = oldAccount;
            // Adjust balance with delta
            BigDecimal delta = expenseDto.getAmount().subtract(oldAmount);
            newAccount.setCurrentBalance(newAccount.getCurrentBalance().subtract(delta));
            accountRepository.save(newAccount);
        } else {
            // Retrieve new account
            newAccount = accountRepository.findByUserIdAndId(userId, expenseDto.getAccountId())
                    .orElseThrow(() -> new ResourceNotFoundException("New account not found or access denied"));

            // Add back to old account
            oldAccount.setCurrentBalance(oldAccount.getCurrentBalance().add(oldAmount));
            accountRepository.save(oldAccount);

            // Deduct from new account
            newAccount.setCurrentBalance(newAccount.getCurrentBalance().subtract(expenseDto.getAmount()));
            accountRepository.save(newAccount);
        }

        expense.setAccount(newAccount);
        expense.setDescription(expenseDto.getDescription());
        expense.setAmount(expenseDto.getAmount());
        expense.setCategory(expenseDto.getCategory());
        expense.setPaymentMode(expenseDto.getPaymentMode());
        expense.setExpenseDate(expenseDto.getExpenseDate());
        expense.setNotes(expenseDto.getNotes());
        if (expenseDto.getCreatedAt() != null) {
            expense.setCreatedAt(expenseDto.getCreatedAt());
        }

        expense = expenseRepository.save(expense);
        return mapToDto(expense);
    }

    @Override
    @Transactional
    public void deleteExpense(UUID userId, UUID id) {
        Expense expense = expenseRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found with id: " + id));

        Account account = expense.getAccount();
        // Refund back to account
        account.setCurrentBalance(account.getCurrentBalance().add(expense.getAmount()));
        accountRepository.save(account);

        expenseRepository.delete(expense);
    }

    private ExpenseDto mapToDto(Expense expense) {
        return ExpenseDto.builder()
                .id(expense.getId())
                .accountId(expense.getAccount().getId())
                .accountName(expense.getAccount().getAccountName())
                .description(expense.getDescription())
                .amount(expense.getAmount())
                .category(expense.getCategory())
                .paymentMode(expense.getPaymentMode())
                .expenseDate(expense.getExpenseDate())
                .notes(expense.getNotes())
                .createdAt(expense.getCreatedAt())
                .build();
    }
}
