import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIClient } from '@olegpolyakov/backend/features/ai';
import type { EmbedService } from '@olegpolyakov/backend/features/embed';
import { useDb } from '@olegpolyakov/backend/test/mocks/db';
import { useModel } from '@olegpolyakov/backend/test/mocks/models';

import { MemoryData, MemorySchema } from '@/models';
import { MemoryService } from '@/services';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const SOURCE_MESSAGE_ID = '123e4567-e89b-12d3-a456-426614174002';

describe('MemoryService', () => {
    const db = useDb();
    const Memory = useModel(db, 'Memory', MemorySchema, { beforeEach: true });
    const aiClient = {
        respond: vi.fn<AIClient['respond']>()
    };
    const embedService = {
        embed: vi.fn<EmbedService['embed']>()
    };
    let memoryService: MemoryService;

    beforeEach(async () => {
        aiClient.respond.mockReset();
        embedService.embed.mockReset();
        memoryService = new MemoryService(
            aiClient as unknown as AIClient,
            embedService as unknown as EmbedService,
            Memory
        );
    });

    describe('getPreferences', () => {
        it('returns only the user preferences ordered by importance', async () => {
            const [low, high] = await Memory.create(asMemories(
                { type: 'preference', content: 'Prefers tea', importance: 3 },
                { type: 'preference', content: 'Prefers quiet', importance: 8 },
                { type: 'fact', content: 'Lives in Paris', importance: 10 },
                { userId: OTHER_USER_ID, type: 'preference', content: 'Likes coffee' }
            ));

            const memories = await memoryService.getPreferences(USER_ID);

            expect(memories.map(memory => memory.id)).toEqual([high.id, low.id]);
        });
    });

    describe('getMemories', () => {
        it('excludes preferences, applies the query, and scopes results to the user', async () => {
            const [important] = await Memory.create(asMemories(
                { type: 'fact', content: 'Works in design', importance: 8 },
                { type: 'goal', content: 'Learn French', importance: 4 },
                { type: 'preference', content: 'Likes tea', importance: 9 },
                { userId: OTHER_USER_ID, type: 'fact', content: 'Works in design', importance: 10 }
            ));

            const memories = await memoryService.getMemories(USER_ID, { importance: { $gte: 7 } });

            expect(memories.map(memory => memory.id)).toEqual([important.id]);
        });
    });

    describe('getRelevantMemories', () => {
        it('returns no results for an empty query without requesting embeddings', async () => {
            await Memory.create(asMemories({ type: 'fact', content: 'Lives in Paris' }));

            const memories = await memoryService.getRelevantMemories(USER_ID, '');

            expect(memories).toEqual([]);
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('returns no results and skips embedding when no confident memories exist', async () => {
            await Memory.create(asMemories(
                { type: 'fact', content: 'Might like jazz', confidence: 0.4 },
                { type: 'preference', content: 'Likes tea' }
            ));

            const memories = await memoryService.getRelevantMemories(USER_ID, 'music');

            expect(memories).toEqual([]);
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('ranks memories by relevance and limits the result count', async () => {
            const [relevant] = await Memory.create(asMemories(
                { type: 'fact', content: 'Likes hiking', embedding: [1, 0], importance: 2 },
                { type: 'fact', content: 'Enjoys cooking', embedding: [0, 1], importance: 10 }
            ));
            embedService.embed.mockResolvedValue([[1, 0]]);

            const memories = await memoryService.getRelevantMemories(USER_ID, 'outdoor activities', 1);

            expect(memories.map(memory => memory.id)).toEqual([relevant.id]);
            expect(embedService.embed).toHaveBeenCalledWith('outdoor activities');
        });

        it('falls back to importance ordering when the query embedding is empty', async () => {
            const [important] = await Memory.create(asMemories(
                { type: 'fact', content: 'Important fact', importance: 9 },
                { type: 'goal', content: 'Minor goal', importance: 2 }
            ));
            embedService.embed.mockResolvedValue([[]]);

            const memories = await memoryService.getRelevantMemories(USER_ID, 'query', 1);

            expect(memories.map(memory => memory.id)).toEqual([important.id]);
        });
    });

    describe('recallMemories', () => {
        it('returns relevant memories and marks them as referenced', async () => {
            const [memory] = await Memory.create(asMemories({
                type: 'fact', content: 'Lives in Paris', embedding: [1, 0]
            }));
            embedService.embed.mockResolvedValue([[1, 0]]);

            const memories = await memoryService.recallMemories(USER_ID, 'Where do I live?', 1000);
            
            expect(memories.map(m => m.id)).toEqual([memory.id]);
            
            await vi.waitFor(async () => {
                expect((await Memory.findById(memory.id))?.lastReferencedAt).toBeInstanceOf(Date);
            });
        });

        it('returns an empty list and marks nothing when the lookup times out', async () => {
            const [memory] = await Memory.create(asMemories(
                { type: 'fact', content: 'Lives in Paris', embedding: [1, 0] }
            ));
            
            let resolveEmbed!: (value: number[][]) => void;
            embedService.embed.mockReturnValue(new Promise(resolve => { resolveEmbed = resolve; }));

            const memories = await memoryService.recallMemories(USER_ID, 'Where do I live?', 10);

            expect(memories).toEqual([]);

            resolveEmbed([[1, 0]]);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect((await Memory.findById(memory.id))?.lastReferencedAt).toBeUndefined();
        });
    });

    describe('extractMemories', () => {
        it('parses extracted memories, normalizes values, embeds, and saves them', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: '```json\n{"memories":[{"type":"goal","content":"  Run a marathon  ","importance":12,"confidence":0.8}]}\n```'
                }
            });
            embedService.embed.mockResolvedValue([[0.5, 0.5]]);

            const memories = await memoryService.extractMemories(USER_ID, 'I want to run a marathon', 'test-model', [SOURCE_MESSAGE_ID]);

            expect(memories).toHaveLength(1);
            expect(memories[0]).toMatchObject({
                type: 'goal',
                content: 'Run a marathon',
                embedding: [0.5, 0.5],
                importance: 10,
                confidence: 0.8,
                userId: USER_ID,
                sourceMessageIds: [SOURCE_MESSAGE_ID]
            });
            expect(aiClient.respond).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ role: 'user', content: 'I want to run a marathon' })
                ]),
                expect.objectContaining({ model: 'test-model' })
            );
            expect(embedService.embed).toHaveBeenCalledWith(['Run a marathon']);
        });

        it('ignores malformed and invalid memories and skips embedding when none remain', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: '{"memories":[{"type":"unknown","content":"Not valid"},{"type":"fact","content":"  "},null]}'
                }
            });

            const memories = await memoryService.extractMemories(USER_ID, 'content', 'test-model');

            expect(memories).toEqual([]);
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('returns no results for an unparseable AI response', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: 'not JSON'
                }
            });

            const memories = await memoryService.extractMemories(USER_ID, 'content', 'test-model');

            await expect(memories).toEqual([]);
            expect(embedService.embed).not.toHaveBeenCalled();
        });

        it('updates a semantic duplicate instead of creating another memory', async () => {
            const [existing] = await Memory.create(asMemories({
                type: 'fact',
                content: 'Enjoys hiking',
                embedding: [1, 0],
                importance: 4,
                confidence: 0.5
            }));
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: '{"memories":[{"type":"fact","content":"Likes hiking","importance":8,"confidence":0.9}]}'
                }
            });
            embedService.embed.mockResolvedValue([[0.99, 0.1]]);

            const created = await memoryService.extractMemories(USER_ID, 'I like hiking', 'test-model', [SOURCE_MESSAGE_ID]);
            const updated = await Memory.findById(existing.id);

            expect(created).toEqual([]);
            expect(embedService.embed).toHaveBeenCalledWith(['Likes hiking']);
            expect(updated?.importance).toBe(8);
            expect(updated?.confidence).toBe(0.65);
            expect(updated?.sourceMessageIds.map(String)).toEqual([SOURCE_MESSAGE_ID]);
            await expect(Memory.countDocuments({ userId: USER_ID })).resolves.toBe(1);
        });

        it('detects duplicates within the same extraction batch', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: '{"memories":[{"type":"fact","content":"Likes hiking","importance":4,"confidence":0.8},{"type":"fact","content":"Enjoys hiking","importance":7,"confidence":0.9}]}'
                }
            });
            embedService.embed.mockResolvedValue([[1, 0], [0.99, 0.1]]);

            const created = await memoryService.extractMemories(USER_ID, 'I like hiking', 'test-model');

            expect(created).toHaveLength(1);
            await expect(Memory.countDocuments({ userId: USER_ID })).resolves.toBe(1);
            await expect(Memory.findOne({ userId: USER_ID })).resolves.toMatchObject({
                importance: 7,
                confidence: 0.86
            });
        });

        it('skips memories with missing embeddings', async () => {
            aiClient.respond.mockResolvedValue({
                message: {
                    role: 'assistant',
                    content: '{"memories":[{"type":"fact","content":"Likes hiking","importance":5,"confidence":0.9}]}'
                }
            });
            embedService.embed.mockResolvedValue([[]]);

            const memories = await memoryService.extractMemories(USER_ID, 'I like hiking', 'test-model');

            expect(memories).toEqual([]);
            await expect(Memory.countDocuments({ userId: USER_ID })).resolves.toBe(0);
        });
    });

    describe('markReferenced', () => {
        it('does nothing for an empty list of IDs', async () => {
            await expect(memoryService.markReferenced([])).resolves.toBeUndefined();
        });

        it('sets lastReferencedAt on the requested memories', async () => {
            const [memory] = await Memory.create(asMemories({ type: 'fact', content: 'Lives in Paris' }));

            await memoryService.markReferenced([memory.id]);

            await expect(Memory.findById(memory.id)).resolves.toMatchObject({
                lastReferencedAt: expect.any(Date)
            });
        });
    });

    describe('getPrompt', () => {
        it('returns an empty string when there are no memories', () => {
            const prompt = memoryService.getPrompt('Relevant memories', []);

            expect(prompt).toBe('');
        });

        it('adds the prefix and labels low-confidence memories as uncertain', async () => {
            const [certain, uncertain] = await Memory.create(asMemories(
                { type: 'fact', content: 'Lives in Paris', confidence: 0.9 },
                { type: 'goal', content: 'May move to Berlin', confidence: 0.6 }
            ));

            const prompt = memoryService.getPrompt('Relevant memories', [certain.toData(), uncertain.toData()]);

            expect(prompt).toBe('Relevant memories\n- Lives in Paris\n- May move to Berlin (uncertain)');
        });
    });
});

function asMemories(...data: Partial<MemoryData>[]) {
    return data.map(({
        userId = USER_ID,
        type = 'fact',
        embedding = [1, 0],
        importance = 5,
        confidence = 0.9,
        ...rest
    }) => ({
        userId,
        type,
        embedding,
        importance,
        confidence,
        ...rest
    }));
}