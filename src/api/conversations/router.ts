import { Router } from 'express';

import type { Context } from '@/context';

import Controller from './controller';

export default (context: Context) => {
    const router = Router();
    const controller = Controller(context);

    router.route('/')
        .get(controller.get)
        .post(controller.create);

    router.route('/:conversationId')
        .patch(controller.update)
        .delete(controller.delete);

    router.route('/:conversationId/view')
        .patch(controller.view);

    router.route('/:conversationId/messages')
        .get(controller.getMessages)
        .post(controller.createMessage);

    router.route('/:conversationId/messages/:messageId')
        .patch(controller.updateMessage)
        .delete(controller.deleteMessage);

    return router;
};