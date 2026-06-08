package com.expensetracker.repository;

import com.expensetracker.entity.UpcomingPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UpcomingPaymentRepository extends JpaRepository<UpcomingPayment, UUID> {
    List<UpcomingPayment> findByUserId(UUID userId);
    Optional<UpcomingPayment> findByUserIdAndId(UUID userId, UUID id);
    
    @Query("""
            SELECT u FROM UpcomingPayment u JOIN FETCH u.user
            WHERE u.completed = false AND u.reminderDate = :date AND u.reminderNotified = false
            """)
    List<UpcomingPayment> findPendingRemindersForDate(LocalDate date);
}
