package com.expensetracker.repository;

import com.expensetracker.entity.DailyReminderConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DailyReminderConfigRepository extends JpaRepository<DailyReminderConfig, UUID> {
    Optional<DailyReminderConfig> findByUserId(UUID userId);

    @Query("SELECT c FROM DailyReminderConfig c JOIN FETCH c.user u WHERE c.enabled = true")
    List<DailyReminderConfig> findEnabledWithUser();
}
