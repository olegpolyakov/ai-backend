import type { Request, Response } from 'express';

import type { Context } from '@/context';

export default ({
    models: { Memory }
}: Context) => ({
    async get(req: Request, res: Response) {
        const memories = await Memory
            .find({ userId: req.userId })
            .sort({ importance: -1 });

        const data = memories.map(memory => memory.toJSON());

        res.json({ ok: true, data });
    },

    async create(req: Request, res: Response) {
        const memory = await Memory.create({
            ...req.body,
            userId: req.userId
        });

        res.json({ ok: true, data: memory });
    },

    async update(req: Request<{ memoryId: string }>, res: Response) {
        if (!req.body?.content) {
            return res.status(400).json({ ok: false, message: 'Content is empty' });
        }

        const memory = await Memory.update({
            _id: req.params.memoryId,
            userId: req.userId
        }, {
            content: req.body.content?.trim() ?? ''
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
            return res.status(404).json({ ok: false, message: 'Memory not found' });
        }

        res.json({
            ok: true,
            data: { id: memory._id }
        });
    }
});