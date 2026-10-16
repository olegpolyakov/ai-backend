import { ChangeHandler } from '@olegpolyakov/backend/db/changes';

import type { Context } from '@/context';

export default ({ models: { Conversation, Message } }: Context): ChangeHandler =>
    async (payload, userId) => {
        const { model, documentId } = payload;

        if (model === 'Message') {
            const message = await Message.findOne({ _id: documentId });
            const conversation = await Conversation.findOne({ _id: message?.get('conversationId'), userId });

            if (!conversation) return false;
        }

        if (model === 'Conversation') {
            const conversation = await Conversation.findOne({ _id: documentId, userId });

            if (!conversation) return false;
        }

        return true;
    };