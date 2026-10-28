import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';

import router from '@/api/memories';
import type { Context } from '@/context';
import { MemorySchema } from '@/models';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('Memories API', () => {
    const db = useDb();
    useUser(db);
    const Memory = useModel(db, 'Memory', MemorySchema, { beforeEach: true });
    const embedService = {
        embed: vi.fn<Context['services']['Embed']['embed']>()
    };
    const context = {
        models: { Memory },
        services: { Embed: embedService }
    } as unknown as Context;
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        embedService.embed.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /memories', () => {
        it('lists only the current user\'s memories by importance', async () => {
            await Memory.create([
                { userId: USER_ID, type: 'fact', content: 'Lower priority', importance: 2 },
                { userId: USER_ID, type: 'fact', content: 'Higher priority', importance: 8 },
                { userId: OTHER_USER_ID, type: 'fact', content: 'Another user\'s memory', importance: 10 }
            ]);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.map((memory: { content: string }) => memory.content)).toEqual([
                'Higher priority',
                'Lower priority'
            ]);
        });
    });

    describe('POST /memories', () => {
        it('creates a memory for the current user', async () => {
            const res = await agent
                .post('/')
                .send({
                    userId: OTHER_USER_ID,
                    type: 'preference',
                    content: 'Prefers short answers',
                    importance: 7
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toMatchObject({
                userId: USER_ID,
                type: 'preference',
                content: 'Prefers short answers',
                importance: 7
            });

            const memory = await Memory.findOne({ content: 'Prefers short answers' });
            expect(memory?.userId.toString()).toBe(USER_ID);
        });
    });

    describe('PUT /memories/:memoryId', () => {
        it('updates memory content and its embedding', async () => {
            const [memory] = await Memory.create([
                { userId: USER_ID, type: 'fact', content: 'Old content' }
            ]);
            embedService.embed.mockResolvedValue([[0.1, 0.2]]);

            const res = await agent
                .put(`/${memory.id}`)
                .send({ content: '  Updated content  ' });
            const updated = await Memory.findById(memory.id);

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(embedService.embed).toHaveBeenCalledWith('Updated content');
            expect(updated?.content).toBe('Updated content');
        });

        it('rejects empty content without requesting an embedding', async () => {
            const [memory] = await Memory.create([
                { userId: USER_ID, type: 'fact', content: 'Original content' }
            ]);

            const res = await agent
                .put(`/${memory.id}`)
                .send({ content: '   ' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ ok: false, message: 'Content is empty' });
            expect(embedService.embed).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /memories/:memoryId', () => {
        it('deletes a memory owned by the current user', async () => {
            const [memory] = await Memory.create([
                { userId: USER_ID, type: 'fact', content: 'Remove this memory' }
            ]);

            const res = await agent.delete(`/${memory.id}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: { id: memory.id } });
            expect(await Memory.findById(memory.id)).toBeNull();
        });
    });
});