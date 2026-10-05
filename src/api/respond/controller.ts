import type { Request, Response } from 'express';

import type { Message } from '@/clients/client';
import type Context from '@/context';

export default ({ clients: { AI } }: Context) => ({
    async respond(req: Request, res: Response) {
        // const userId = (req as { userId: string }).userId;

        const {
            messages,
            model = 'gemma4:31b-cloud',
            stream = false
        } = req.body as {
            messages: Message[];
            model: string;
            stream: boolean;
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

                const response = await AI.respond(messages, {
                    model
                });

                return res.send(response.message);
            }
        } catch (error) {
            console.error('AI stream error:', error);

            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to process request' });
            } else {
                res.end();
            }
        }
    }
});