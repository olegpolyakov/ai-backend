import { Schema } from 'mongoose';

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

const MemorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
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

export default MemorySchema;