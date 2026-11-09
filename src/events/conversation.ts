import type { Message } from '@olegpolyakov/ai-core';
import { EntityEvent } from '@olegpolyakov/core/entities/entity';

import type { MessageDocument, Models } from '@/models';
import type { Services } from '@/services';

export default (
    { Conversation, Message }: Models,
    { AI }: Services
) => {
    Message.events.on(EntityEvent.Created, async (message: MessageDocument) => {
        const conversation = await Conversation.findOne({ _id: message.conversationId }, 'title').lean();

        if (!conversation || conversation.title) return;

        const messages = await Message.find({ conversationId: message.conversationId }, 'content role');

        if (messages.length < 2) return;

        const input: Message[] = [
            ...messages,
            {
                content: 'Create a title based on the messages in the conversation as a plain string',
                role: 'user'
            }
        ];

        const response = await AI.respond(input, {
            model: 'openai/gpt-6-luna'
        });
        const title = response.message.content;

        if (!title) return;

        await Conversation.updateOne({ _id: conversation._id }, { title });
    });
};