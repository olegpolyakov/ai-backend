import { BadRequestError, Request, Response } from '@olegpolyakov/backend/server';

import type { Context } from '@/context';

const HISTORY_LIMIT = 25;

export default ({
    models: { Conversation, Message },
    services: { Chat, Memory }
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
                role: 'assistant',
                ...(conversation.viewedAt && {
                    createdAt: { $gt: conversation.viewedAt }
                })
            });

            return conversation.toData({ unreadMessagesCount });
        }));

        res.json({
            ok: true,
            data
        });
    },

    async create(req: Request, res: Response) {
        const { title } = req.body;

        const conversation = await Conversation.create({
            title,
            userId: req.userId
        });

        res.json({
            ok: true,
            data: conversation
        });
    },


    async update(req: Request<{ conversationId: string }>, res: Response) {
        const { conversationId } = req.params;
        const { title, description, model } = req.body;

        if (!title && !description && !model) throw new BadRequestError('No fields to update');

        const conversation = await Conversation.update({
            _id: conversationId,
            userId: req.userId
        }, {
            title, description, model
        });

        res.json({
            ok: true,
            data: conversation
        });
    },

    async delete(req: Request<{ conversationId: string }>, res: Response) {
        const { conversationId } = req.params;

        await Conversation.deleteOne({
            _id: conversationId,
            userId: req.userId
        });

        await Message.deleteMany({
            conversationId
        });

        res.json({ ok: true });
    },

    async view(req: Request<{ conversationId: string }>, res: Response) {
        const { conversationId } = req.params;

        await Conversation.updateOne({
            _id: conversationId,
            userId: req.userId
        }, {
            viewedAt: new Date()
        });

        res.json({ ok: true });
    },

    async getMessages(req: Request<{ conversationId: string }>, res: Response) {
        const { conversationId } = req.params;

        const messages = await Message
            .find({ conversationId })
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
        const authToken = req.authToken!;
        const { conversationId } = req.params;
        const { content, refs } = req.body;

        if (!content && !refs) throw new BadRequestError(
            'The message can not be empty'
        );

        const conversation = await Conversation.get({
            _id: conversationId,
            userId
        });

        const userMessage = await Message.create({
            conversationId,
            role: 'user',
            content,
            refs
        });

        const messages = await Message
            .find({ conversationId })
            .select('role content refs')
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .lean();

        const message = await Chat.reply({
            userId,
            accessToken: authToken,
            messages: messages.toReversed(),
            model: conversation.model
        });

        const assistantMessage = await Message.create({
            conversationId,
            ...message
        });

        void Memory.extractMemories(
            userId,
            content,
            conversation.model,
            [userMessage.id, assistantMessage.id]
        ).catch(error => {
            console.error('Memory extraction failed:', error);
        });

        res.json({
            ok: true,
            data: message
        });
    },

    async updateMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const { conversationId, messageId } = req.params;
        const { content } = req.body;

        if (!content) throw new BadRequestError('Content is required');

        const conversation = await Conversation.get({
            _id: conversationId,
            userId: req.userId
        }, '_id');

        const message = await Message.update({
            _id: messageId,
            conversationId: conversation.id
        }, {
            content
        });

        res.json({
            ok: true,
            data: message
        });
    },

    async deleteMessage(req: Request<{ conversationId: string; messageId: string }>, res: Response) {
        const { conversationId, messageId } = req.params;

        const conversation = await Conversation.get({
            _id: conversationId,
            userId: req.userId
        }, '_id');

        const message = await Message.delete({
            _id: messageId,
            conversationId: conversation.id
        });

        res.json({
            ok: true,
            data: { id: message.id }
        });
    }
});