import { type NextFunction, type Request, type Response, Router } from 'express';

import type { Context } from '@/context';

import conversations from './conversations'; 
import memories from './memories';
import respond from './respond';

export default (context: Context) => {
    const router = Router();

    router.use('/conversations', conversations(context));
    router.use('/memories', memories(context));
    router.use('/respond', respond(context));

    router.use((error: Error & { code?: number; status?: number }, req: Request, res: Response, next: NextFunction) => {
        console.error(error);

        if (res.headersSent) {
            return next(error);
        }

        res.status(error.code || error.status || 500).send({
            error: error.message
        });
    });

    return router;
};