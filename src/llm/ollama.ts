import { Message as OllamaMessage, Ollama } from 'ollama';

import {
    Client,
    getErrorMessage,
    Message,
    Response,
    Tool
} from './client';

export default (apiKey: string, tools: Record<string, Tool> = {}): Client => {
    const ollama = new Ollama({
        host: 'https://ollama.com',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
    const definitions = Object.values(tools).map(({ definition }) => ({
        type: 'function' as const,
        function: {
            name: definition.name,
            description: definition.description,
            parameters: definition.schema
        }
    }));

    return {
        async respond(messages: Message[], { model = 'gemma4:31b-cloud' } = {}) {
            if (!messages) {
                throw new Error('Messages are required');
            }

            return run(messages, model);
        }
    } satisfies Client;

    async function run(messages: Message[], model: string): Promise<Response> {
        return loop(
            messages.map(message => ({ role: message.role, content: message.content })),
            model
        );
    }

    async function loop(messages: OllamaMessage[], model: string): Promise<Response> {
        const response = await ollama.chat({
            model,
            messages,
            tools: definitions
        });
        const toolCalls = response.message.tool_calls ?? [];

        if (toolCalls.length === 0) {
            return {
                message: {
                    role: 'assistant',
                    content: response.message.content
                }
            };
        }

        messages.push(response.message);

        for (const call of toolCalls) {
            try {
                const result = await callTool(
                    call.function.name,
                    call.function.arguments
                );

                messages.push({
                    role: 'tool',
                    tool_name: call.function.name,
                    content: String(result)
                });
            } catch (error) {
                console.error(error);
                messages.push({
                    role: 'tool',
                    tool_name: call.function.name,
                    content: getErrorMessage(error)
                });
            }
        }

        return loop(messages, model);
    }

    async function callTool(name: string, args: unknown): Promise<unknown> {
        const tool = tools[name];

        if (!tool) {
            throw new Error('Unknown tool');
        }

        return tool.call(args);
    }
};