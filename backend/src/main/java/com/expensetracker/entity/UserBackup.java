package com.expensetracker.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_backup")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserBackup {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload")
    private String payload;

    @Column(name = "last_sync")
    private LocalDateTime lastSync;
}
