import type { Request, Response } from '@olegpolyakov/backend/server';

import type { Context } from '@/context';

export default ({
    models: { Memory },
    services: { Embed }
}: Context) => ({
    async get(req: Request, res: Response) {
        const memories = await Memory
            .find({ userId: req.userId })
            .sort({ importance: -1 });

        res.json({
            ok: true,
            data: memories.map(memory => memory.toJSON())
        });
    },

    async create(req: Request, res: Response) {
        const memory = await Memory.create({
            ...req.body,
            userId: req.userId
        });

        res.json({
            ok: true,
            data: memory
        });
    },

    async update(req: Request<{ memoryId: string }, unknown, { content: string }>, res: Response) {
        const content = req.body.content?.trim() ?? '';

        if (!content) {
            return res.status(400).json({
                ok: false,
                message: 'Content is empty'
            });
        }

        const [embedding] = await Embed.embed(content);

        if (!embedding) {
            throw new Error('Failed to generate memory embedding');
        }

        const memory = await Memory.update({
            _id: req.params.memoryId,
            userId: req.userId
        }, {
            content,
            embedding
        });

        if (!memory) {
            return res.status(404).json({ ok: false });
        }

        res.json({
            ok: true,
            data: memory
        });
    },

    async delete(req: Request<{ memoryId: string }>, res: Response) {
        const memory = await Memory.delete({
            _id: req.params.memoryId,
            userId: req.userId
        });

        if (!memory) {
            return res.status(404).json({
                ok: false,
                message: 'Memory not found'
            });
        }

        res.json({
            ok: true,
            data: { id: memory.id }
        });
    }
});