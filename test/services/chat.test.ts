import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import type { FileService } from '@olegpolyakov/backend/features/files';
import { NotFoundError } from '@olegpolyakov/backend/server';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';

import { ConversationSchema, MemoryData, MemorySchema, MessageSchema } from '@/models';
import { ChatService, MemoryService } from '@/services';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const IMAGE_REF = {
    kind: 'entity',
    type: 'file',
    id: 'image-123',
    mimeType: 'application/pdf'
} as const;
const DOCUMENT_REF = {
    kind: 'entity',
    type: 'file',
    id: 'document-456',
    mimeType: 'image/png'
} as const;

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
    const fileService = {
        get: vi.fn<FileService['get']>(),
        getUrl: vi.fn<FileService['getUrl']>()
    };
    let memoryService: MemoryService;
    let chatService: ChatService;

    beforeEach(() => {
        aiClient.respond.mockReset();
        embedService.embed.mockReset();
        fileService.get.mockReset();
        fileService.getUrl.mockReset();

        memoryService = new MemoryService(
            aiClient as unknown as AIClient,
            embedService as never,
            Memory
        );
        chatService = new ChatService(
            aiClient as unknown as AIClient,
            Conversation,
            Message,
            memoryService,
            fileService as unknown as FileService
        );
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

    it('resolves image and document references when building the AI input', async () => {
        const conversation = await Conversation.create({
            userId: USER_ID,
            title: 'Attachments',
            model: 'test-model'
        });
        await Message.create({
            conversationId: conversation.id,
            role: 'user',
            content: 'See attached',
            refs: [IMAGE_REF]
        });
        const extractMemories = vi.spyOn(memoryService, 'extractMemories').mockResolvedValue([]);
        fileService.get.mockImplementation(async fileId => ({
            id: fileId,
            name: fileId,
            path: fileId,
            hash: fileId,
            type: fileId === 'image-123' ? 'image/png' : 'application/pdf',
            size: 0
        }));
        fileService.getUrl.mockImplementation(async fileId => `https://files.example/${fileId}`);
        aiClient.respond.mockResolvedValue({
            message: {
                role: 'assistant',
                content: 'I reviewed the attachments.'
            }
        });

        await chatService.sendMessage(
            USER_ID,
            conversation.id.toString(),
            'What is in this document?',
            [DOCUMENT_REF]
        );

        const [messages] = aiClient.respond.mock.calls[0];
        
        expect(messages.at(-1)).toEqual({
            role: 'user',
            content: [
                { type: 'text', content: 'What is in this document?' },
                { type: 'file', url: 'https://files.example/document-456' }
            ]
        });
        expect(messages.at(-2)).toEqual({
            role: 'user',
            content: [
                { type: 'text', content: 'See attached' },
                { type: 'image', url: 'https://files.example/image-123' }
            ]
        });
        expect(fileService.getUrl).toHaveBeenNthCalledWith(1, 'image-123');
        expect(fileService.getUrl).toHaveBeenNthCalledWith(2, 'document-456');
        expect(fileService.get).toHaveBeenNthCalledWith(1, 'image-123');
        expect(fileService.get).toHaveBeenNthCalledWith(2, 'document-456');
        expect(await Message.findOne({ conversationId: conversation.id, content: 'What is in this document?' })).toMatchObject({
            content: 'What is in this document?',
            refs: [DOCUMENT_REF]
        });
        expect(extractMemories).toHaveBeenCalled();
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
