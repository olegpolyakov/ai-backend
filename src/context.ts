import Context from '@olegpolyakov/backend/context';

import type { Models } from './models';
import type { Services } from './services';

export type Context = {
    models: Models;
    services: Services;
};

export default (value: Context) => Context<Context>(value);