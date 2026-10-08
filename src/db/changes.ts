import { WebSocket, WebSocketServer } from 'ws';

import type Context from '@/context';

export default ({ models: { Conversation, Message } }: Context) => (wss: WebSocketServer, clients: WeakMap<WebSocket, string>): WebSocketServer => {
    const models = [Conversation, Message];
    const pipeline = [{
        $match: { operationType: { $in: ['insert', 'update', 'delete'] } }
    }];
    const options = {
        fullDocument: 'updateLookup', // ensures the full document is returned on updates
        hydrate: true
    };

    models.forEach(model => {
        const changeStream = model.watch(pipeline, options); 

        changeStream.on('change', event => {
            const documentId = event.documentKey._id.toString();
            const payload = JSON.stringify({
                model: model.modelName,
                action: event.operationType,
                documentId,
                data: event.fullDocument
            });

            wss.clients.forEach(async client => {
                const userId = clients.get(client);

                if (client.readyState !== WebSocket.OPEN) return;

                if (model.modelName === 'Message') {
                    const message = await Message.findOne({ _id: documentId });
                    const conversation = await Conversation.findOne({ _id: message?.get('conversationId'), userId });

                    if (!conversation) return;

                    client.send(payload);
                }

                if (model.modelName === 'Conversation') {
                    const conversation = await Conversation.findOne({ _id: documentId, userId });

                    if (!conversation) return;

                    client.send(payload);
                }
            });
        });

        changeStream.on('error', error => {
            console.error('Change Stream Error:', error);
        });
    });

    return wss;
};