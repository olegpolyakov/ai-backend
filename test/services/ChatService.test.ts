import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import { NotFoundError } from '@olegpolyakov/backend/server';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';

import { ConversationSchema, MemoryData, MemorySchema, MessageSchema } from '@/models';
import { ChatService, MemoryService } from '@/services';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('ChatService', () => {
    const db = useDb();
    const Conversation = useModel(db, 'Conversation', ConversationSchema, { beforeEach: true });
    const Message = useModel(db, 'Message', MessageSchema, { beforeEach: true });
    const Memory = useModel(db, 'Memory', MemorySchema, { beforeEach: true });
    const aiClient = {
        respond: vi.fn<AIClient['respond']>()
    };
    const embedService = {
        embed: vi.fn()
    };
    let memoryService: MemoryService;
    let chatService: ChatService;

    beforeEach(() => {
        aiClient.respond.mockReset();
        embedService.embed.mockReset();

        memoryService = new MemoryService(
            aiClient as unknown as AIClient,
            embedService as never,
            Memory
        );
        chatService = new ChatService(aiClient as unknown as AIClient, Conversation, Message, memoryService);
    });

    it('throws a NotFoundError when the conversation does not belong to the user', async () => {
        const conversationId = '123e4567-e89b-12d3-a456-426614174999';

        await expect(chatService.sendMessage(USER_ID, conversationId, 'Hello')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('uses recent conversation history and injected memory prompt when sending a message', async () => {
        const conversation = await Conversation.create({
            userId: USER_ID,
            title: 'Trips',
            model: 'test-model'
        });

        await Message.create([
            { conversationId: conversation.id, role: 'user', content: 'I am visiting Paris' },
            { conversationId: conversation.id, role: 'assistant', content: 'Nice! Paris is beautiful.' }
        ]);

        await Memory.create([
            $({ type: 'preference', content: 'Prefers concise answers', importance: 8 }),
            $({ type: 'fact', content: 'Lives in Paris', embedding: [1, 0] }),
            $({ userId: OTHER_USER_ID, type: 'fact', content: 'Lives in Rome', embedding: [0, 1] })
        ]);

        const extractMemories = vi.spyOn(memoryService, 'extractMemories').mockResolvedValue([]);
        embedService.embed.mockResolvedValue([[1, 0]]);
        aiClient.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: 'Here is the answer.'
            }
        });

        const response = await chatService.sendMessage(USER_ID, conversation.id.toString(), 'What city do I live in?');

        expect(response.content).toBe('Here is the answer.');
        expect(embedService.embed).toHaveBeenCalledWith('What city do I live in?');
        expect(extractMemories).toHaveBeenCalledOnce();

        const [messages, options] = aiClient.respond.mock.calls[0];

        expect(options).toEqual({ model: 'test-model' });
        expect(messages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                role: 'system',
                content: expect.stringContaining('User preferences\n- Prefers concise answers')
            }),
            expect.objectContaining({ role: 'user', content: 'I am visiting Paris' }),
            expect.objectContaining({ role: 'assistant', content: 'Nice! Paris is beautiful.' }),
            expect.objectContaining({ role: 'user', content: 'What city do I live in?' })
        ]));
    });

    it('creates the user and assistant messages and triggers memory extraction in the background', async () => {
        const conversation = await Conversation.create({
            userId: USER_ID,
            title: 'Travel',
            model: 'test-model'
        });

        const extractMemories = vi.spyOn(memoryService, 'extractMemories').mockResolvedValue([]);
        aiClient.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: 'Response content.'
            }
        });

        await chatService.sendMessage(USER_ID, conversation.id.toString(), 'I like hiking');

        const messages = await Message.find({ conversationId: conversation.id }).sort({ createdAt: 1 }).lean();

        expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
        expect(messages.map(message => message.content)).toEqual(['I like hiking', 'Response content.']);
        await Promise.resolve();
        expect(extractMemories).toHaveBeenCalledWith(
            USER_ID,
            'I like hiking',
            'test-model',
            expect.arrayContaining([expect.any(String), expect.any(String)])
        );
    });
});

function $({
    userId = USER_ID,
    type = 'fact',
    embedding = [1, 0],
    importance = 5,
    confidence = 0.9,
    ...rest
}: Partial<MemoryData>) {
    return {
        userId,
        type,
        embedding,
        importance,
        confidence,
        ...rest
    };
}
