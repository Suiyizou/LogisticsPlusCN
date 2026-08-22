package com.cargoplanner.backend.customer;

public record CustomerLoginRequest(String username, String password, String customerCode) {}
