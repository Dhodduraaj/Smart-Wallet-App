package com.expensetracker.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDto {
    private UUID id;
    private String fullName;
    private String email;
    private LocalDateTime createdAt;
    private Boolean onboardingCompleted;
    private String avatar;
}
