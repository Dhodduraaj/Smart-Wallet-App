package com.expensetracker.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UpdateAvatarRequest {
    @NotBlank(message = "Avatar identifier is required")
    private String avatar;
}
