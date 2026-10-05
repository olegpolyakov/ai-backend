import { Schema } from 'mongoose';

const AgentSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    goals: [
        {
            title: String,
            status: {
                type: String,
                enum: [
                    'active',
                    'completed',
                    'paused'
                ]
            }
        }
    ],
    todos: [
        {
            task: String,
            status: {
                type: String,
                enum: [
                    'pending',
                    'completed'
                ]
            }
        }
    ],
    currentPlan: [String]
}, {
    timestamps: true
});

export default AgentSchema;