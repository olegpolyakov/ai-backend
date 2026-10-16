import type { AIClient, Message } from '@olegpolyakov/backend/features/ai';
import { NotFoundError } from '@olegpolyakov/backend/server';
import { withTimeout } from '@olegpolyakov/backend/utils/timeout';

import type { Context } from '@/context';

import type MemoryService from '../memory';

const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user messages based on the conversation history and memories.';
const HISTORY_LIMIT = 25;
const MEMORY_TIMEOUT_MS = 400;
    
export default class ChatService {
    constructor(
        private AI: AIClient,
        private Conversation: Context['models']['Conversation'],
        private Message: Context['models']['Message'],
        private Memory: MemoryService
    ) {}

    async sendMessage(userId: string, conversationId: string, content: string): Promise<Message> {
        const conversation = await this.Conversation.exists({
            _id: conversationId,
            userId
        });

        if (!conversation) throw new NotFoundError();

        const [history, systemMessage] = await Promise.all([
            this.Message
                .find({ conversationId })
                .select('role content')
                .sort({ createdAt: -1 })
                .limit(HISTORY_LIMIT - 1)
                .lean(),
            this.buildSystemMessage(userId, content)
        ]);

        const userMessage: Message = { role: 'user', content };
        const userMessagePromise = this.Message.create({
            conversationId,
            ...userMessage
        });

        let response;

        try {
            response = await this.AI.respond([
                systemMessage,
                ...history
                    .map(({ role, content }) => ({ role, content }))
                    .toReversed(),
                userMessage
            ]);
        } finally {
            // The user's message is kept even when the AI call fails
            await userMessagePromise;
        }

        await this.Message.create({
            conversationId,
            role: 'assistant',
            content: response.message.content
        });

        void this.Memory.extractMemories(userId, content).catch(error => {
            console.error('Memory extraction failed:', error);
        });

        return response.message;
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