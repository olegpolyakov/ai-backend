import { auth } from '@olegpolyakov/backend/features/auth';
import Server from '@olegpolyakov/backend/server';
import Ws from '@olegpolyakov/backend/server/ws';

import Api from './api';
import type Context from './context';
import Db from './db';
import DbChanges from './db/changes';
import Services from './services';

const {
    DOMAIN = '',
    HOST = 'localhost',
    PORT = 3000,
    DB_CONNECTION_STRING = '',
    COOKIE_SECRET = '',
    JWT_SECRET = ''
} = process.env;

const db = Db(DB_CONNECTION_STRING, { debug: false });
await db.connect();

const models = db.models;
const services = await Services(models);

const context: Context = {
    models,
    services
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