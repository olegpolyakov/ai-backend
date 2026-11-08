import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient, Message } from '@olegpolyakov/backend/features/ai';
import { BadRequestError } from '@olegpolyakov/backend/server';

import { AIService } from '@/services';

describe('AIService', () => {
    const aiClient = {
        getModels: vi.fn<AIClient['getModels']>(),
        respond: vi.fn<AIClient['respond']>()
    };
    let aiService: AIService;

    beforeEach(() => {
        aiClient.getModels.mockReset();
        aiClient.respond.mockReset();

        aiService = new AIService(aiClient as unknown as AIClient);
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
        it('wraps a string prompt in a user message', async () => {
            const response = {
                message: {
                    role: 'assistant' as const,
                    content: 'Hello!'
                }
            };
            aiClient.respond.mockResolvedValue(response);

            const result = await aiService.respond('Say hello');

            expect(result).toBe(response);
            expect(aiClient.respond).toHaveBeenCalledWith([
                { role: 'user', content: 'Say hello' }
            ], undefined);
        });

        it('passes message history and options to the AI client unchanged', async () => {
            const response = {
                message: {
                    role: 'assistant' as const,
                    content: 'Paris is lovely.'
                }
            };
            aiClient.respond.mockResolvedValue(response);

            const input: Message[] = [
                { role: 'system', content: 'You are an AI assistant.' },
                { role: 'user', content: 'I want to travel.' },
                { role: 'assistant', content: 'Where would you like to go?' },
                { role: 'user', content: [
                    { type: 'text', content: 'Tell me about Paris.' },
                    { type: 'image', url: 'data:image/png;base64,aGVsbG8=' }
                ] }
            ];
            const options = { model: 'test-model' };
            const result = await aiService.respond(input, options);

            expect(result).toBe(response);
            expect(aiClient.respond).toHaveBeenCalledOnce();
            expect(aiClient.respond).toHaveBeenCalledWith(input, options);
        });

        it('rejects an empty message list', async () => {
            await expect(aiService.respond([])).rejects.toThrow(BadRequestError);
            expect(aiClient.respond).not.toHaveBeenCalled();
        });

        it('rejects history that does not end with a user message', async () => {
            const input: Message[] = [
                { role: 'user', content: 'Hello!' },
                { role: 'assistant', content: 'Hi!' }
            ];

            await expect(aiService.respond(input)).rejects.toThrow('Last message must be a user message');
            expect(aiClient.respond).not.toHaveBeenCalled();
        });
    });
});
