# Design Document: Authentication Module

## Architecture

The authentication module uses a layered architecture:

- **Controller Layer**: Handles HTTP requests
- **Service Layer**: Business logic for auth operations
- **Repository Layer**: Database operations

## Data Model

### User Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | string | Unique email address |
| password_hash | string | Bcrypt hashed password |
| created_at | timestamp | Registration timestamp |

## API Endpoints

- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
