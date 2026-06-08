package com.expensetracker.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OnboardingRequest {
    @NotEmpty(message = "At least one account is required")
    private List<InitialAccountDto> accounts;
}
