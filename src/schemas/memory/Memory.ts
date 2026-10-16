import { Model, Schema, Types } from 'mongoose';

export type MemoryData = {
    id: string;
    userId: string;
    type: 'preference' | 'goal' | 'project' | 'skill' | 'fact' | 'relationship';
    content: string;
    embedding: number[];
    importance: number;
    confidence: number;
    sourceMessageIds: string[];
    lastReferencedAt?: string;
};

export interface MemoryDocument extends Omit<MemoryData, 'userId' | 'sourceMessageIds' | 'lastReferencedAt'> {
    userId: Types.UUID;
    sourceMessageIds: Types.ObjectId[];
    lastReferencedAt?: Date;
}

export interface MemoryMethods {
    toData(): MemoryData;
}

export type MemoryModel = Model<MemoryDocument, unknown, MemoryMethods>;

const MemorySchema = new Schema<MemoryDocument, MemoryModel, MemoryMethods>({
    userId: {
        type: Schema.Types.UUID,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'preference',
            'goal',
            'project',
            'skill',
            'fact',
            'relationship'
        ],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    embedding: {
        type: [Number],
        default: []
    },
    importance: {
        type: Number,
        min: 1,
        max: 10,
        default: 5
    },
    confidence: {
        type: Number,
        default: 1
    },
    sourceMessageIds: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Message'
        }
    ],
    lastReferencedAt: Date
}, {
    timestamps: true
});

MemorySchema.index({
    userId: 1,
    importance: -1
});

MemorySchema.index({
    userId: 1,
    type: 1
});

MemorySchema.index({
    userId: 1,
    content: 1
}, {
    unique: true
});

MemorySchema.method('toData', function() {
    return {
        id: this.id,
        userId: this.userId,
        type: this.type,
        content: this.content,
        embedding: this.embedding,
        importance: this.importance,
        confidence: this.confidence,
        sourceMessageIds: this.sourceMessageIds,
        lastReferencedAt: this.lastReferencedAt?.toISOString()
    };
});

export default MemorySchema;