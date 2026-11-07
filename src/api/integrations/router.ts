import { Router } from 'express';

import type { Context } from '@/context';

import Controller from './controller';

export default (context: Context) => {
    const router = Router();
    const controller = Controller(context);

    router.route('/')
        .get(controller.list)
        .post(controller.create);

    router.route('/:id')
        .put(controller.update)
        .delete(controller.delete);

    return router;
};