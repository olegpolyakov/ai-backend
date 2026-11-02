import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import type { EmbedService } from '@olegpolyakov/backend/features/embed';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';

import { MemoryData, MemorySchema } from '@/models';
import { AIService, MemoryService } from '@/services';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('AIService', () => {
    const db = useDb();
    const Memory = useModel(db, 'Memory', MemorySchema, { beforeEach: true });
    const aiClient = {
        getModels: vi.fn<AIClient['getModels']>(),
        respond: vi.fn<AIClient['respond']>()
    };
    const embedService = {
        embed: vi.fn<EmbedService['embed']>()
    };
    let aiService: AIService;

    beforeEach(() => {
        aiClient.getModels.mockReset();
        aiClient.respond.mockReset();
        embedService.embed.mockReset();

        const memoryService = new MemoryService(
            aiClient as unknown as AIClient,
            embedService as unknown as EmbedService,
            Memory
        );

        aiService = new AIService(aiClient as unknown as AIClient, memoryService);
    });

    describe('getModels', () => {
        it('returns the models provided by the AI client', async () => {
            const models = [{ id: 'test-model' }];
            aiClient.getModels.mockResolvedValue(models);

            await expect(aiService.getModels()).resolves.toBe(models);
            expect(aiClient.getModels).toHaveBeenCalledOnce();
        });
    });

    describe('respond', () => {
        it('combines user preferences and relevant memories before responding', async () => {
            await Memory.create([
                $({ type: 'preference', content: 'Prefers concise answers', importance: 8 }),
                $({ type: 'fact', content: 'Lives in Paris', embedding: [1, 0] }),
                $({ userId: OTHER_USER_ID, type: 'fact', content: 'Lives in Rome', embedding: [1, 0] })
            ]);
            embedService.embed.mockResolvedValue([[1, 0]]);
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: 'Bonjour!'
                }
            });

            const options = { model: 'test-model' };
            const response = await aiService.respond(USER_ID, 'Say hello', options);

            expect(response).toEqual({
                message: {
                    role: 'assistant',
                    content: 'Bonjour!'
                }
            });
            expect(embedService.embed).toHaveBeenCalledWith('Say hello');
            expect(aiClient.respond).toHaveBeenCalledWith([
                {
                    role: 'system',
                    content: [
                        'You are an AI assistant. Respond to the user prompt based on the user preferences and relevant memories.',
                        `User ID: ${USER_ID}`,
                        'User preferences\n- Prefers concise answers',
                        'Relevant memories\n- Lives in Paris'
                    ].join('\n\n')
                },
                { role: 'user', content: 'Say hello' }
            ], options);
        });

        it('responds with the base system context when there are no memories', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: 'Hello!'
                }
            });

            const response = await aiService.respond(USER_ID, 'Say hello');

            expect(response).toEqual({
                message: {
                    role: 'assistant',
                    content: 'Hello!'
                }
            });
            expect(embedService.embed).not.toHaveBeenCalled();
            expect(aiClient.respond).toHaveBeenCalledWith([
                {
                    role: 'system',
                    content: [
                        'You are an AI assistant. Respond to the user prompt based on the user preferences and relevant memories.',
                        `User ID: ${USER_ID}`
                    ].join('\n\n')
                },
                { role: 'user', content: 'Say hello' }
            ], undefined);
        });

        it('preserves chronological history and uses the latest message content for memory lookup', async () => {
            await Memory.create($({
                type: 'fact',
                content: 'Paris is a city',
                embedding: [1, 0]
            }));
            embedService.embed.mockResolvedValue([[1, 0]]);
            const response = {
                message: {
                    role: 'assistant' as const,
                    content: 'Paris is lovely.'
                }
            };
            aiClient.respond.mockResolvedValue(response);

            const input = [
                { role: 'user' as const, content: 'I want to travel.' },
                { role: 'assistant' as const, content: 'Where would you like to go?' },
                { role: 'user' as const, content: [
                    { type: 'text' as const, content: 'Tell me about Paris.' },
                    { type: 'image' as const, url: 'data:image/png;base64,aGVsbG8=' }
                ] }
            ];
            const result = await aiService.respond(USER_ID, input);

            expect(result).toBe(response);
            expect(embedService.embed).toHaveBeenCalledWith('Tell me about Paris.');
            expect(aiClient.respond).toHaveBeenCalledOnce();
            expect(aiClient.respond.mock.calls[0][0].slice(1)).toEqual(input);
            expect(aiClient.respond.mock.calls[0][1]).toBeUndefined();
        });
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