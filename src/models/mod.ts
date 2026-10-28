import { createModels, Db, Models as _Models } from '@olegpolyakov/backend/db';

import { ConversationSchema as Conversation } from './conversation';
import { MemorySchema as Memory } from './memory';
import { MessageSchema as Message } from './message';

const schemas = {
    Conversation,
    Memory,
    Message
};

export type Models = _Models<typeof schemas>;

export default (db: Db) => createModels(db.connection, schemas);