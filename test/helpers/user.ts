import { afterAll, beforeAll } from 'vitest';

import type { User } from '@olegpolyakov/auth/core';

import type Context from '../../src/context.ts';

export const email = 'email@example.com';
export const password = 'Password123!';

export function withUser(context: Context) {
    const state = {
        user: {} as User
    };

    beforeAll(async () => {
        state.user = await context.models.User.create({ email, password });
    });

    afterAll(async () => {
        await context.models.User.deleteMany({ email });
    });

    return state;
}