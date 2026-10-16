import type { AIClient } from '@olegpolyakov/backend/features/ai';

import type { Context } from '@/context';

import AIService from './ai';
import ChatService from './chat';
import EmbedService from './embed';
import MemoryService from './memory';

export type Services = {
    AI: AIService,
    Chat: ChatService,
    Memory: MemoryService,
    Embed: EmbedService
};

export default (client: AIClient, { Conversation, Message, Memory }: Context['models']) => {
    const embedService = new EmbedService();
    const memoryService = new MemoryService(client, embedService, Memory);
    const aiService = new AIService(client, memoryService);
    const chatService = new ChatService(client, Conversation, Message, memoryService);

    return {
        AI: aiService,
        Chat: chatService,
        Embed: embedService,
        Memory: memoryService
    };
};