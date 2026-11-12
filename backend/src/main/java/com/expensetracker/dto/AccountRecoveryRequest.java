package com.expensetracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountRecoveryRequest {
    private String email;
    private String password;
    private String localUserId;
    private String fullName;
    private Map<String, Object> payload;
}
