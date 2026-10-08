import type { Models } from './db';
import type { Services } from './services';

export type Context = {
    models: Models;
    services: Services;
};

export default Context;