import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';

import router from '@/api/embed';
import type { Context } from '@/context';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const embedService = {
    embed: vi.fn<Context['services']['Embed']['embed']>()
};
const context = {
    services: {
        Embed: embedService
    }
} as unknown as Context;

describe('Embed API', () => {
    const db = useDb();
    useUser(db);
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        embedService.embed.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('POST /embed', () => {
        it('returns the embedding for the requested input and model', async () => {
            const embedding = [[0.1, 0.2, 0.3]];
            embedService.embed.mockResolvedValue(embedding);

            const res = await agent
                .post('/')
                .send({
                    input: 'Hello, world!',
                    model: 'test-embedding-model'
                });

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/application\/json/);
            expect(res.body).toEqual({ ok: true, data: embedding });
            expect(embedService.embed).toHaveBeenCalledWith('Hello, world!', 'test-embedding-model');
        });

        it('rejects a missing input', async () => {
            const res = await agent
                .post('/')
                .send({ model: 'test-embedding-model' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'Input is required' });
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('rejects a missing model', async () => {
            const res = await agent
                .post('/')
                .send({ input: 'Hello, world!' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'Model is required' });
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('returns a server error when the embedding service fails', async () => {
            const error = new Error('Embedding service unavailable');
            embedService.embed.mockRejectedValue(error);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            const res = await agent
                .post('/')
                .send({
                    input: 'Hello, world!',
                    model: 'test-embedding-model'
                });

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to process request' });
            expect(consoleError).toHaveBeenCalledWith('AI error:', error);
        });
    });
});