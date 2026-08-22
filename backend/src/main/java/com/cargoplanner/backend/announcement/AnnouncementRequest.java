package com.cargoplanner.backend.announcement;

import java.time.LocalDate;

public record AnnouncementRequest(
    String title,
    String contentMarkdown,
    String imageUrl,
    String illustrationRef,
    String audience,
    LocalDate displayDate,
    String status
) {}
