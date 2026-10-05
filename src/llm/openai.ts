import OpenAI from 'openai';

import {
    Client,
    getErrorMessage,
    Message,
    Response,
    Tool
} from './client';

export default (apiKey: string, apiUrl: string, tools: Record<string, Tool> = {}): Client => {
    const openai = new OpenAI({
        apiKey,
        baseURL: apiUrl
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
        async respond(messages: Message[], { model = '' } = {}) {
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

    async function loop(
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        model: string
    ): Promise<Response> {
        const response = await openai.chat.completions.create({
            model,
            messages,
            tools: definitions.length > 0 ? definitions : undefined
        });
        const message = response.choices[0]?.message;

        if (!message) {
            throw new Error('The model returned no message');
        }

        if (!message.tool_calls?.length) {
            return {
                message: {
                    role: 'assistant',
                    content: message.content ?? ''
                }
            };
        }

        messages.push(message);

        for (const call of message.tool_calls) {
            if (call.type !== 'function') {
                throw new Error('Custom tool calls are not supported');
            }

            try {
                const result = await callTool(
                    call.function.name,
                    JSON.parse(call.function.arguments)
                );

                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: String(result)
                });
            } catch (error) {
                console.error(error);
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
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