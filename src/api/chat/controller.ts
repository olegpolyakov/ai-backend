import type { Request, Response } from 'express';

import type { Context } from '@/context';

export default ({
    clients: { AI },
    models: { Message }
}: Context) => ({
    async post(req: Request, res: Response) {
        const { conversationId, message } = req.body;

        await Message.create({
            conversationId,
            role: 'user',
            content: message
        });

        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

        const response = await AI.respond(messages);

        await Message.create({
            conversationId,
            role: 'assistant',
            content: response.message.content
        });

        res.status(200).send({ success: true });
    }
});