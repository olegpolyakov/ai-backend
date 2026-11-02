import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';
import { NIL, v3 as uuid } from '@olegpolyakov/core/utils/uuid';

import router from '@/api/respond';
import type { Context } from '@/context';
import { MessageSchema } from '@/models';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const aiService = {
    respond: vi.fn<Context['services']['AI']['respond']>()
};

describe('Respond API', () => {
    const db = useDb();
    useUser(db);
    const Message = useModel(db, 'Message', MessageSchema, { beforeEach: true });
    const context = {
        models: { Message },
        services: { AI: aiService }
    } as unknown as Context;
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        aiService.respond.mockReset();
        aiService.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: 'Hello!'
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('POST /respond', () => {
        it('responds with the AI result using the default model', async () => {
            const res = await agent
                .post('/')
                .send({
                    input: 'Say hello'
                });

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/application\/json/);
            expect(res.body).toMatchObject({
                ok: true,
                data: {
                    role: 'assistant',
                    content: 'Hello!',
                    refs: []
                }
            });
            expect(res.body.data.id).toEqual(expect.any(String));
            expect(res.body.data.createdAt).toEqual(expect.any(String));
            expect(res.body.data.updatedAt).toEqual(expect.any(String));
            expect(aiService.respond).toHaveBeenCalledWith(USER_ID, 'Say hello', {
                model: '',
                format: undefined
            });
        });

        it('forwards the requested model, response format, and message history', async () => {
            const format = {
                type: 'object',
                properties: {
                    answer: { type: 'number' }
                },
                required: ['answer']
            };
            const input = [
                { role: 'user', content: 'Say hello' },
                { role: 'assistant', content: 'Hello.' },
                { role: 'user', content: 'Return an answer' }
            ];

            const res = await agent
                .post('/')
                .send({
                    input,
                    model: 'test-model',
                    format
                });

            expect(res.statusCode).toBe(200);
            expect(aiService.respond).toHaveBeenCalledWith(USER_ID, input, {
                model: 'test-model',
                format
            });
        });

        it('parses JSON-encoded message input and converts uploaded images and documents', async () => {
            const imageName = 'photo.png';
            const documentName = 'report.pdf';
            const imageBuffer = Buffer.from('image bytes');
            const documentBuffer = Buffer.from('document bytes');
            const input = [
                {
                    role: 'user',
                    content: 'Review these files',
                    refs: [
                        { kind: 'entity', type: 'file', id: uuid(imageName, NIL) },
                        { kind: 'entity', type: 'file', id: uuid(documentName, NIL) }
                    ]
                }
            ];

            const res = await agent
                .post('/')
                .field('input', JSON.stringify(input))
                .attach('files', imageBuffer, { filename: imageName, contentType: 'image/png' })
                .attach('files', documentBuffer, { filename: documentName, contentType: 'application/pdf' });

            expect(res.statusCode).toBe(200);
            expect(aiService.respond).toHaveBeenCalledWith(USER_ID, [
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: 'Review these files' },
                        {
                            type: 'image',
                            url: `data:image/png;base64,${imageBuffer.toString('base64')}`
                        },
                        {
                            type: 'file',
                            name: documentName,
                            content: `data:application/pdf;base64,${documentBuffer.toString('base64')}`
                        }
                    ],
                    refs: input[0].refs
                }
            ], {
                model: '',
                format: undefined
            });
        });

        it('returns a server error when the AI service fails', async () => {
            const error = new Error('AI service unavailable');
            aiService.respond.mockRejectedValue(error);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            const res = await agent
                .post('/')
                .send({
                    input: 'Say hello'
                });

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: 'Failed to process request' });
            expect(consoleError).toHaveBeenCalledWith('AI error:', error);
        });
    });
});
