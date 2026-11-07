import { ChangeHandler } from '@olegpolyakov/backend/db/changes';

import type { Context } from '@/context';

export default ({
    models: { Conversation, Message }
}: Context): ChangeHandler => async ({ model, documentId }, userId) => {
    if (model === 'message') {
        const message = await Message
            .findOne({ _id: documentId }, 'conversationId')
            .setOptions({ lean: true, includeDeleted: true });
        const conversation = await Conversation
            .findOne({ _id: message?.conversationId, userId }, '_id')
            .setOptions({ lean: true, includeDeleted: true });
        
        return !!conversation;
    }

    if (model === 'conversation') {
        const conversation = await Conversation
            .findOne({ _id: documentId, userId }, '_id')
            .setOptions({ lean: true, includeDeleted: true });

        return !!conversation;
    }

    return true;
};