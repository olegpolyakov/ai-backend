import type { Models } from '@/models';
import type { Services } from '@/services';

import conversation from './conversation';

export default (models: Models, services: Services) => {
    conversation(models, services);
};