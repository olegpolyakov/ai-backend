import { Model, Schema, Types } from 'mongoose';

// TODO Move to ai-core
export type MemoryType = 'preference' | 'goal' | 'project' | 'skill' | 'fact' | 'relationship';

export type MemoryData = {
    id: string;
    userId: string;
    type: MemoryType;
    content: string;
    embedding: number[];
    importance: number;
    confidence: number;
    sourceMessageIds: string[];
    lastReferencedAt?: string;
};

export interface MemoryDocument extends Omit<MemoryData, 'userId' | 'sourceMessageIds' | 'lastReferencedAt'> {
    userId: Types.UUID;
    sourceMessageIds: Types.UUID[];
    lastReferencedAt?: Date;
}

export interface MemoryMethods {
    toData(): MemoryData;
}

export type MemoryModel = Model<MemoryDocument, unknown, MemoryMethods>;

export const MEMORY_TYPES = ['preference', 'goal', 'project', 'skill', 'fact', 'relationship'] as const;

export const MemorySchema = new Schema<MemoryDocument, MemoryModel, MemoryMethods>({
    userId: {
        type: Schema.Types.UUID,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: MEMORY_TYPES,
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    embedding: {
        type: [Number],
        default: []
    },
    importance: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
    },
    confidence: {
        type: Number,
        default: 1,
        max: 1,
        min: 0
    },
    sourceMessageIds: [Schema.Types.UUID],
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
    content: 1,
    deletedAt: 1
}, {
    unique: true
});

MemorySchema.method('toData', function() {
    return {
        id: this.id.toString(),
        userId: this.userId.toString(),
        type: this.type,
        content: this.content,
        embedding: this.embedding,
        importance: this.importance,
        confidence: this.confidence,
        sourceMessageIds: this.sourceMessageIds.map(id => id.toString()),
        lastReferencedAt: this.lastReferencedAt?.toISOString()
    };
});

export default MemorySchema;