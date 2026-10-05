import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import AuthService from '../src/service.ts';

import { withContext } from './helpers/context.ts';
import { mockSession } from './helpers/server.ts';
import { email, password, withUser } from './helpers/user.ts';

describe('Auth service', () => {
    const context = withContext();

    let service: ReturnType<typeof AuthService>;
    beforeAll(() => {
        service = AuthService(context.models);
    });

    describe('createUser', () => {
        it('creates user with email and password', async () => {
            const user = await service.createUser(email, password);

            expect(user).toBeDefined();
            expect(user.email).toBe(email);
        });

        afterAll(async () => {
            await context.models.User.deleteMany({ email });
        });
    });

    describe('authenticateUser', () => {
        withUser(context);

        it('authenticates user with correct email and password', async () => {
            const user = await service.authenticateUser(email, password);

            expect(user).toBeDefined();
            expect(user.email).toBe(email);
        });

        it('throws error with incorrect password', async () => {
            await expect(service.authenticateUser(email, 'WrongPassword!')).rejects.toThrow('Incorrect email or password');
        });

        it('throws error with non-existent email', async () => {
            await expect(service.authenticateUser('nonexistent@example.com', password)).rejects.toThrow('Incorrect email or password');
        });
    });

    describe('login', () => {
        const state = withUser(context);

        it('logs user in', async () => {
            const { user } = state;
            const session = mockSession();

            await service.login(user.id, session);

            expect(session.regenerate).toHaveBeenCalled();
            expect(session.save).toHaveBeenCalled();
        });

        it('throws error if session is not provided', async () => {
            const { user } = state;

            await expect(service.login(user.id, undefined as any)).rejects.toThrow('Session is required to log in.');
        });
    });

    describe('logout', () => {
        withUser(context);

        it('logs user out', async () => {
            const session = mockSession();

            await service.logout(session);

            expect(session.save).toHaveBeenCalled();
            expect(session.regenerate).toHaveBeenCalled();
        });

        it('throws error if session is not provided', async () => {
            await expect(service.logout(undefined as any)).rejects.toThrow('Session is required to log out.');
        });
    });
});
