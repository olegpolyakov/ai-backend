import type { Request, Response } from 'express';

import { NotFoundError } from '@olegpolyakov/backend/server';

import type { Context } from '@/context';

export default ({
    models: { Conversation, Message },
    services: { Chat }
}: Context) => ({
    async list(req: Request, res: Response) {
        const conversations = await Conversation
            .find({ userId: req.userId })
            .sort({ lastMessageAt: -1 })
            .populate({
                path: 'lastMessage',
                transform: message => message && ({
                    content: message.content,
                    createdAt: message.createdAt
                })
            });

        const data = await Promise.all(conversations.map(async conversation => {
            const unreadMessagesCount = await Message.countDocuments({
                conversationId: conversation.id,
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


    async update(req: Request<{ conversationId: string }>, res: Response) {
        const { conversationId } = req.params;
        const { title, description } = req.body;

        if (!title && !description) {
            return res.status(400).json({
                ok: false,
                message: 'No fields to update'
            });
        }

        const conversation = await Conversation.update(
            {
                _id: conversationId,
                userId: req.userId
            },
            { title, description }
        );

        if (!conversation) throw new NotFoundError('Conversation not found');

        res.json({ ok: true, data: conversation });
    },

    async delete(req: Request<{ conversationId: string }>, res: Response) {
        await Conversation.deleteOne({
            _id: req.params.conversationId,
            userId: req.userId
        });

        await Message.deleteMany({
            conversationId: req.params.conversationId
        });

        res.json({ ok: true });
    },

    async view(req: Request<{ conversationId: string }>, res: Response) {
        await Conversation.updateOne(
            {
                _id: req.params.conversationId,
                userId: req.userId
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
        const userId = req.userId!;
        const { conversationId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                ok: false,
                message: 'Content is required'
            });
        }

        try {
            const message = await Chat.sendMessage(userId, conversationId, content);

            res.json({ ok: true, data: message });
        } catch (error) {
            if (error instanceof NotFoundError) {
                return res.status(404).json({
                    ok: false,
                    message: error.message
                });
            }

            throw error;
        }
    },

    async updateMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const content = typeof req.body?.content === 'string'
            ? req.body.content.trim()
            : undefined;

        if (!content) {
            return res.status(400).json({ ok: false, message: 'Content is required' });
        }

        const conversation = await Conversation.exists({
            _id: req.params.conversationId,
            userId: req.userId
        });

        if (!conversation) throw new NotFoundError('Conversation not found');

        const message = await Message.update({
            _id: req.params.messageId,
            conversationId: req.params.conversationId
        }, {
            content
        });

        if (!message) throw new NotFoundError('Message not found');

        res.json({
            ok: true,
            data: message
        });
    },

    async deleteMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const { conversationId, messageId } = req.params;

        const conversation = await Conversation.exists({
            _id: conversationId,
            userId: req.userId
        });

        if (!conversation) throw new NotFoundError('Conversation not found');

        const message = await Message.delete({
            _id: messageId,
            conversationId: conversationId
        });

        if (!message) throw new NotFoundError('Message not found');

        res.json({
            ok: true,
            data: { id: message.id }
        });
    }
});