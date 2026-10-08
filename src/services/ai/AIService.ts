import type { AIClient, Message, RespondOptions } from '@olegpolyakov/backend/features/ai';
import { withTimeout } from '@olegpolyakov/backend/utils/timeout';

import type MemoryService from '../memory';

const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user prompt based on the user preferences and relevant memories.';
const MEMORY_TIMEOUT_MS = 400;
    
export default class AIService {
    constructor(
        private AI: AIClient,
        private Memory: MemoryService
    ) {}

    async respond(
        userId: string,
        prompt: string,
        options?: RespondOptions
    ): Promise<string> {
        const systemMessage = await this.buildSystemMessage(userId, prompt);
        const userMessage: Message = { role: 'user', content: prompt };
        
        const response = await this.AI.respond([
            systemMessage,
            userMessage
        ], options);

        return response.message.content;
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