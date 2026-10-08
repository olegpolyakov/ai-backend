import ollama from 'ollama';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import { array, integer, JsonSchema, object, string } from '@olegpolyakov/core/utils/schema';

import type { Models } from '@/db';
import type { MemoryData } from '@/db/schemas/memory';

const TOP_K = 5;
const MAX_IMPORTANCE = 10;

const MEMORY_EXTRACTION_PROMPT = `
Extract important long-term user facts.

{
    "memories": [
        {
            "type": "", // 'preference' | 'goal' | 'project' | 'skill' | 'fact' | 'relationship'
            "content": "",
            "importance": 1
        }
    ]
}

Only return facts worth remembering long-term.
`;

const MEMORY_EXTRACTION_SCHEMA = object('Memory extraction schema', {
    memories: array('Array of memories', 
        object('Memory object', {
            type: string('Type of the memory, e.g., preference, goal, project, skill, fact, relationship'),
            content: string('Content of the memory'),
            importance: integer('Importance of the memory', {
                minimum: 1,
                maximum: 10
            })
        })
    )
}) as JsonSchema;

export default class MemoryService {
    constructor(
        private AI: AIClient,
        private Memory: Models['Memory']
    ) {}

    async getPreferences(userId: string): Promise<MemoryData[]> {
        const memories = await this.Memory
            .find({ userId, type: 'preference' })
            .sort({ importance: -1 });

        return memories.map(m => m.toData());
    }

    async getMemories(userId: string): Promise<MemoryData[]> {
        const memories = await this.Memory
            .find({ userId, type: { $ne: 'preference' } })
            .sort({ importance: -1 });

        return memories.map(m => m.toData());
    }

    async getRelevantMemories(userId: string, query: string) {
        if (!query) return [];

        const memories = await this.getMemories(userId);

        if (memories.length === 0) return [];

        const queryEmbedding = await this.embed(query);

        if (queryEmbedding.length === 0)
            return memories.slice(0, TOP_K);
         
        return memories
            .map(memory => ({
                ...memory,
                similarity: cosineSimilarity(queryEmbedding, memory.embedding)
            }))
            .sort((a, b) => score(b) - score(a)) 
            .slice(0, TOP_K);
    }

    async extractMemories(userId: string, content: string): Promise<MemoryData[]> {
        const response = await this.AI.respond([
            {
                role: 'system',
                content: MEMORY_EXTRACTION_PROMPT
            },
            {
                role: 'user',
                content: content
            }
        ], { format: MEMORY_EXTRACTION_SCHEMA });

        let extracted: Pick<MemoryData, 'type' | 'content' | 'importance'>[];

        try {
            const json = response.message.content.replace(/^```(json)?\n?|```$/g, '').trim();
            const parsed = JSON.parse(json).memories;

            if (!Array.isArray(parsed))
                throw new Error('Memories is not an array');

            extracted = parsed.filter(m => typeof m?.content === 'string' && m.content.trim());
        } catch {
            console.info('Failed to parse memories from response:', response.message.content);
            return [];
        }

        if (extracted.length === 0) return [];

        const embeddings = await this.embedMany(extracted.map(m => m.content));

        const created: MemoryData[] = [];

        for (const [i, memory] of extracted.entries()) {
            if (!embeddings[i]?.length) continue;

            const doc = await this.Memory.create({
                ...memory,
                userId,
                embedding: embeddings[i]
            });

            created.push(doc.toData());
        }

        return created;
    }

    async embed(input: string): Promise<number[]> {
        return (await this.embedMany([input]))[0] ?? [];
    }

    async embedMany(input: string[]): Promise<number[][]> {
        try {
            const result = await ollama.embed({ model: 'embeddinggemma', input });
            return result.embeddings;
        } catch (error) {
            console.error('Failed to embed input:', error);
            return input.map(() => []);
        }
    }

    getPrompt(prefix: string, memories: MemoryData[]): string {
        return memories.length === 0
            ? '' 
            : `${prefix}\n- ${memories.map(memory => memory.content).join('\n- ')}`;
    }
}

export function score(memory: MemoryData & { similarity?: number }): number {
    const importance = memory.importance ?? 1;
    const similarity = Number.isFinite(memory.similarity) ? memory.similarity! : 0;

    return similarity * 0.8 + (importance / MAX_IMPORTANCE) * 0.2;
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