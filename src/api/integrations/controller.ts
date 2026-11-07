import type { Request, Response } from 'express';

import { getUserId } from '@olegpolyakov/backend/features/auth';

import type { Context } from '@/context';

export default ({ models: { Integration } }: Context) => ({
    async list(req: Request, res: Response) {
        const userId = getUserId(req);
        const integrations = await Integration.find({ userId });

        res.send({
            ok: true,
            data: integrations
        });
    },

    async create(req: Request, res: Response) {
        const userId = getUserId(req);
        const integration = await Integration.create({
            userId,
            ...req.body
        });

        res.send({
            ok: true,
            data: integration
        });
    },

    async update(req: Request, res: Response) {
        const userId = getUserId(req);
        const integration = await Integration.update({
            _id: req.params.id,
            userId
        }, req.body);

        res.send({
            ok: true,
            data: integration
        });
    },

    async delete(req: Request, res: Response) {
        const userId = getUserId(req);
        const integration = await Integration.delete({
            _id: req.params.id,
            userId
        });

        res.send({
            ok: true,
            data: integration
        });
    }
});