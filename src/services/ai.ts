import type { AIClient, Message, RespondOptions, Response } from '@olegpolyakov/backend/features/ai';
import { withTimeout } from '@olegpolyakov/backend/utils/timeout';

import type MemoryService from './memory';

const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user prompt based on the user preferences and relevant memories.';
const MEMORY_TIMEOUT_MS = 1000;
    
export default class AIService {
    constructor(
        private AI: AIClient,
        private Memory: MemoryService
    ) {}

    async getModels() {
        return this.AI.getModels();
    }

    async respond(
        userId: string,
        input: string | Message[],
        options?: RespondOptions
    ): Promise<Response> {
        const messages = Array.isArray(input)
            ? input
            : [{ role: 'user', content: input }] as Message[];
        const [userMessage, ...history] = messages.toReversed();
        const textContent = Array.isArray(userMessage.content)
            ? userMessage.content.find(item => item.type === 'text')?.content ?? ''
            : userMessage.content;

        const systemMessage = await this.buildSystemMessage(userId, textContent);
        
        const response = await this.AI.respond([
            systemMessage,
            ...history,
            userMessage
        ], options);

        return response;
    }

    private async buildSystemMessage(userId: string, content: string): Promise<Message> {
        const [preferences, relevant] = await Promise.all([
            this.Memory.getPreferences(userId),
            withTimeout(this.Memory.getRelevantMemories(userId, content), MEMORY_TIMEOUT_MS, [])
        ]);

        return {
            role: 'system',
            content: [
                SYSTEM_PROMPT,
                `User ID: ${userId}`,
                this.Memory.getPrompt('User preferences', preferences),
                this.Memory.getPrompt('Relevant memories', relevant)
            ].filter(Boolean).join('\n\n')
        };
    }
}