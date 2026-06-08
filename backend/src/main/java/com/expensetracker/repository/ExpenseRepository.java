package com.expensetracker.repository;

import com.expensetracker.entity.Expense;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, UUID>, JpaSpecificationExecutor<Expense> {
    List<Expense> findByUserId(UUID userId);
    Optional<Expense> findByUserIdAndId(UUID userId, UUID id);
    List<Expense> findByUserIdAndAccountId(UUID userId, UUID accountId);
    List<Expense> findByUserIdAndExpenseDateBetween(UUID userId, LocalDate start, LocalDate end);

    @Query("SELECT e FROM Expense e JOIN FETCH e.account WHERE e.user.id = :userId ORDER BY e.expenseDate DESC, e.id DESC")
    List<Expense> findRecentByUserId(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM Expense e WHERE e.user.id = :userId AND e.expenseDate BETWEEN :start AND :end")
    BigDecimal sumAmountByUserAndDateRange(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM Expense e WHERE e.user.id = :userId AND e.expenseDate = :date")
    BigDecimal sumAmountByUserAndDate(@Param("userId") UUID userId, @Param("date") LocalDate date);

    @Query("SELECT e.category, SUM(e.amount) FROM Expense e WHERE e.user.id = :userId AND e.expenseDate BETWEEN :start AND :end GROUP BY e.category")
    List<Object[]> sumAmountByCategory(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("SELECT YEAR(e.expenseDate), MONTH(e.expenseDate), SUM(e.amount) FROM Expense e WHERE e.user.id = :userId AND e.expenseDate BETWEEN :start AND :end GROUP BY YEAR(e.expenseDate), MONTH(e.expenseDate)")
    List<Object[]> sumAmountByMonth(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
