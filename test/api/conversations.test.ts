import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@olegpolyakov/backend/server';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';
import { useServer } from '@olegpolyakov/backend/test/mocks/server';
import { USER_ID, useUser } from '@olegpolyakov/backend/test/mocks/user';

import router from '@/api/conversations';
import type { Context } from '@/context';
import { ConversationSchema, MessageRole, MessageSchema } from '@/models';

const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const FILE_REF = {
    kind: 'entity',
    type: 'file',
    id: 'file-123',
    mimeType: 'image/png'
} as const;

describe('Conversations API', () => {
    const db = useDb();
    useUser(db);
    const Conversation = useModel(db, 'Conversation', ConversationSchema, { beforeEach: true });
    const Message = useModel(db, 'Message', MessageSchema, { beforeEach: true });
    const chatService = {
        sendMessage: vi.fn<Context['services']['Chat']['sendMessage']>()
    };
    const fileService = {
        setAccessToken: vi.fn<Context['services']['File']['setAccessToken']>()
    };
    const context = {
        models: { Conversation, Message },
        services: { Chat: chatService, File: fileService }
    } as unknown as Context;
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        chatService.sendMessage.mockReset();
        fileService.setAccessToken.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /conversations', () => {
        it('lists only the current user’s conversations', async () => {
            await Conversation.create([
                { userId: USER_ID, title: 'My conversation' },
                { userId: OTHER_USER_ID, title: 'Another user’s conversation' }
            ]);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0]).toMatchObject({
                userId: USER_ID,
                title: 'My conversation',
                unreadMessagesCount: 0
            });

        });

        it('counts only unread assistant messages', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            await Message.create([
                { conversationId: conversation.id, role: 'user', content: 'User message' },
                { conversationId: conversation.id, role: 'assistant', content: 'First reply' },
                { conversationId: conversation.id, role: 'assistant', content: 'Second reply' }
            ]);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].unreadMessagesCount).toBe(2);
        });
    });

    describe('POST /conversations', () => {
        it('creates a conversation for the current user', async () => {
            const res = await agent.post('/').send({
                title: 'New conversation',
                userId: OTHER_USER_ID
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                ok: true,
                data: {
                    userId: USER_ID,
                    title: 'New conversation'
                }
            });
            expect(await Conversation.countDocuments({ userId: USER_ID })).toBe(1);
        });
    });

    describe('PATCH /conversations/:conversationId', () => {
        it('updates conversation details', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });

            const res = await agent.patch(`/${conversation.id}`).send({
                title: 'Updated title',
                description: 'Updated description',
                model: 'test-model'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toMatchObject({
                title: 'Updated title',
                description: 'Updated description',
                model: 'test-model'
            });
            expect(await Conversation.findById(conversation.id)).toMatchObject({
                title: 'Updated title',
                description: 'Updated description',
                model: 'test-model'
            });
        });

        it('rejects an update with no fields', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });

            const res = await agent.patch(`/${conversation.id}`).send({});

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ ok: false, message: 'No fields to update' });
        });
    });

    describe('DELETE /conversations/:conversationId', () => {
        it('deletes the conversation and its messages', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            await Message.create({
                conversationId: conversation.id,
                content: 'Message to delete',
                role: 'user'
            });

            const res = await agent.delete(`/${conversation.id}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true });
            expect(await Conversation.findById(conversation.id)).toBeNull();
            expect(await Message.countDocuments({ conversationId: conversation.id })).toBe(0);
        });
    });

    describe('PATCH /conversations/:conversationId/view', () => {
        it('marks a conversation as viewed', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });

            const res = await agent.patch(`/${conversation.id}/view`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true });
            expect((await Conversation.findById(conversation.id))?.viewedAt).toBeInstanceOf(Date);
        });
    });

    describe('GET /conversations/:conversationId/messages', () => {
        it('returns message IDs keyed by message and ordered by creation time', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const [earlier, later] = await Message.create([
                {
                    conversationId: conversation.id,
                    role: 'user',
                    content: 'First message',
                    refs: [FILE_REF],
                    createdAt: new Date('2026-01-01T00:00:00.000Z')
                },
                {
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: 'Second message',
                    createdAt: new Date('2026-01-02T00:00:00.000Z')
                }
            ]);

            const res = await agent.get(`/${conversation.id}/messages`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                ok: true,
                data: {
                    messagesInOrder: [earlier.id, later.id]
                }
            });
            expect(res.body.data.messagesById[earlier.id].content).toBe('First message');
            expect(res.body.data.messagesById[earlier.id].refs).toEqual([FILE_REF]);
            expect(res.body.data.messagesById[later.id].content).toBe('Second message');
        });
    });

    describe('POST /conversations/:conversationId/messages', () => {
        it('sends a message through the chat service', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const message = {
                role: 'assistant' as MessageRole,
                content: 'Hello!'
            };
            chatService.sendMessage.mockResolvedValue(message);

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Hi!' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: message });
            expect(fileService.setAccessToken).toHaveBeenCalledWith('test-token');
            expect(chatService.sendMessage).toHaveBeenCalledWith(USER_ID, conversation.id, 'Hi!', undefined);
        });

        it('passes file references to the chat service without requiring text content', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            chatService.sendMessage.mockResolvedValue({
                role: 'assistant',
                content: 'I can see the image.'
            });

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ refs: [FILE_REF] });

            expect(res.statusCode).toBe(200);
            expect(chatService.sendMessage).toHaveBeenCalledWith(USER_ID, conversation.id, undefined, [FILE_REF]);
        });

        it('rejects a message without content or references', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'The message can not be empty' });
            expect(chatService.sendMessage).not.toHaveBeenCalled();
        });

        it('returns 404 when the chat service cannot find the conversation', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            chatService.sendMessage.mockRejectedValue(new NotFoundError('Conversation not found'));

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Hello!' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ ok: false, message: 'Conversation not found' });
        });
    });

    describe('PATCH /conversations/:conversationId/messages/:messageId', () => {
        it('updates a message’s content', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const message = await Message.create({
                conversationId: conversation.id,
                role: 'user',
                content: 'Old content'
            });

            const res = await agent
                .patch(`/${conversation.id}/messages/${message.id}`)
                .send({ content: '  Updated content  ' });

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.content).toBe('Updated content');
            expect((await Message.findById(message.id))?.content).toBe('Updated content');
        });

        it('rejects empty message content', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const message = await Message.create({
                conversationId: conversation.id, 
                role: 'user',
                content: 'Existing content'
            });

            const res = await agent
                .patch(`/${conversation.id}/messages/${message.id}`)
                .send({ content: '   ' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ ok: false, message: 'Content is required' });
        });
    });

    describe('DELETE /conversations/:conversationId/messages/:messageId', () => {
        it('deletes a message from the conversation', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const message = await Message.create({
                conversationId: conversation.id,
                role: 'user',
                content: 'Remove this message'
            });

            const res = await agent.delete(`/${conversation.id}/messages/${message.id}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: { id: message.id } });
            await expect(Message.findById(message.id)).resolves.toBeNull();
        });
    });
});