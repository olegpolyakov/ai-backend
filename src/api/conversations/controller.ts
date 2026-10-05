import type { Request, Response } from 'express';

import type { Context } from '@/context';

export default ({
    clients: { AI },
    models: { Conversation, Message }
}: Context) => ({
    async get(req: Request, res: Response) {
        const conversations = await Conversation
            .find({ userId: req.userId })
            .sort({ lastMessageAt: -1 });

        const data = await Promise.all(conversations.map(async conversation => {
            await conversation
                .populate({
                    path: 'lastMessage',
                    transform: message => message && ({
                        content: message.content,
                        createdAt: message.createdAt
                    })
                });

            const unreadMessagesCount = await Message.countDocuments({
                conversationId: conversation.id,
                userId: { $ne: req.userId },
                ...(conversation.viewedAt && {
                    createdAt: { $gt: conversation.viewedAt }
                })
            });

            return conversation.toData({ unreadMessagesCount });
        }));

        res.json({ ok: true, data });
    },

    async create(req: Request, res: Response) {
        const conversation = await Conversation.create({
            title: req.body.title,
            userId: req.userId
        });

        res.json({ ok: true, data: conversation });
    },

    async view(req: Request<{ conversationId: string }>, res: Response) {
        await Conversation.updateOne(
            {
                _id: req.params.conversationId,
                userIds: req.userId
            },
            { viewedAt: new Date() }
        );

        res.json({ ok: true });
    },

    async getMessages(req: Request<{ conversationId: string }>, res: Response) {
        const messages = await Message
            .find({ conversationId:  req.params.conversationId })
            .sort({ createdAt: 1 });

        const data = {
            messagesById: Object.fromEntries(messages.map(message => [message.id, message])),
            messagesInOrder: messages.map(message => message.id)
        };

        res.json({
            ok: true,
            data
        });
    },

    async createMessage(req: Request<{ conversationId: string }>, res: Response) {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ ok: false, message: 'Message is empty' });
        }

        const conversation = await Conversation.findOne({
            _id: req.params.conversationId,
            userId: req.userId
        });

        if (!conversation) {
            return res.status(404).json({ ok: false });
        }

        await Message.create({
            conversationId: conversation.id,
            role: 'user',
            content
        });

        const messages = await Message.find({ conversationId: conversation.id }).sort({ createdAt: 1 });

        const response = await AI.respond(messages);

        await Message.create({
            conversationId: conversation.id,
            role: 'assistant',
            content: response.message.content
        });

        res.json({
            ok: true,
            data: response.message
        });
    },

    async updateMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const message = await Message.findOne({
            _id: req.params.messageId,
            conversationId: req.params.conversationId,
            userId: req.userId
        });

        if (!message) {
            return res.status(404).json({ ok: false });
        }

        const hasContent = typeof req.body?.content === 'string';
        const content = hasContent ? req.body.content.trim() : undefined;

        if (hasContent && !content) {
            return res.status(400).json({ ok: false, message: 'Message is empty' });
        }

        if (hasContent && content !== message.content) {
            message.content = content ?? '';
            await message.save();
        }

        res.json({
            ok: true,
            data: message
        });
    },

    async deleteMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const message = await Message.findOne({
            _id: req.params.messageId,
            conversationId: req.params.conversationId,
            userId: req.userId
        });

        if (!message) {
            return res.status(404).json({ ok: false, message: 'Message not found' });
        }

        await message.deleteOne();

        res.json({
            ok: true,
            data: { id: req.params.messageId }
        });
    }
});