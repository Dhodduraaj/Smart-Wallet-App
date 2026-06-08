package com.expensetracker.repository;

import com.expensetracker.entity.FcmDeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FcmDeviceTokenRepository extends JpaRepository<FcmDeviceToken, UUID> {
    List<FcmDeviceToken> findByUserId(UUID userId);
    Optional<FcmDeviceToken> findByFcmToken(String fcmToken);
    void deleteByFcmToken(String fcmToken);
}
