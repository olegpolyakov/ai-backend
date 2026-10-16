import Context from '@olegpolyakov/backend/context';
import { Models } from '@olegpolyakov/backend/db';

import * as schemas from './schemas';
import type { Services } from './services';

export type Context = {
    models: Models<typeof schemas>;
    services: Services;
};

export default (value: Context) => Context<Context>(value);