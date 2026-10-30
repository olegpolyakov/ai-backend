import { QueryFilter } from 'mongoose';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import type { EmbedService } from '@olegpolyakov/backend/features/embed';
import { array, integer, JsonSchema, object, string } from '@olegpolyakov/core/utils/schema';

import { MEMORY_TYPES, MemoryData, MemoryModel, MemoryType } from '@/models';

const TOP_K = 5;
const MAX_IMPORTANCE = 10;
const MIN_CONFIDENCE = 0.5; // below this, memories aren't injected
const DUPLICATE_THRESHOLD = 0.9; // cosine similarity to treat as the same memory
const RECENCY_HALF_LIFE_DAYS = 30;

const MEMORY_EXTRACTION_PROMPT = `
Extract important long-term user facts.

{
    "memories": [
        {
            "type": "", // 'preference' | 'goal' | 'project' | 'skill' | 'fact' | 'relationship'
            "content": "",
            "importance": 1, // 1-10, how much this matters for future conversations
            "confidence": 0.9 // 0-1, how certain you are the fact is true and correctly understood
        }
    ]
}

Confidence guide:
- 0.9-1.0: the user stated it explicitly
- 0.6-0.8: strongly implied
- 0.3-0.5: weak inference

Only return facts worth remembering long-term.
`;

const MEMORY_EXTRACTION_SCHEMA = object('Memory extraction schema', {
    memories: array('Array of memories',
        object('Memory object', {
            type: string(`Type of the memory, e.g., ${MEMORY_TYPES.join(', ')}`),
            content: string('Content of the memory'),
            importance: integer('Importance of the memory', { minimum: 1, maximum: 10 }),
            confidence: integer('Confidence that the memory is true, from 0 to 1', { minimum: 0, maximum: 1 })
        })
    )
}) as JsonSchema;

type ExtractedMemory = Pick<MemoryData, 'type' | 'content' | 'importance' | 'confidence'>;

export default class MemoryService {
    constructor(
        private AI: AIClient,
        private Embed: EmbedService,
        private Memory: MemoryModel
    ) {}

    async getPreferences(userId: string): Promise<MemoryData[]> {
        const memories = await this.Memory
            .find({ userId, type: 'preference' })
            .sort({ importance: -1 });

        return memories.map(m => m.toData());
    }

    async getMemories(userId: string, query: QueryFilter<MemoryData>): Promise<MemoryData[]> {
        const memories = await this.Memory
            // TODO Fix type issue
            .find({ userId, type: { $ne: 'preference' }, ...query })
            .sort({ importance: -1 });

        return memories.map(m => m.toData());
    }

    async getRelevantMemories(userId: string, query: string, topK: number = TOP_K) {
        if (!query) return [];

        const memories = await this.getMemories(userId, {
            confidence: { $gte: MIN_CONFIDENCE }
        });

        if (memories.length === 0) return [];

        const [queryEmbedding] = await this.Embed.embed(query);

        if (queryEmbedding.length === 0)
            return memories.slice(0, topK);
         
        return memories
            .map(memory => ({
                ...memory,
                similarity: cosineSimilarity(queryEmbedding, memory.embedding)
            }))
            .sort((a, b) => score(b) - score(a)) 
            .slice(0, topK);
    }

    async extractMemories(
        userId: string,
        content: string,
        model: string,
        sourceMessageIds: string[] = []
    ): Promise<MemoryData[]> {
        const response = await this.AI.respond([
            { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
            { role: 'user', content: content }
        ], { model, format: MEMORY_EXTRACTION_SCHEMA });

        let extractedMemories: ExtractedMemory[];

        try {
            const json = response.message.content.replace(/^```(json)?\n?|```$/g, '').trim();
            const parsed = JSON.parse(json).memories;

            if (!Array.isArray(parsed))
                throw new Error('Memories is not an array');

            extractedMemories = parsed
                .filter(m =>
                    typeof m?.content === 'string' &&
                    m.content.trim() &&
                    MEMORY_TYPES.includes(m.type)
                )
                .map(m => ({
                    type: m.type,
                    content: m.content.trim(),
                    importance: clamp(Math.round(Number(m.importance)) || 1, 1, MAX_IMPORTANCE),
                    confidence: Number.isFinite(Number(m.confidence))
                        ? clamp(Number(m.confidence), 0, 1)
                        : 0.5
                }));
        } catch {
            console.info('Failed to parse memories from response:', response.message.content);
            return [];
        }

        if (extractedMemories.length === 0) return [];

        const embeddings = await this.Embed.embed(extractedMemories.map(m => m.content));

        const existingMemories = (await this.Memory.find({ userId })).map(m => m.toData());

        const createdMemories: MemoryData[] = [];

        for (const [i, memory] of extractedMemories.entries()) {
            const embedding = embeddings[i];

            if (!embedding?.length) continue;

            const duplicateMemory = findDuplicate(existingMemories, memory.type, embedding);

            if (duplicateMemory) {
                const updatedMemory = await this.Memory.findByIdAndUpdate(
                    duplicateMemory.id,
                    {
                        $set: {
                            // Asymptotic boost: repeated evidence pushes confidence toward 1
                            confidence: duplicateMemory.confidence + (1 - duplicateMemory.confidence) * 0.3,
                            importance: Math.max(duplicateMemory.importance, memory.importance)
                        },
                        $addToSet: { sourceMessageIds: { $each: sourceMessageIds } }
                    },
                    { returnDocument: 'after' }
                );

                if (updatedMemory) {
                    const index = existingMemories.findIndex(m => m.id === duplicateMemory.id);
                    existingMemories[index] = updatedMemory.toData();
                }

                continue;
            }

            const createdMemory = await this.Memory.create({
                ...memory,
                userId,
                embedding,
                sourceMessageIds
            });

            const data = createdMemory.toData();
            createdMemories.push(data);
            existingMemories.push(data); // so duplicates within the same batch are caught too
        }

        return createdMemories;
    }

    async markReferenced(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        await this.Memory.updateMany(
            { _id: { $in: ids } },
            { $set: { lastReferencedAt: new Date() } }
        );
    }

    getPrompt(prefix: string, memories: MemoryData[]): string {
        if (memories.length === 0) return '';

        const lines = memories.map(m =>
            m.confidence < 0.7 ? `${m.content} (uncertain)` : m.content
        );

        return `${prefix}\n- ${lines.join('\n- ')}`;
    }
}

export function score(memory: MemoryData & { similarity?: number }): number {
    const similarity = Number.isFinite(memory.similarity) ? memory.similarity! : 0;

    return (
        similarity * 0.65 +
        (memory.importance / MAX_IMPORTANCE) * 0.15 +
        memory.confidence * 0.15 +
        recency(memory.lastReferencedAt) * 0.05
    );
}

export function recency(lastReferencedAt?: string, now = Date.now()): number {
    if (!lastReferencedAt) return 0;

    const days = (now - Date.parse(lastReferencedAt)) / 86_400_000;

    return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

export function cosineSimilarity(a?: number[], b?: number[]): number {
    if (!a?.length || !b?.length || a.length !== b.length) return 0;

    let dot = 0, magA = 0, magB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    const denominator = Math.sqrt(magA) * Math.sqrt(magB);

    return denominator === 0 ? 0 : dot / denominator;
}

function findDuplicate(
    memories: MemoryData[],
    type: MemoryType,
    embedding: number[]
): MemoryData | undefined {
    let best: MemoryData | undefined;
    let bestSimilarity = DUPLICATE_THRESHOLD;

    for (const m of memories) {
        if (m.type !== type) continue;

        const similarity = cosineSimilarity(embedding, m.embedding);

        if (similarity >= bestSimilarity) {
            best = m;
            bestSimilarity = similarity;
        }
    }

    return best;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}