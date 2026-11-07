import type { AIClient, Message, RespondOptions, Response } from '@olegpolyakov/backend/features/ai';
import { BadRequestError } from '@olegpolyakov/backend/server';

export default class AIService {
    constructor(
        private AI: AIClient
    ) {}

    async getModels() {
        return this.AI.getModels();
    }

    async respond(
        input: string | Message[],
        options?: RespondOptions
    ): Promise<Response> {
        const messages = Array.isArray(input)
            ? input
            : [{ role: 'user', content: input }] as Message[];
        const lastMessage = messages.at(-1);

        if (!lastMessage || lastMessage.role !== 'user') throw new BadRequestError(
            'Last message must be a user message'
        );
        
        const response = await this.AI.respond(messages, options);

        return response;
    }
}