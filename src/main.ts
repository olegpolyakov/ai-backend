import Db from '@olegpolyakov/backend/db';
import Changes from '@olegpolyakov/backend/db/changes';
import { auth } from '@olegpolyakov/backend/features/auth';
import Server from '@olegpolyakov/backend/server';
import Ws from '@olegpolyakov/backend/server/ws';

import Api from './api';
import ChangeHandler from './changes';
import Context from './context';
import Models from './models';
import Services from './services';

const {
    DOMAIN = '',
    HOST = 'localhost',
    PORT = 3000,
    DB_URL = '',
    COOKIE_SECRET = '',
    JWT_SECRET = ''
} = process.env;

const db = await Db(DB_URL).connect();
const models = Models(db);
const services = Services(models);
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