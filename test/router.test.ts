import request from 'supertest';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import router from '../src/router.ts';

import { withContext } from './helpers/context.ts';
import { withServer } from './helpers/server.ts';
import { email, password, withUser } from './helpers/user.ts';

describe('Auth router', () => {
    const context = withContext();
    const server = withServer(context.config, server => {
        server.use(router(context));
    });
    const agent = request.agent(server);
    
    describe('POST /authenticate', () => {
        withUser(context);

        it('returns token', async () => {
            const res = await agent
                .post('/authenticate')
                .send({ email, password });

            expect(res.statusCode).toBe(200);
            expect(res.headers['set-cookie']).toEqual(
                expect.arrayContaining([expect.stringContaining('token=')])
            );
            expect(res.body.token).toBeDefined();
        });
    });

    describe('POST /authorize', () => {
        withUser(context);

        it('returns userId', async () => {
            const res = await agent
                .post('/authorize');

            expect(res.statusCode).toBe(200);
            expect(res.body.userId).toBeDefined();
        });

        it('rejects without token', async () => {
            await supertest(server)
                .post('/authorize')
                .expect(401);
        });

        it('rejects with invalid token', async () => {
            await supertest(server)
                .post('/authorize')
                .set('Authorization', 'Bearer invalidtoken')
                .expect(401);
        });
    });

    describe('POST /register', () => {
        it('registers user', async () => {
            await agent
                .post('/register')
                .send({ email, password })
                .expect(200);

            const user = await context.models.User.findOne({ email });

            expect(user).not.toBeNull();
            expect(user?.email).toBe(email);
        });

        afterAll(async () => {
            await context.models.User.deleteMany({ email });
        });
    });

    describe('POST /login', () => {
        withUser(context);

        it('logs user in', async () => {
            await agent
                .post('/login')
                .send({ email, password })
                .expect(200);
        });
    });

    describe('POST /logout', () => {
        withUser(context);

        it('logs user out', async () => {
            await agent
                .post('/logout')
                .send({})
                .expect(200);
        });
    });

    // it('sends reset password token for existing user', async () => {
    //     const email = 'api-reset@example.com';
    //     await context.services.Auth.register(email, 'Password123!');

    //     const res = await agent
    //         .post('/reset-password')
    //         .send({ email })
    //         .expect(200);

    //     expect(res.body.message).toContain('сброса пароля');

    //     const user = await context.models.User.findOne({ email });

    //     expect(user?.resetPasswordToken).toBeDefined();
    // });

    // it('activates account by token', async () => {
    //     const email = 'api-activate@example.com';
    //     const user = await context.services.Auth.register(email, 'Password123!');

    //     expect(user.activationToken).toBeDefined();

    //     const res = await agent
    //         .post(`/activate/${user.activationToken as string}`)
    //         .send({})
    //         .expect(200);

    //     expect(res.body.message).toContain('Аккаунт активирован');

    //     const updated = await context.models.User.findById(user.id);

    //     expect(updated?.activated).toBe(true);
    //     expect(updated?.activationToken).toBeUndefined();
    // });

    // it('resets password by token', async () => {
    //     const email = 'api-password@example.com';
    //     await context.services.Auth.register(email, 'OldPassword123!');
    //     await context.services.Auth.sendResetPasswordToken(email);

    //     const userWithToken = await context.models.User.findOne({ email });
    //     expect(userWithToken?.resetPasswordToken).toBeDefined();

    //     const res = await agent
    //         .post(`/reset-password/${userWithToken?.resetPasswordToken as string}`)
    //         .send({ password: 'NewPassword123!' })
    //         .expect(200);

    //     expect(res.body.message).toContain('Пароль изменен');

    //     const loginUser = await context.services.Auth.login(email, 'NewPassword123!');
    //     expect(loginUser.email).toBe(email);
    // });
});

