import type { Request, Response } from 'express';

import type { JsonSchema } from '@olegpolyakov/core/utils/schema';

import type { Context } from '@/context';

export default ({ services: { AI } }: Context) => ({
    async respond(req: Request, res: Response) {
        const {
            prompt,
            model = 'gemma4:31b-cloud',
            stream = false,
            format
        } = req.body as {
            prompt: string;
            model: string;
            stream: boolean;
            format?: 'json' | JsonSchema;
        };

        try {
            if (stream) {
                // TODO Enable streaming
                // res.setHeader('Content-Type', 'text/event-stream');
                // res.setHeader('Connection', 'keep-alive');
                // res.setHeader('Transfer-Encoding', 'chunked');
                // res.setHeader('Cache-Control', 'no-cache');

                // const stream = await ollama.chat({
                //     model,
                //     messages,
                //     stream: true,
                //     tools: tools.definitions
                // });

                // for await (const chunk of stream) {
                //     res.write(JSON.stringify(chunk.message) + '\n');
                // }

                // res.end();
            } else {
                res.setHeader('Content-Type', 'application/json');

                const response = await AI.respond(req.userId!, prompt, {
                    model,
                    format
                });

                return res.send({ ok: true, data: response });
            }
        } catch (error) {
            console.error('AI error:', error);

            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to process request' });
            } else {
                res.end();
            }
        }
    }
});