import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';

import router from '@/api/respond';
import type { Context } from '@/context';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const aiService = {
    respond: vi.fn<Context['services']['AI']['respond']>()
};

const context = {
    services: {
        AI: aiService
    }
} as unknown as Context;

describe('Respond API', () => {
    const db = useDb();
    useUser(db);
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        aiService.respond.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('POST /respond', () => {
        it('responds with the AI result using the default model', async () => {
            aiService.respond.mockResolvedValue('Hello!');

            const res = await agent
                .post('/')
                .send({
                    prompt: 'Say hello'
                });

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/application\/json/);
            expect(res.body).toEqual({ ok: true, data: 'Hello!' });
            expect(aiService.respond).toHaveBeenCalledWith(USER_ID, 'Say hello', {
                model: 'gemma4:31b-cloud'
            });
        });

        it('forwards the requested model and response format', async () => {
            aiService.respond.mockResolvedValue('{"answer":42}');
            const format = {
                type: 'object',
                properties: {
                    answer: { type: 'number' }
                },
                required: ['answer']
            };

            const res = await agent
                .post('/')
                .send({
                    prompt: 'Return an answer',
                    model: 'test-model',
                    format
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: '{"answer":42}' });
            expect(aiService.respond).toHaveBeenCalledWith(USER_ID, 'Return an answer', {
                model: 'test-model',
                format
            });
        });

        it('returns a server error when the AI service fails', async () => {
            const error = new Error('AI service unavailable');
            aiService.respond.mockRejectedValue(error);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            const res = await agent
                .post('/')
                .send({
                    prompt: 'Say hello'
                });

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to process request' });
            expect(consoleError).toHaveBeenCalledWith('AI error:', error);
        });
    });
});