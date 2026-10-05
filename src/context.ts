import type { Models } from './db';
import type { Client } from './llm';
import type ChatService from './services/chat';

export type Context = {
    clients: {
        AI: Client,
    },
    services: {
        Chat: ChatService,
    },
    models: Models;
};

export default Context;