package com.expensetracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchSyncRequest {
    private UUID userId;
    private String email;
    private List<SyncOperationDto> operations;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SyncOperationDto {
        private String id;
        private String entityType; // ACCOUNT, EXPENSE, INCOME, TRANSFER, REMINDER
        private String operationType; // CREATE, UPDATE, DELETE
        private String entityId;
        private Map<String, Object> payload;
        private String createdAt;
    }
}

