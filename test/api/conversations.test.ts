import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        reply: vi.fn<Context['services']['Chat']['reply']>()
    };
    const memoryService = {
        extractMemories: vi.fn<Context['services']['Memory']['extractMemories']>()
    };
    const context = {
        models: { Conversation, Message },
        services: { Chat: chatService, Memory: memoryService }
    } as unknown as Context;
    const server = useServer({ host: HOST, port: PORT, userId: USER_ID }, router(context));
    const agent = supertest.agent(server);

    beforeEach(() => {
        chatService.reply.mockReset();
        memoryService.extractMemories.mockReset();
        memoryService.extractMemories.mockResolvedValue([]);
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

        it('counts only assistant messages created after the conversation was viewed', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation',
                viewedAt: new Date('2026-01-02T00:00:00.000Z')
            });
            await Message.create([
                { conversationId: conversation.id, role: 'assistant', content: 'Seen', createdAt: new Date('2026-01-01T00:00:00.000Z') },
                { conversationId: conversation.id, role: 'assistant', content: 'Unseen', createdAt: new Date('2026-01-03T00:00:00.000Z') }
            ]);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].unreadMessagesCount).toBe(1);
        });

        it('includes the last message of each conversation', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            await Message.create([
                { conversationId: conversation.id, role: 'user', content: 'First', createdAt: new Date('2026-01-01T00:00:00.000Z') },
                { conversationId: conversation.id, role: 'assistant', content: 'Last', createdAt: new Date('2026-01-02T00:00:00.000Z') }
            ]);

            const res = await agent.get('/');

            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].lastMessage).toEqual({
                content: 'Last',
                createdAt: '2026-01-02T00:00:00.000Z'
            });
        });
    });

    describe('POST /conversations', () => {
        it('creates a conversation for the current user', async () => {
            const res = await agent.post('/').send({
                title: 'Untitled conversation',
                userId: OTHER_USER_ID
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                ok: true,
                data: {
                    title: 'Untitled conversation',
                    userId: USER_ID
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
            expect(res.body).toEqual({ error: 'No fields to update' });
        });

        it('does not update another user’s conversation', async () => {
            const conversation = await Conversation.create({
                userId: OTHER_USER_ID,
                title: 'Conversation'
            });

            const res = await agent.patch(`/${conversation.id}`).send({ title: 'Hijacked' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Conversation not found' });
            expect((await Conversation.findById(conversation.id))?.title).toBe('Conversation');
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
        it('stores the user message, replies through the chat service and stores the reply', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation',
                model: 'test-model'
            });
            const reply = {
                role: 'assistant' as MessageRole,
                content: 'Hello!'
            };
            chatService.reply.mockResolvedValue(reply as Awaited<ReturnType<Context['services']['Chat']['reply']>>);

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Hi!' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: reply });

            const messages = await Message
                .find({ conversationId: conversation.id })
                .sort({ createdAt: 1 });

            expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
                { role: 'user', content: 'Hi!' },
                { role: 'assistant', content: 'Hello!' }
            ]);
            expect(chatService.reply).toHaveBeenCalledWith({
                userId: USER_ID,
                accessToken: 'test-token',
                messages: [expect.objectContaining({ role: 'user', content: 'Hi!' })],
                model: 'test-model'
            });
            expect(memoryService.extractMemories).toHaveBeenCalledWith(
                USER_ID,
                'Hi!',
                'test-model',
                [messages[0].id, messages[1].id]
            );
        });

        it('passes file references to the chat service without requiring text content', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            chatService.reply.mockResolvedValue({
                role: 'assistant',
                content: 'I can see the image.'
            } as Awaited<ReturnType<Context['services']['Chat']['reply']>>);

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ refs: [FILE_REF] });

            expect(res.statusCode).toBe(200);

            const [{ messages }] = chatService.reply.mock.calls[0];

            expect(messages).toHaveLength(1);
            expect(messages[0]).toMatchObject({ role: 'user', refs: [FILE_REF] });
        });

        it('sends the most recent history in chronological order', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            await Message.create(Array.from({ length: 30 }, (_, index) => ({
                conversationId: conversation.id,
                role: (index % 2 ? 'assistant' : 'user') as MessageRole,
                content: `Message ${index}`,
                createdAt: new Date(Date.UTC(2026, 0, 1, 0, index))
            })));
            chatService.reply.mockResolvedValue({
                role: 'assistant',
                content: 'Reply'
            } as Awaited<ReturnType<Context['services']['Chat']['reply']>>);

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Latest message' });

            expect(res.statusCode).toBe(200);

            const [{ messages }] = chatService.reply.mock.calls[0];

            expect(messages).toHaveLength(25);
            expect(messages[0].content).toBe('Message 6');
            expect(messages.at(-1)?.content).toBe('Latest message');
        });

        it('responds even when memory extraction fails', async () => {
            const conversation = await Conversation.create({
                userId: USER_ID,
                title: 'Conversation'
            });
            const reply = {
                role: 'assistant' as MessageRole,
                content: 'Hello!'
            };
            chatService.reply.mockResolvedValue(reply as Awaited<ReturnType<Context['services']['Chat']['reply']>>);
            memoryService.extractMemories.mockRejectedValue(new Error('Extraction failed'));
            vi.spyOn(console, 'error').mockImplementation(() => {});

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Hi!' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: reply });
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
            expect(chatService.reply).not.toHaveBeenCalled();
            expect(await Message.countDocuments({ conversationId: conversation.id })).toBe(0);
        });

        it('does not send messages to another user’s conversation', async () => {
            const conversation = await Conversation.create({
                userId: OTHER_USER_ID,
                title: 'Another user’s conversation'
            });

            const res = await agent
                .post(`/${conversation.id}/messages`)
                .send({ content: 'Hello!' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Conversation not found' });
            expect(chatService.reply).not.toHaveBeenCalled();
            expect(await Message.countDocuments({ conversationId: conversation.id })).toBe(0);
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
                .send({ content: '' });

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ error: 'Content is required' });
            expect((await Message.findById(message.id))?.content).toBe('Existing content');
        });

        it('does not update messages in another user’s conversation', async () => {
            const conversation = await Conversation.create({
                userId: OTHER_USER_ID,
                title: 'Conversation'
            });
            const message = await Message.create({
                conversationId: conversation.id,
                role: 'user',
                content: 'Original content'
            });

            const res = await agent
                .patch(`/${conversation.id}/messages/${message.id}`)
                .send({ content: 'Hijacked' });

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Conversation not found' });
            expect((await Message.findById(message.id))?.content).toBe('Original content');
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

        it('does not delete messages from another user’s conversation', async () => {
            const conversation = await Conversation.create({
                userId: OTHER_USER_ID,
                title: 'Conversation'
            });
            const message = await Message.create({
                conversationId: conversation.id,
                role: 'user',
                content: 'Keep this message'
            });

            const res = await agent.delete(`/${conversation.id}/messages/${message.id}`);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: 'Conversation not found' });
            expect(await Message.findById(message.id)).not.toBeNull();
        });
    });
});