import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';

import router from '@/api/models';
import type { Context } from '@/context';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const aiService = {
    getModels: vi.fn<Context['services']['AI']['getModels']>()
};

const context = {
    services: {
        AI: aiService
    }
} as unknown as Context;

describe('Models API', () => {
    const db = useDb();
    useUser(db);
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        aiService.getModels.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /models', () => {
        it('lists the available AI models', async () => {
            const models = [{ id: 'test-model' }, { id: 'test-model-2' }];
            aiService.getModels.mockResolvedValue(models);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/application\/json/);
            expect(res.body).toEqual({ ok: true, data: models });
            expect(aiService.getModels).toHaveBeenCalledOnce();
        });

        it('returns a server error when the AI service fails', async () => {
            const error = new Error('Model lookup failed');
            aiService.getModels.mockRejectedValue(error);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Model lookup failed' });
        });
    });
});
