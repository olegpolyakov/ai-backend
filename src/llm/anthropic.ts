import Anthropic from '@anthropic-ai/sdk';

import {
    Client,
    getErrorMessage,
    Message,
    Response,
    Tool
} from './client';

export default (accessToken: string, tools: Record<string, Tool> = {}): Client => {
    const anthropic = new Anthropic({ apiKey: accessToken });
    const definitions: Anthropic.Tool[] = Object.values(tools).map(({ definition }) => ({
        ...definition,
        input_schema: {
            ...definition.schema,
            type: 'object'
        }
    }));

    return {
        async respond(messages: Message[], { model = 'claude-3-5-haiku-20241022' } = {}) {
            if (!messages) {
                throw new Error('Messages are required');
            }

            return run(messages, model);
        }
    } satisfies Client;

    async function run(messages: Message[], model: string): Promise<Response> {
        const system = messages
            .filter(message => message.role === 'system')
            .map(message => message.content)
            .join('\n');
        const history: Anthropic.MessageParam[] = messages
            .filter((message): message is Message & { role: 'user' | 'assistant' } => message.role !== 'system')
            .map(message => ({ role: message.role, content: message.content }));

        return loop(history, model, system);
    }

    async function loop(
        messages: Anthropic.MessageParam[],
        model: string,
        system: string
    ): Promise<Response> {
        const response = await anthropic.messages.create({
            model,
            max_tokens: 1024,
            system,
            messages,
            tools: definitions.length > 0 ? definitions : undefined
        });
        const toolCalls = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolCalls.length === 0) {
            return {
                message: {
                    role: 'assistant',
                    content: response.content
                        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                        .map(block => block.text)
                        .join('\n')
                }
            };
        }

        messages.push({ role: 'assistant', content: response.content });

        const results: Anthropic.ToolResultBlockParam[] = [];

        for (const call of toolCalls) {
            try {
                const result = await callTool(call.name, call.input);

                results.push({
                    type: 'tool_result',
                    tool_use_id: call.id,
                    content: String(result)
                });
            } catch (error) {
                console.error(error);
                results.push({
                    type: 'tool_result',
                    tool_use_id: call.id,
                    is_error: true,
                    content: getErrorMessage(error)
                });
            }
        }

        messages.push({ role: 'user', content: results });

        return loop(messages, model, system);
    }

    async function callTool(name: string, args: unknown): Promise<unknown> {
        const tool = tools[name];

        if (!tool) {
            throw new Error('Unknown tool');
        }

        return tool.call(args);
    }
};