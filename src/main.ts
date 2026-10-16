import Db from '@olegpolyakov/backend/db';
import Changes from '@olegpolyakov/backend/db/changes';
import { OllamaClient, OpenAIClient } from '@olegpolyakov/backend/features/ai';
import { auth } from '@olegpolyakov/backend/features/auth';
import Server from '@olegpolyakov/backend/server';
import Ws from '@olegpolyakov/backend/server/ws';

import Api from './api';
import ChangeHandler from './changes';
import Context from './context';
import * as schemas from './schemas';
import Services from './services';

const {
    DOMAIN = '',
    HOST = 'localhost',
    PORT = 3000,
    DB_URL = '',
    COOKIE_SECRET = '',
    JWT_SECRET = '',
    OLLAMA_API_KEY = '',
    OPENAI_API_KEY = '',
    OPENAI_API_URL = ''
} = process.env;

// const toolsBaseUrl = 'http://tasks.olegpoliakov.local:3002/ai'; 
// const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ZjFjYzliZC0xNTIwLTQwNzMtYTFiZi1mNjRhYTFjYmQ5MjkiLCJpYXQiOjE3OTEzNTE3MTYsImV4cCI6MTc5MTk1NjUxNn0.INL4-ow7STTr5Nai92ZbOoifq748m9-14gxHSBBu6X4';

const ollamaClient = new OllamaClient({
    apiKey: OLLAMA_API_KEY,
    model: 'gemma4:31b-cloud'
});
const openAIClient = new OpenAIClient({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_API_URL,
    model: 'qwen3.8-flash'
});

const { models } = await Db(DB_URL, schemas, { debug: false }).connect();

const services = Services(ollamaClient, models);

const context = Context({
    models,
    services
}).build();

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
    .plugin(Ws({ path: '/ws', jwtSecret: JWT_SECRET }, [Changes(models, ChangeHandler(context))]))
    .start(() => {
        console.info(`Server is running on ${HOST}:${PORT}`);
    });