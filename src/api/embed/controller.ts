import type { Request, Response } from '@olegpolyakov/backend/server';

import type { Context } from '@/context';

export default ({ services: { Embed } }: Context) => ({
    async embed(req: Request, res: Response) {
        const {
            input,
            model
        } = req.body as {
            input: string;
            model: string;
        };

        if (!input) {
            return res.status(400).json({ error: 'Input is required' });
        }

        if (!model) {
            return res.status(400).json({ error: 'Model is required' });
        }

        try {
            const embedding = await Embed.embed(input, model);

            return res.send({
                ok: true,
                data: embedding
            });
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