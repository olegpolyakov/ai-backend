import type { Request, Response } from 'express';

import type { Context } from '@/context';

export default ({ services: { AI } }: Context) => ({
    async list(req: Request, res: Response) {
        const models = await AI.getModels();

        return res.send({ ok: true, data: models });
    }
});