# Product Requirements Document: User Authentication

## Overview

Implement a secure user authentication system for the web application.

## Requirements

1. Users can register with email and password
2. Users can log in with registered credentials
3. Passwords must be hashed before storage
4. Session management with JWT tokens
5. Rate limiting on login attempts

## Success Criteria

- Registration flow completes in under 2 seconds
- Login flow completes in under 1 second
- Failed login attempts are rate-limited to 5 per minute
