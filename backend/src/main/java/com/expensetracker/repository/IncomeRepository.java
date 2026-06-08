package com.expensetracker.repository;

import com.expensetracker.entity.Income;
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
public interface IncomeRepository extends JpaRepository<Income, UUID>, JpaSpecificationExecutor<Income> {
    List<Income> findByUserId(UUID userId);
    Optional<Income> findByUserIdAndId(UUID userId, UUID id);
    List<Income> findByUserIdAndAccountId(UUID userId, UUID accountId);
    List<Income> findByUserIdAndIncomeDateBetween(UUID userId, LocalDate start, LocalDate end);

    @Query("SELECT COALESCE(SUM(i.amount), 0) FROM Income i WHERE i.user.id = :userId AND i.incomeDate BETWEEN :start AND :end")
    BigDecimal sumAmountByUserAndDateRange(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("SELECT YEAR(i.incomeDate), MONTH(i.incomeDate), SUM(i.amount) FROM Income i WHERE i.user.id = :userId AND i.incomeDate BETWEEN :start AND :end GROUP BY YEAR(i.incomeDate), MONTH(i.incomeDate)")
    List<Object[]> sumAmountByMonth(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
