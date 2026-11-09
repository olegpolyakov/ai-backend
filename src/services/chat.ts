import type { Message, MessageContent, ResponseMessage, TextContent } from '@olegpolyakov/ai-core';
import { BadRequestError } from '@olegpolyakov/backend/server';

import type { MessageDocument } from '@/models';

import type AIService from './ai';
import type MCPService from './mcp';
import type MemoryService from './memory';
import type RefService from './ref';

const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user prompt based on the user preferences, relevant memories, and tools';
const MEMORY_TIMEOUT_MS = 10000;

export default class ChatService {
    constructor(
        private AI: AIService,
        private MCP: MCPService,
        private Memory: MemoryService,
        private Ref: RefService
    ) {}

    async reply({
        userId,
        accessToken,
        messages,
        model
    }: {
        userId: string;
        accessToken: string;
        messages: MessageDocument[];
        model: string;
    }): Promise<ResponseMessage> {
        const lastMessage = messages.at(-1);
        
        if (!lastMessage || lastMessage.role !== 'user') throw new BadRequestError(
            'Last message must be a user message'
        );
        
        const systemMessage = await this.buildSystemMessage(userId, lastMessage);
        const otherMessages = await this.buildMessages(messages, accessToken);
        const input = [
            systemMessage,
            ...otherMessages
        ];
        const tools = await this.MCP.getTools(userId, accessToken);
        const response = await this.AI.respond(input, {
            model,
            tools
        });

        return response.message;
    }

    private async buildSystemMessage(userId: string, message: Message): Promise<Message> {
        const textContent = Array.isArray(message.content)
            ? message.content.find(item => item.type === 'text')?.content ?? ''
            : message.content;

        const [preferences, relevant] = await Promise.all([
            this.Memory.getPreferences(userId),
            this.Memory.recallMemories(userId, textContent, MEMORY_TIMEOUT_MS)
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

    private async buildMessages(messages: MessageDocument[], accessToken: string): Promise<Message[]> {
        return Promise.all(messages.map(async message => {
            if (!message.refs || message.refs.length === 0) return {
                content: message.content,
                role: message.role
            };

            const text: TextContent = {
                type: 'text',
                content: message.content
            };
            const content: MessageContent[] = await this.Ref.resolve(message.refs, accessToken);

            return {
                role: message.role,
                content: [text, ...content]
            };
        }));
    }
}