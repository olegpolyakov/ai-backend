export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
    role: MessageRole;
    content: string;
}

export interface JsonSchema {
    [key: string]: unknown;
    type: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    enum?: Array<string | number | boolean | null>;
    additionalProperties?: boolean | JsonSchema;
}

export interface ToolDefinition {
    name: string;
    description?: string;
    schema: JsonSchema & { type: 'object' };
}

export interface Response {
    message: {
        role: 'assistant';
        content: string;
    };
}

export interface Tool {
    definition: ToolDefinition;
    call(args: unknown): unknown | Promise<unknown>;
}

export interface Client {
    respond(
        messages: Message[],
        options?: {
            model?: string;
            stream?: boolean;
        }
    ): Promise<Response>;
}

export function withUserId(userId: string, messages: Message[]): Message[] {
    const conversation = messages.map(message => ({ ...message }));
    const systemMessage = conversation.find(message => message.role === 'system');

    if (systemMessage) {
        systemMessage.content = `User ID: ${userId}\n${systemMessage.content}`;
    } else {
        conversation.unshift({
            role: 'system',
            content: `User ID: ${userId}`
        });
    }

    return conversation;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name} ${error.message}`;
    }

    return String(error);
}