package com.expensetracker.repository;

import com.expensetracker.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AccountRepository extends JpaRepository<Account, UUID> {
    List<Account> findByUserId(UUID userId);

    @Query("SELECT COALESCE(SUM(a.currentBalance), 0) FROM Account a WHERE a.user.id = :userId")
    BigDecimal sumCurrentBalanceByUserId(@Param("userId") UUID userId);
    Optional<Account> findByUserIdAndId(UUID userId, UUID id);
    boolean existsByUserIdAndAccountType(UUID userId, String accountType);
    long countByUserIdAndAccountTypeIgnoreCase(UUID userId, String accountType);
    List<Account> findByUserIdAndAccountTypeIgnoreCaseOrderByCreatedAtAsc(UUID userId, String accountType);
}
