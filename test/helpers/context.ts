import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

import createDb, { Db } from '@olegpolyakov/db';
import { Schemas, schemas } from '@olegpolyakov/auth/db';

import type Context from '../../src/context.ts';
import AuthService from '../../src/service.ts';

export function withContext() {
    let mongo: MongoMemoryServer;
    let db: Db<Schemas>;
    let context = {
        config: {
            jwtSecret: 'test-jwt-secret',
            sessionSecret: 'test-session-key'
        }
    } as Context;

    beforeAll(async () => {
        mongo = await createMongo();
        db = await createDb(mongo.getUri(), schemas, { debug: false });
        mongoose.models.User = db.models.User;
        context = Object.assign(context, {
            models: db.models,
            services: {
                Auth: AuthService(db.models)
            }
        });
    }, 120000);

    afterAll(async () => {
        if (!db || !mongo) return;

        await db.connection.dropDatabase();
        await db.connection.close();
        await mongo.stop();
    }, 120000);

    return context;
}

const MONGO_VERSION_CANDIDATES = [
    process.env.MONGOMS_VERSION,
    '7.0.14',
    '7.0.5'
].filter((version, index, array): version is string => Boolean(version) && array.indexOf(version) === index);

async function createMongo(): Promise<MongoMemoryServer> {
    process.env.MONGOMS_DEBUG ??= '1';

    let lastError: unknown;

    for (const version of MONGO_VERSION_CANDIDATES) {
        try {
            return await MongoMemoryServer.create({
                binary: { version },
                instance: {
                    storageEngine: 'wiredTiger'
                }
            });
        } catch (error) {
            lastError = error;
            console.error(`MongoMemoryServer failed to start with MongoDB ${version}`);
        }
    }

    throw lastError;
}