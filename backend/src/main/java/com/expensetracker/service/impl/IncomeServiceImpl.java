package com.expensetracker.service.impl;

import com.expensetracker.dto.IncomeDto;
import com.expensetracker.entity.Account;
import com.expensetracker.entity.Income;
import com.expensetracker.entity.User;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.IncomeService;
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
public class IncomeServiceImpl implements IncomeService {

    private final IncomeRepository incomeRepository;
    private final AccountRepository accountRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<IncomeDto> getIncomes(UUID userId, String search, UUID accountId,
                                       LocalDate startDate, LocalDate endDate, Pageable pageable) {
        Specification<Income> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Scope to user
            predicates.add(cb.equal(root.get("user").get("id"), userId));

            if (StringUtils.hasText(search)) {
                predicates.add(cb.like(cb.lower(root.get("description")), "%" + search.toLowerCase() + "%"));
            }
            if (accountId != null) {
                predicates.add(cb.equal(root.get("account").get("id"), accountId));
            }
            if (startDate != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("incomeDate"), startDate));
            }
            if (endDate != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("incomeDate"), endDate));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return incomeRepository.findAll(spec, pageable).map(this::mapToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public IncomeDto getIncome(UUID userId, UUID id) {
        Income income = incomeRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Income record not found with id: " + id));
        return mapToDto(income);
    }

    @Override
    @Transactional
    public IncomeDto createIncome(UUID userId, IncomeDto incomeDto) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Account account = accountRepository.findByUserIdAndId(userId, incomeDto.getAccountId())
                .orElseThrow(() -> new ResourceNotFoundException("Account not found or access denied"));

        // Increase account balance
        account.setCurrentBalance(account.getCurrentBalance().add(incomeDto.getAmount()));
        accountRepository.save(account);

        Income income = Income.builder()
                .user(user)
                .account(account)
                .description(incomeDto.getDescription())
                .amount(incomeDto.getAmount())
                .incomeDate(incomeDto.getIncomeDate())
                .notes(incomeDto.getNotes())
                .build();

        income = incomeRepository.save(income);
        return mapToDto(income);
    }

    @Override
    @Transactional
    public IncomeDto updateIncome(UUID userId, UUID id, IncomeDto incomeDto) {
        Income income = incomeRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Income record not found with id: " + id));

        Account oldAccount = income.getAccount();
        BigDecimal oldAmount = income.getAmount();

        Account newAccount;
        if (oldAccount.getId().equals(incomeDto.getAccountId())) {
            newAccount = oldAccount;
            // Adjust balance with delta
            BigDecimal delta = incomeDto.getAmount().subtract(oldAmount);
            newAccount.setCurrentBalance(newAccount.getCurrentBalance().add(delta));
            accountRepository.save(newAccount);
        } else {
            // Retrieve new account
            newAccount = accountRepository.findByUserIdAndId(userId, incomeDto.getAccountId())
                    .orElseThrow(() -> new ResourceNotFoundException("New account not found or access denied"));

            // Deduct from old account
            oldAccount.setCurrentBalance(oldAccount.getCurrentBalance().subtract(oldAmount));
            accountRepository.save(oldAccount);

            // Add to new account
            newAccount.setCurrentBalance(newAccount.getCurrentBalance().add(incomeDto.getAmount()));
            accountRepository.save(newAccount);
        }

        income.setAccount(newAccount);
        income.setDescription(incomeDto.getDescription());
        income.setAmount(incomeDto.getAmount());
        income.setIncomeDate(incomeDto.getIncomeDate());
        income.setNotes(incomeDto.getNotes());

        income = incomeRepository.save(income);
        return mapToDto(income);
    }

    @Override
    @Transactional
    public void deleteIncome(UUID userId, UUID id) {
        Income income = incomeRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Income record not found with id: " + id));

        Account account = income.getAccount();
        // Deduct back from account
        account.setCurrentBalance(account.getCurrentBalance().subtract(income.getAmount()));
        accountRepository.save(account);

        incomeRepository.delete(income);
    }

    private IncomeDto mapToDto(Income income) {
        return IncomeDto.builder()
                .id(income.getId())
                .accountId(income.getAccount().getId())
                .accountName(income.getAccount().getAccountName())
                .description(income.getDescription())
                .amount(income.getAmount())
                .incomeDate(income.getIncomeDate())
                .notes(income.getNotes())
                .createdAt(income.getCreatedAt())
                .build();
    }
}
