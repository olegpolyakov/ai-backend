import { type Model, Schema, Types } from 'mongoose';

export type MessageData = {
    id: string;
    conversationId: string;
    content: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    metadata?: Record<string, unknown>;
    tokenCount?: number;
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

export const MessageSchema = new Schema<
    MessageDocument,
    MessageModel,
    MessageMethods
>({
    conversationId: { type: Types.UUID, required: true, index: true, immutable: true },
    content: { type: String, default: '' },
    role: {
        type: String,
        enum: [
            'system',
            'user',
            'assistant',
            'tool'
        ],
        required: true
    },
    metadata: { type: Schema.Types.Mixed },
    tokenCount: Number
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
        metadata: this.metadata,
        tokenCount: this.tokenCount,
        createdAt: this.createdAt.toISOString(),
        updatedAt: this.updatedAt.toISOString()
    };
});

export default MessageSchema;