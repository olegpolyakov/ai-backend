import { Model, Schema, Types } from 'mongoose';

import { RefSchema } from '@olegpolyakov/backend/db/schemas';
import type { Ref } from '@olegpolyakov/core/objects/ref';

// TODO Move to ai-core
export type MessageRole = 'system' | 'user' | 'assistant';

export type MessageData = {
    id: string;
    conversationId: string;
    content: string;
    role: MessageRole;
    metadata?: Record<string, unknown>;
    refs: Ref[];
    createdAt: string;
    updatedAt: string;
};

export interface MessageDocument extends Omit<MessageData, 'conversationId' | 'createdAt' | 'updatedAt' | 'editedAt'> {
    conversationId: Types.UUID;
    createdAt: Date;
    updatedAt: Date;
}

export interface MessageMethods {
    toData(): MessageData;
}

export type MessageModel = Model<MessageDocument, unknown, MessageMethods>;

export const MESSAGES_ROLES = ['system', 'user', 'assistant'];

export const MessageSchema = new Schema<MessageDocument, MessageModel, MessageMethods>({
    conversationId: {
        type: Types.UUID,
        required: true,
        index: true,
        immutable: true
    },
    content: {
        type: String,
        default: '',
        trim: true
    },
    role: {
        type: String,
        enum: MESSAGES_ROLES,
        required: true
    },
    refs: { type: [RefSchema] },
    metadata: { type: Schema.Types.Mixed }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

MessageSchema.index({
    conversationId: 1,
    createdAt: -1
});

MessageSchema.method('toData', function() {
    return {
        id: this.id,
        conversationId: this.conversationId.toString(),
        content: this.content,
        role: this.role,
        refs: this.refs,
        metadata: this.metadata,
        createdAt: this.createdAt.toISOString(),
        updatedAt: this.updatedAt.toISOString()
    };
});

export default MessageSchema;