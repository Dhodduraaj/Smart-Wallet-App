package com.expensetracker.controller;

import com.expensetracker.dto.OnboardingRequest;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final UserService userService;

    @PostMapping("/complete")
    public ResponseEntity<Void> completeOnboarding(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody(required = false) OnboardingRequest onboardingRequest) {
        userService.completeOnboarding(userDetails.getId(), onboardingRequest);
        return new ResponseEntity<>(HttpStatus.OK);
    }
}
