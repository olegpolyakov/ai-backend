import type { AIClient, FileContent, ImageContent, Message, MessageContent, TextContent } from '@olegpolyakov/backend/features/ai';
import type { FileService } from '@olegpolyakov/backend/features/files';
import { NotFoundError } from '@olegpolyakov/backend/server';
import { isEntityRef, Ref } from '@olegpolyakov/core/objects/ref';

import type { ConversationModel, MessageDocument, MessageModel } from '@/models';

import type MemoryService from './memory';

const SYSTEM_PROMPT = 'You are an AI assistant. Respond to the user messages based on the conversation history and memories.';
const HISTORY_LIMIT = 25;
    
export default class ChatService {
    constructor(
        private AI: AIClient,
        private Conversation: ConversationModel,
        private Message: MessageModel,
        private Memory: MemoryService,
        private File: FileService
    ) {}

    async sendMessage(
        userId: string,
        conversationId: string,
        content: string,
        refs?: Ref[]
    ): Promise<Message> {
        const conversation = await this.Conversation.findOne({
            _id: conversationId,
            userId
        });

        if (!conversation) throw new NotFoundError();

        const [history, systemMessage] = await Promise.all([
            this.Message
                .find({ conversationId })
                .select('role content refs')
                .sort({ createdAt: -1 })
                .limit(HISTORY_LIMIT - 1)
                .lean(),
            this.buildSystemMessage(userId, content)
        ]);

        const userMessage = await this.Message.create({
            conversationId,
            role: 'user',
            content,
            refs
        });

        const input = [
            systemMessage,
            ...(await Promise.all(
                history
                    .toReversed()
                    .concat(userMessage)
                    .map(async message => this.buildMessage(message))
            ))
        ] as Message[];

        const response = await this.AI.respond(input, { model: conversation.model });

        const assistantMessage = await this.Message.create({
            conversationId,
            role: 'assistant',
            content: response.message.content
        });

        void this.Memory.extractMemories(
            userId,
            content,
            conversation.model,
            [userMessage.id, assistantMessage.id]
        ).catch(error => {
            console.error('Memory extraction failed:', error);
        });

        return response.message;
    }

    private async buildSystemMessage(userId: string, content: string): Promise<Message> {
        const [preferences, relevant] = await Promise.all([
            this.Memory.getPreferences(userId),
            this.Memory.getRelevantMemories(userId, content)
        ]);

        void this.Memory.markReferenced(relevant.map(m => m.id));

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

    private async buildMessage(message: MessageDocument): Promise<Message> {
        if (!message.refs || message.refs.length === 0) return {
            content: message.content,
            role: message.role
        };

        const text: TextContent = {
            type: 'text',
            content: message.content
        };
        const content: MessageContent[] = await this.resolveRefs(message.refs);

        return {
            role: message.role,
            content: [text, ...content]
        };
    }

    private async resolveRefs(refs: Ref[]): Promise<MessageContent[]> {
        const promises = refs.map(async ref => {
            if (isEntityRef(ref)) {
                const file = await this.File.get(ref.id);
                const url = await this.File.getUrl(ref.id);

                if (file.type.startsWith('image')) {
                    return {
                        type: 'image',
                        url
                    } as ImageContent;
                } else {
                    return {
                        type: 'file',
                        url
                    } as FileContent;
                }
            }
        });

        const resolved = await Promise.all(promises);

        return resolved.filter(i => !!i);
    }
}