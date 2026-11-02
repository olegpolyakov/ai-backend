import { Router } from 'express';

import { uploadMiddleware } from '@olegpolyakov/backend/features/upload';

import type { Context } from '@/context';

import Controller from './controller';

export default (context: Context) => {
    const router = Router();
    const controller = Controller(context);
    const upload = uploadMiddleware();

    router.post('/', upload.multiple, controller.respond);

    return router;
};