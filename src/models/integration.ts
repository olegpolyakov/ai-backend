import { Model, Schema, Types } from 'mongoose';

// TODO Move to ai-core
export type IntegrationType = 'mcp';

export type IntegrationData = {
    id: string;
    userId: string;
    type: IntegrationType;
    name: string;
    url: string;
    enabled: boolean;
    credentials: Record<string, string>;
};

export type IntegrationDocument = Omit<IntegrationData, 'userId'> & {
    id: Types.UUID;
    userId: Types.UUID;
};

export type IntegrationModel = Model<IntegrationDocument>;

export const IntegrationSchema = new Schema<IntegrationDocument>({
    userId: { type: Types.UUID, required: true, immutable: true },
    type: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    credentials: { type: Object }
}, {
    timestamps: true
});

IntegrationSchema.index({ userId: 1, name: 1 }, { unique: true });