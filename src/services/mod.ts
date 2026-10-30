import { OllamaClient, OpenAIClient } from '@olegpolyakov/backend/features/ai';
import { EmbedService, OpenAIEmbedClient } from '@olegpolyakov/backend/features/embed';
import { FileService } from '@olegpolyakov/backend/features/files';

import type { Models } from '@/models';

import AIService from './ai';
import ChatService from './chat';
import MemoryService from './memory';

export type Services = {
    AI: AIService,
    Chat: ChatService,
    Embed: EmbedService,
    File: FileService,
    Memory: MemoryService,
};

const {
    FILES_API_URL = '',
    OLLAMA_API_KEY = '',
    OPENAI_API_KEY = '',
    OPENAI_API_URL = ''
} = process.env;

export default ({ Conversation, Message, Memory }: Models) => {
    const embedClient = new OpenAIEmbedClient({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_API_URL,
        model: 'dashscope/text-embedding-v4'
    });
    const ollamaClient = new OllamaClient({
        apiKey: OLLAMA_API_KEY,
        model: 'gemma4:31b-cloud'
    });
    const openAIClient = new OpenAIClient({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_API_URL
    });

    const fileService = new FileService(FILES_API_URL);
    const embedService = new EmbedService(embedClient);
    const memoryService = new MemoryService(openAIClient, embedService, Memory);
    const aiService = new AIService(openAIClient, memoryService);
    const chatService = new ChatService(openAIClient, Conversation, Message, memoryService, fileService);

    return {
        AI: aiService,
        Chat: chatService,
        Embed: embedService,
        File: fileService,
        Memory: memoryService
    };
};