import ollama from 'ollama';

export default class EmbedService {
    private model: string = 'embeddinggemma';

    async embed(input: string | string[], model: string = this.model): Promise<number[][]> {
        const result = await ollama.embed({ input, model });
        return result.embeddings;
    }
}