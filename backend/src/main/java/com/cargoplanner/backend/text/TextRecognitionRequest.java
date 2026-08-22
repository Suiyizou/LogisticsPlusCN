package com.cargoplanner.backend.text;

public record TextRecognitionRequest(
    String text,
    String sourceName,
    String mode,
    String languageHint
) {}
