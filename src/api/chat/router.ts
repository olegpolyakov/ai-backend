import { Router } from 'express';

import type { Context } from '@/context';

import Controller from './controller';

export default (context: Context) => {
    const router = Router();
    const controller = Controller(context);

    router.post('/', controller.post);

    return router;
};