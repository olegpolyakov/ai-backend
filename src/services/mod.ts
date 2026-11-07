import { OllamaClient, OpenAIClient } from '@olegpolyakov/backend/features/ai';
import { EmbedService, OpenAIEmbedClient } from '@olegpolyakov/backend/features/embed';

import type { Models } from '@/models';

import AIService from './ai';
import ChatService from './chat';
import MCPService from './mcp';
import MemoryService from './memory';
import RefService from './ref';

export type Services = {
    AI: AIService,
    Chat: ChatService,
    Embed: EmbedService,
    MCP: MCPService,
    Memory: MemoryService,
};

const {
    FILES_API_URL = '',
    OLLAMA_API_KEY = '',
    OPENAI_API_KEY = '',
    OPENAI_API_URL = ''
} = process.env;

export default ({ Integration, Memory }: Models) => {
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

    const embedService = new EmbedService(embedClient);
    const mcpService = new MCPService(Integration);
    const memoryService = new MemoryService(openAIClient, embedService, Memory);
    const aiService = new AIService(openAIClient);
    const refService = new RefService(FILES_API_URL);
    const chatService = new ChatService(aiService, mcpService, memoryService, refService);

    return {
        AI: aiService,
        Chat: chatService,
        Embed: embedService,
        MCP: mcpService,
        Memory: memoryService
    };
};