import type { FileContent, ImageContent, Message } from '@olegpolyakov/ai-core';
import type { UploadedFile } from '@olegpolyakov/backend/features/upload';
import type { Request, Response } from '@olegpolyakov/backend/server';
import type { EntityRef } from '@olegpolyakov/core/objects/ref';
import type { JsonSchema } from '@olegpolyakov/core/utils/schema';
import { isArray, isString } from '@olegpolyakov/core/utils/types';
import { NIL, v3 as uuid } from '@olegpolyakov/core/utils/uuid';

import type { Context } from '@/context';

export default ({
    models: { Message },
    services: { AI }
}: Context) => ({
    async respond(req: Request, res: Response) {
        let {
            input,
            model = '',
            stream = false,
            format
        } = req.body as {
            input: string | (Message & { refs: EntityRef[] })[];
            model: string;
            stream: boolean;
            format?: 'json' | JsonSchema;
        };

        input = buildInput(input, req.files);

        if (stream) {
            // TODO Enable streaming
            // res.setHeader('Content-Type', 'text/event-stream');
            // res.setHeader('Connection', 'keep-alive');
            // res.setHeader('Transfer-Encoding', 'chunked');
            // res.setHeader('Cache-Control', 'no-cache');

            // const stream = await ollama.chat({
            //     model,
            //     messages,
            //     stream: true,
            //     tools: tools.definitions
            // });

            // for await (const chunk of stream) {
            //     res.write(JSON.stringify(chunk.message) + '\n');
            // }

            // res.end();
        } else {
            res.setHeader('Content-Type', 'application/json');

            const response = await AI.respond(input, {
                model,
                format
            });

            const data = new Message({
                ...response.message,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            return res.send({
                ok: true,
                data
            });
        }
    }
});

function buildInput(
    input: string | (Message & { refs: EntityRef[] })[],
    files?: UploadedFile[] | { [fieldname: string]: UploadedFile[]; }
): string | (Message & { refs: EntityRef[] })[] {
    if (isString(input)) {
        try {
            input = JSON.parse(input);
        } catch {}
    }
        
    if (isArray(input) && isArray(files)) {
        const filesMap = Object.fromEntries(files.map(file => [uuid(file.originalname, NIL), file]));

        return input.map(item => {
            if (item.refs?.length === 0) return item;

            return {
                ...item,
                content: [
                    { type: 'text', content: item.content as string },
                    ...item.refs.map(ref => {
                        const file = filesMap[ref.id];
                        const buffer = file.buffer;

                        return file.mimetype.includes('image/')
                            ? {
                                type: 'image',
                                url: `data:${file.mimetype};base64,${buffer.toString('base64')}`
                            } as ImageContent
                            : {
                                type: 'file',
                                name: file.originalname,
                                content: `data:${file.mimetype};base64,${buffer.toString('base64')}`
                            } as FileContent;
                    })
                ]
            };
        });
    }

    return input;
}