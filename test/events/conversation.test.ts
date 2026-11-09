import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';
import { USER_ID } from '@olegpolyakov/backend/test/mocks/user';
import { EntityEvent } from '@olegpolyakov/core/entities/entity';

import ConversationEvents from '@/events/conversation';
import type { Models } from '@/models';
import ConversationSchema from '@/models/conversation';
import MessageSchema, { type MessageDocument } from '@/models/message';
import type { Services } from '@/services';
import type AIService from '@/services/ai';

describe('Conversation events', () => {
    const db = useDb();
    const Conversation = useModel(db, 'Conversation', ConversationSchema, { beforeEach: true });
    const Message = useModel(db, 'Message', MessageSchema, { beforeEach: true });
    const aiService = {
        respond: vi.fn<AIService['respond']>()
    };
    let onMessageCreated: (message: MessageDocument) => Promise<void>;

    beforeAll(() => {
        ConversationEvents(
            { Conversation, Message } as unknown as Models,
            { AI: aiService } as unknown as Services
        );

        const [listener] = Message.events.listeners(EntityEvent.Created);

        if (!listener) throw new Error('Conversation created event handler was not registered');

        onMessageCreated = listener as (message: MessageDocument) => Promise<void>;
    });

    afterAll(() => {
        Message.events.removeListener(EntityEvent.Created, onMessageCreated);
    });

    beforeEach(() => {
        aiService.respond.mockReset();
        aiService.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: 'Generated title'
            }
        });
    });

    it('does nothing when the conversation does not exist', async () => {
        const message = await Message.create({
            conversationId: new Types.UUID(),
            role: 'user',
            content: 'Hello'
        });

        await onMessageCreated(message);

        expect(aiService.respond).not.toHaveBeenCalled();
    });

    it('does not replace an existing conversation title', async () => {
        const conversation = await Conversation.create({
            title: 'Existing title',
            userId: USER_ID
        });
        const message = await Message.create({
            conversationId: conversation.id,
            role: 'user',
            content: 'Hello'
        });

        await onMessageCreated(message);

        expect(aiService.respond).not.toHaveBeenCalled();
        expect((await Conversation.findById(conversation.id))?.title).toBe('Existing title');
    });

    it('waits for at least two messages before generating a title', async () => {
        const conversation = await Conversation.create({ userId: USER_ID });
        const message = await Message.create({
            conversationId: conversation.id,
            role: 'user',
            content: 'Hello'
        });

        await onMessageCreated(message);

        expect(aiService.respond).not.toHaveBeenCalled();
        expect((await Conversation.findById(conversation.id))?.title).toBe('');
    });

    it('generates and saves a title from the conversation messages', async () => {
        const conversation = await Conversation.create({ userId: USER_ID });
        await Message.create([
            {
                conversationId: conversation.id,
                role: 'user',
                content: 'How is the weather?'
            },
            {
                conversationId: conversation.id,
                role: 'assistant',
                content: 'It is sunny.'
            }
        ]);
        const latestMessage = await Message.create({
            conversationId: conversation.id,
            role: 'user',
            content: 'Thanks!'
        });

        await onMessageCreated(latestMessage);

        expect(aiService.respond).toHaveBeenCalledTimes(1);
        expect((await Conversation.findById(conversation.id))?.title).toBe('Generated title');
    });

    it('leaves the conversation title unchanged when the AI returns no title', async () => {
        const conversation = await Conversation.create({ userId: USER_ID });
        const messages = await Message.create([
            { conversationId: conversation.id, role: 'user', content: 'Hello' },
            { conversationId: conversation.id, role: 'assistant', content: 'Hi' }
        ]);
        aiService.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: ''
            }
        });

        await onMessageCreated(messages[1]);

        expect((await Conversation.findById(conversation.id))?.title).toBe('');
    });
});
