# ADR-0001: Authentication for MVP

Status: Accepted
Date: 2026-08-24

## Decision

MVP / Beta 1.0 uses Supabase Auth with **email + password**.

Phone-number authentication with SMS is intentionally postponed until post-MVP. The current Figma screens that show phone/SMS auth are therefore not the source of truth for MVP authentication and should be updated to match email/password before design handoff.

## Rationale

- Email/password is already implemented and tested, including session restore and password recovery.
- SMS adds provider selection, message cost, deliverability, anti-abuse controls and country-specific operational risk.
- Application data is keyed by `auth.users.id` (UUID), not by email or phone, so a later auth-method change does not require rewriting ownership foreign keys for programs, workouts or statistics.

## Follow-up

- Keep `auth.users.id` as the only user identity used by application tables.
- Do not persist email/phone as ownership keys.
- Revisit phone + SMS after MVP validation.
- Align the affected Figma auth screens with this decision.
