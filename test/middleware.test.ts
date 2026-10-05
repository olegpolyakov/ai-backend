import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';

import { authenticate } from '../src/middleware.ts';

import { withServer } from './helpers/server.ts';

const JWT_SECRET = 'test-jwt-secret';

describe('Auth middleware', () => {
    const userId = '12345';
    const server = withServer({
        jwtSecret: JWT_SECRET,
        sessionSecret: 'test-session-key'
    }, server => {
        server.use(authenticate);
    });
    const request = supertest(server);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });

    describe('authenticate', () => {
        it('authenticates with a valid token', async () => {
            const response = await request
                .post('/test')
                .set('Authorization', `Bearer ${token}`)
                .send();

            expect(response.status).not.toBe(401);
        });

        it('rejects requests without an Authorization header', async () => {
            const response = await request
                .post('/test')
                .send();

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Authorization header is missing');
        });

        it('rejects requests with an unsupported authentication scheme', async () => {
            const response = await request
                .post('/test')
                .set('Authorization', `Basic ${token}`)
                .send();

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Authentication scheme is not supported');
        });

        it('rejects requests with an invalid token', async () => {
            const response = await request
                .post('/test')
                .set('Authorization', 'Bearer invalidtoken')
                .send();

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Authentication token is invalid');
        });
    });
});
