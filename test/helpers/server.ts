import cookies from 'cookie-parser';
import express, { Application } from 'express';
import session, { Session } from 'express-session';
import type { Server } from 'http';
import { afterAll, beforeAll, vi } from 'vitest';

import type { Next, Request, Response, ServerError } from '@olegpolyakov/server';

import type Context from '../../src/context.ts';

export const {
    HOST = 'localhost',
    PORT = 3000
} = process.env;

export function withServer(config: Context['config'], setup?: (app: Application) => void): Application {
    const app = express();
    let server: Server;

    beforeAll(() => {
        app.set('config', config);

        app.use(express.json());
        app.use(cookies());
        app.use(session({
            secret: config.sessionSecret,
            resave: false,
            saveUninitialized: false
        }));

        if (setup) {
            setup(app);
        }

        app.use((error: ServerError, req: Request, res: Response, next: Next) => {
            console.error(error);
            res.status(error.statusCode || 500).json({ error: error.message });
        });

        server = app.listen(Number(PORT), HOST, () => {
            console.log(`Server started at http://${HOST}:${PORT}`);
        });
    });

    afterAll(() => {
        server.close(() => {
            console.log('Server stopped');
        });
    });

    return app;
}

export function mockSession(): Session {
    return {
        regenerate: vi.fn((callback: (err: Error | null) => void) => callback(null)),
        save: vi.fn((callback: (err: Error | null) => void) => callback(null))
    } as unknown as Session;
}

export function mockRequest<T>({ body, headers = {} }: {body?: T, headers?: Record<string, string>} = {}): Request {
    return {
        body,
        headers,
        session: mockSession()
    } as unknown as Request;
}

export function mockResponse(): Response {
    return {
        json: vi.fn(),
        redirect: vi.fn(),
        status: vi.fn().mockReturnThis(),
        end: vi.fn()
    } as unknown as Response;
}

export function mockNext(): Next {
    return vi.fn();
}