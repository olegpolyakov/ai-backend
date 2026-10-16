import { type Model, Schema, Types } from 'mongoose';

import type { MessageData, MessageDocument } from '../message';

export type ConversationData = {
    id: string;
    userId: string;
    title: string;
    description: string;
    viewedAt?: string;
    lastMessage?: Pick<MessageData, 'content' | 'createdAt'>;
    unreadMessagesCount: number;
};

export interface ConversationDocument {
    id: Types.UUID;
    userId: Types.UUID;
    title: string;
    description: string;
    viewedAt?: Date;
}

export interface ConversationMethods {
    toData({ unreadMessagesCount }: { unreadMessagesCount: number }): ConversationData;
}

export interface ConversationVirtuals {
    lastMessage: MessageDocument;
}

export type ConversationModel = Model<ConversationDocument, object, ConversationMethods, ConversationVirtuals>;

export const ConversationSchema = new Schema<ConversationDocument, ConversationModel, ConversationMethods, ConversationVirtuals>({
    userId: { type: Types.UUID, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    viewedAt: { type: Date }
}, {
    timestamps: false
});

ConversationSchema.index({
    userId: 1,
    updatedAt: -1
});

ConversationSchema.virtual('lastMessage', {
    ref: 'Message',
    localField: '_id',
    foreignField: 'conversationId',
    justOne: true,
    options: {
        sort: { createdAt: 1 }
    }
});

ConversationSchema.method<ConversationDocument & ConversationVirtuals>('toData', function ({
    unreadMessagesCount = 0
}: {
    unreadMessagesCount: number
}) {
    return {
        id: this.id,
        title: this.title,
        description: this.description,
        lastMessage: this.lastMessage,
        userId: this.userId,
        unreadMessagesCount
    };
});

export default ConversationSchema;