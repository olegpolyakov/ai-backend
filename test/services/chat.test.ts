import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient, MessageContent, Tool } from '@olegpolyakov/backend/features/ai';
import type { EmbedService } from '@olegpolyakov/backend/features/embed';
import { BadRequestError } from '@olegpolyakov/backend/server';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';

import { MemoryData, MemorySchema, MessageDocument } from '@/models';
import { AIService, ChatService, MCPService, MemoryService } from '@/services';
import type RefService from '@/services/ref';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const ACCESS_TOKEN = 'test-token';
const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user prompt based on the user preferences, relevant memories, and tools';
const IMAGE_REF = {
    kind: 'entity',
    type: 'file',
    id: 'image-123',
    mimeType: 'image/png'
} as const;
const DOCUMENT_REF = {
    kind: 'entity',
    type: 'file',
    id: 'document-456',
    mimeType: 'application/pdf'
} as const;

describe('ChatService', () => {
    const db = useDb();
    const Memory = useModel(db, 'Memory', MemorySchema, { beforeEach: true });
    const aiService = {
        respond: vi.fn<AIService['respond']>()
    };
    const embedService = {
        embed: vi.fn<EmbedService['embed']>()
    };
    const mcpService = {
        getTools: vi.fn<MCPService['getTools']>()
    };
    const refService = {
        resolve: vi.fn<RefService['resolve']>()
    };
    let memoryService: MemoryService;
    let chatService: ChatService;

    beforeEach(() => {
        aiService.respond.mockReset();
        aiService.respond.mockResolvedValue({
            message: { role: 'assistant', content: 'Here is the answer.' }
        });
        embedService.embed.mockReset();
        mcpService.getTools.mockReset();
        mcpService.getTools.mockResolvedValue([]);
        refService.resolve.mockReset();

        memoryService = new MemoryService(
            {} as AIClient,
            embedService as unknown as EmbedService,
            Memory
        );
        chatService = new ChatService(
            aiService as unknown as AIService,
            mcpService as unknown as MCPService,
            memoryService,
            refService as unknown as RefService
        );
    });

    describe('reply', () => {
        it('returns the AI response message', async () => {
            const message = await chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: asMessages({ role: 'user', content: 'Hello' }),
                model: 'test-model'
            });

            expect(message).toEqual({ role: 'assistant', content: 'Here is the answer.' });
        });

        it('sends the base system prompt followed by the conversation history', async () => {
            const messages = asMessages(
                { role: 'user', content: 'I am visiting Paris' },
                { role: 'assistant', content: 'Nice! Paris is beautiful.' },
                { role: 'user', content: 'What should I see?' }
            );

            await chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages,
                model: 'test-model'
            });

            expect(aiService.respond).toHaveBeenCalledWith([
                {
                    role: 'system',
                    content: [SYSTEM_PROMPT, `User ID: ${USER_ID}`].join('\n\n')
                },
                ...messages
            ], {
                model: 'test-model',
                tools: []
            });
        });

        it('injects the user’s preferences and memories relevant to the last message', async () => {
            await Memory.create(asMemories(
                { type: 'preference', content: 'Prefers concise answers', importance: 8 },
                { type: 'fact', content: 'Lives in Paris', embedding: [1, 0] },
                { type: 'fact', content: 'Might own a cat', confidence: 0.6, embedding: [1, 0], importance: 1 },
                { userId: OTHER_USER_ID, type: 'preference', content: 'Prefers long answers' },
                { userId: OTHER_USER_ID, type: 'fact', content: 'Lives in Rome', embedding: [1, 0] }
            ));

            embedService.embed.mockResolvedValue([[1, 0]]);

            await chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: asMessages(
                    { role: 'user', content: 'Earlier question' },
                    { role: 'assistant', content: 'Earlier answer' },
                    { role: 'user', content: 'Where do I live?' }
                ),
                model: 'test-model'
            });

            expect(aiService.respond).toHaveBeenCalledWith(expect.arrayContaining([
                {
                    role: 'system',
                    content: [
                        SYSTEM_PROMPT,
                        `User ID: ${USER_ID}`,
                        'User preferences\n- Prefers concise answers',
                        'Relevant memories\n- Lives in Paris\n- Might own a cat (uncertain)'
                    ].join('\n\n')
                }
            ]), {
                model: 'test-model',
                tools: []
            });
        });

        it('passes the user’s MCP tools to the AI service', async () => {
            const tools = [{ name: 'search' }] as unknown as Tool[];
            mcpService.getTools.mockResolvedValue(tools);

            await chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: asMessages({ role: 'user', content: 'Search for Paris' }),
                model: 'test-model'
            });

            expect(mcpService.getTools).toHaveBeenCalledWith(USER_ID, ACCESS_TOKEN);
            expect(aiService.respond).toHaveBeenCalledWith(expect.anything(), { model: 'test-model', tools });
        });

        it('resolves message references into multimodal content', async () => {
            refService.resolve.mockImplementation(async refs => refs.map(ref => ({
                type: ref === IMAGE_REF ? 'image' : 'file',
                url: `https://files.example/${ref === IMAGE_REF ? IMAGE_REF.id : DOCUMENT_REF.id}`
            } as MessageContent)));

            await chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: asMessages(
                    { role: 'user', content: 'See attached', refs: [IMAGE_REF] },
                    { role: 'assistant', content: 'I see it.' },
                    { role: 'user', content: 'What is in this document?', refs: [DOCUMENT_REF] }
                ),
                model: 'test-model'
            });

            expect(aiService.respond).toHaveBeenCalledWith(expect.arrayContaining([
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: 'See attached' },
                        { type: 'image', url: 'https://files.example/image-123' }
                    ]
                },
                { role: 'assistant', content: 'I see it.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: 'What is in this document?' },
                        { type: 'file', url: 'https://files.example/document-456' }
                    ]
                }
            ]), {
                model: 'test-model',
                tools: []
            });
        });

        it('rejects an empty history', async () => {
            await expect(chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: [],
                model: 'test-model'
            })).rejects.toBeInstanceOf(BadRequestError);
            expect(aiService.respond).not.toHaveBeenCalled();
        });

        it('rejects history that does not end with a user message', async () => {
            await expect(chatService.reply({
                userId: USER_ID,
                accessToken: ACCESS_TOKEN,
                messages: asMessages(
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi!' }
                ),
                model: 'test-model'
            })).rejects.toThrow('Last message must be a user message');
            expect(mcpService.getTools).not.toHaveBeenCalled();
            expect(aiService.respond).not.toHaveBeenCalled();
        });
    });
});

function asMessages(...items: Array<Pick<MessageDocument, 'role' | 'content'> & Partial<Pick<MessageDocument, 'refs'>>>) {
    return items as MessageDocument[];
}

function asMemories(...data: Partial<MemoryData>[]) {
    return data.map(({
        userId = USER_ID,
        type = 'fact',
        embedding = [1, 0],
        importance = 5,
        confidence = 0.9,
        ...rest
    }) => ({
        userId,
        type,
        embedding,
        importance,
        confidence,
        ...rest
    }));
}