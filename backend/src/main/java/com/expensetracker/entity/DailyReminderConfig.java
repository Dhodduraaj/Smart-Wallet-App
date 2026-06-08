package com.expensetracker.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "daily_reminder_configs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DailyReminderConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(nullable = false)
    private boolean enabled = false;

    /** Trigger time stored in UTC (converted from user wall-clock on save). */
    @Column(name = "reminder_time", nullable = false)
    private LocalTime reminderTime = LocalTime.of(15, 30); // 21:00 Asia/Kolkata → UTC

    /**
     * IANA timezone for wall-clock input and scheduler comparison.
     * DB column added via db/migration/V002__add_reminder_zone_id.sql on Supabase.
     */
    @Column(name = "reminder_zone_id", nullable = false, length = 64)
    @Builder.Default
    private String reminderZoneId = "Asia/Kolkata";

    /** Prevents duplicate sends on the same calendar day (evaluated in reminder_zone_id). */
    @Column(name = "last_triggered_at")
    private LocalDateTime lastTriggeredAt;
}
