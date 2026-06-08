package com.expensetracker.controller;

import com.expensetracker.dto.FcmTokenRequest;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.FcmTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications/fcm")
@RequiredArgsConstructor
public class FcmTokenController {

    private final FcmTokenService fcmTokenService;

    @PostMapping("/register")
    public ResponseEntity<Void> registerToken(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody FcmTokenRequest request,
            HttpServletRequest httpRequest) {
        String userAgent = httpRequest.getHeader("User-Agent");
        fcmTokenService.registerToken(userDetails.getId(), request, userAgent);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    @DeleteMapping("/unregister")
    public ResponseEntity<Void> unregisterToken(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam String token) {
        fcmTokenService.unregisterToken(userDetails.getId(), token);
        return ResponseEntity.noContent().build();
    }
}
