import { auth } from '@olegpolyakov/backend/features/auth';
import Server from '@olegpolyakov/backend/server';
import Ws from '@olegpolyakov/backend/server/ws';

// import Ws from '@olegpolyakov/backend/server/ws';
import Api from './api';
import type Context from './context';
import Db from './db';
import DbChanges from './db/changes';
import { Ollama } from './llm';
import type ChatService from './services/chat';

const {
    DOMAIN = '',
    HOST = 'localhost',
    PORT = 3000,
    DB_CONNECTION_STRING = '',
    COOKIE_SECRET = '',
    JWT_SECRET = '',
    OLLAMA_API_KEY = ''
} = process.env;

const db = Db(DB_CONNECTION_STRING, { debug: true });

await db.connect();

const context: Context = {
    clients: {
        AI: Ollama(OLLAMA_API_KEY)
    },
    models: db.models,
    services: {
        Chat: {} as ChatService
    }
};

Server({
    host: HOST,
    port: PORT,
    cookies: {
        secret: COOKIE_SECRET
    },
    cors: {
        domain: DOMAIN
    },
    json: true
})
    .use(auth({ jwtSecret: JWT_SECRET }))
    .use('/api', Api(context))
    .plugin(Ws({ path: '/ws' }, [DbChanges(context)]))
    .start(() => {
        console.info(`Server is running on ${HOST}:${PORT}`);
    });