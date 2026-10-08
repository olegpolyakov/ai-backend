import { fetchTools, HTTPTool, OllamaClient, RespondOptions } from '@olegpolyakov/backend/features/ai';

import type { Models } from '@/db';

import AIService from './ai';
import ChatService from './chat';
import MemoryService from './memory';

export type Services = {
    AI: AIService,
    Chat: ChatService,
    Memory: MemoryService
};

const { OLLAMA_API_KEY = '' } = process.env;
const toolsBaseUrl = 'http://tasks.olegpoliakov.local:3002/ai'; 
const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ZjFjYzliZC0xNTIwLTQwNzMtYTFiZi1mNjRhYTFjYmQ5MjkiLCJpYXQiOjE3OTEzNTE3MTYsImV4cCI6MTc5MTk1NjUxNn0.INL4-ow7STTr5Nai92ZbOoifq748m9-14gxHSBBu6X4';

export default async ({ Conversation, Message, Memory }: Models) => {
    const tools = await fetchTools(toolsBaseUrl, accessToken);
    const httpTools = tools.map(tool => new HTTPTool(toolsBaseUrl, accessToken, tool));
    const AIClient = new OllamaClient({ apiKey: OLLAMA_API_KEY, tools: httpTools });

    const memoryService = new MemoryService(AIClient, Memory);
    const aiService = new AIService(AIClient, memoryService);
    const chatService = new ChatService(AIClient, Conversation, Message, memoryService);

    return {
        AI: aiService,
        Chat: chatService,
        Memory: memoryService
    };
};