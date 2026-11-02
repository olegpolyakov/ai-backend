import { type NextFunction, type Request, type Response, Router } from 'express';

import type { Context } from '@/context';

import conversations from './conversations'; 
import embed from './embed';
import memories from './memories';
import models from './models';
import respond from './respond';

export default (context: Context) => {
    const router = Router();

    router.use('/conversations', conversations(context));
    router.use('/embed', embed(context));
    router.use('/memories', memories(context));
    router.use('/models', models(context));
    router.use('/respond', respond(context));

    router.use((error: Error & { code?: number; status?: number }, req: Request, res: Response, next: NextFunction) => {
        console.error(error);

        if (res.headersSent) {
            return next(error);
        }

        const status = Number(error.code) || Number(error.status) || 500;

        res.status(status).send({
            error: error.message
        });
    });

    return router;
};